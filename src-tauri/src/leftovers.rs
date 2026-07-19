// Finds and removes orphaned files/folders, shortcuts, and registry keys/values
// left behind after an uninstall, using a fuzzy (case-insensitive,
// punctuation-stripped) match on the program name and publisher.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverItem {
    pub path_or_key: String,
    /// "folder" | "shortcut" | "registry" | "registry_value"
    pub kind: String,
    pub size_bytes: u64,
    /// Set only for kind == "registry_value": the value name to delete.
    #[serde(default)]
    pub value_name: Option<String>,
}

impl LeftoverItem {
    fn folder(path: String, size: u64) -> Self {
        Self { path_or_key: path, kind: "folder".into(), size_bytes: size, value_name: None }
    }
    fn shortcut(path: String, size: u64) -> Self {
        Self { path_or_key: path, kind: "shortcut".into(), size_bytes: size, value_name: None }
    }
    fn registry(key: String) -> Self {
        Self { path_or_key: key, kind: "registry".into(), size_bytes: 0, value_name: None }
    }
    fn registry_value(key: String, value: String) -> Self {
        Self { path_or_key: key, kind: "registry_value".into(), size_bytes: 0, value_name: Some(value) }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LeftoverReport {
    pub items: Vec<LeftoverItem>,
    pub total_size_bytes: u64,
}

/// Lowercase + strip everything that isn't alphanumeric.
fn normalize(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .collect()
}

/// Recursively sum the size of a directory's files. Unreadable entries and
/// symlinks are skipped (avoids following junctions into loops).
fn dir_size(path: &Path) -> u64 {
    let mut total = 0;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_symlink() {
                continue;
            }
            if file_type.is_dir() {
                total += dir_size(&entry.path());
            } else if let Ok(meta) = entry.metadata() {
                total += meta.len();
            }
        }
    }
    total
}

/// Does a folder/shortcut name look like it belongs to this app/publisher?
fn folder_matches(folder_norm: &str, name_norm: &str, pub_norm: &str) -> bool {
    if folder_norm.is_empty() {
        return false;
    }
    if !name_norm.is_empty() && name_norm.len() >= 3 {
        if folder_norm == name_norm || folder_norm.contains(name_norm) {
            return true;
        }
    }
    if !pub_norm.is_empty() && pub_norm.len() >= 4 && folder_norm == pub_norm {
        return true;
    }
    false
}

/// Insert a leftover item, de-duplicated by `seen_key`.
fn add(
    items: &mut Vec<LeftoverItem>,
    seen: &mut HashSet<String>,
    seen_key: &str,
    item: LeftoverItem,
) {
    if seen.insert(seen_key.to_string()) {
        items.push(item);
    }
}

/// Recursively collect `.lnk` files under a directory (bounded depth).
fn collect_lnks(dir: &Path, depth: u32, out: &mut Vec<PathBuf>) {
    if depth > 5 {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(ft) = entry.file_type() else {
            continue;
        };
        if ft.is_dir() {
            collect_lnks(&path, depth + 1, out);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.eq_ignore_ascii_case("lnk"))
            .unwrap_or(false)
        {
            out.push(path);
        }
    }
}

#[tauri::command]
pub fn scan_leftovers(
    name: String,
    publisher: String,
    install_location: Option<String>,
) -> Result<LeftoverReport, String> {
    let name_norm = normalize(&name);
    let pub_norm = normalize(&publisher);
    let mut items: Vec<LeftoverItem> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // 1. Fuzzy-match immediate subfolders of the common data + program roots.
    for var in [
        "APPDATA",
        "LOCALAPPDATA",
        "ProgramData",
        "ProgramFiles",
        "ProgramFiles(x86)",
    ] {
        let Ok(base) = std::env::var(var) else {
            continue;
        };
        let Ok(entries) = std::fs::read_dir(PathBuf::from(&base)) else {
            continue;
        };
        for entry in entries.flatten() {
            if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                continue;
            }
            let folder_name = entry.file_name().to_string_lossy().to_string();
            if folder_matches(&normalize(&folder_name), &name_norm, &pub_norm) {
                let path = entry.path();
                let size = dir_size(&path);
                let key = path.to_string_lossy().to_string();
                add(&mut items, &mut seen, &key, LeftoverItem::folder(key.clone(), size));
            }
        }
    }

    // 2. The original install location, if it survived the uninstall.
    if let Some(loc) = install_location.as_deref() {
        let path = PathBuf::from(loc);
        if !loc.trim().is_empty() && path.is_dir() {
            let size = dir_size(&path);
            let key = path.to_string_lossy().to_string();
            add(&mut items, &mut seen, &key, LeftoverItem::folder(key.clone(), size));
        }
    }

    // 3. Leftover shortcuts (.lnk) in the Start Menu and on the desktops.
    let mut shortcut_dirs: Vec<PathBuf> = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        shortcut_dirs.push(PathBuf::from(appdata).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(pd) = std::env::var("ProgramData") {
        shortcut_dirs.push(PathBuf::from(pd).join(r"Microsoft\Windows\Start Menu\Programs"));
    }
    if let Ok(up) = std::env::var("USERPROFILE") {
        shortcut_dirs.push(PathBuf::from(up).join("Desktop"));
    }
    if let Ok(public) = std::env::var("PUBLIC") {
        shortcut_dirs.push(PathBuf::from(public).join("Desktop"));
    }
    for dir in shortcut_dirs {
        let mut lnks = Vec::new();
        collect_lnks(&dir, 0, &mut lnks);
        for lnk in lnks {
            let stem = lnk
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();
            if folder_matches(&normalize(&stem), &name_norm, &pub_norm) {
                let size = lnk.metadata().map(|m| m.len()).unwrap_or(0);
                let key = lnk.to_string_lossy().to_string();
                add(&mut items, &mut seen, &key, LeftoverItem::shortcut(key.clone(), size));
            }
        }
    }

    // 4. Leftover registry keys under Software\{publisher}\{name} and Software\{name}.
    #[cfg(windows)]
    {
        let mut candidates: Vec<String> = Vec::new();
        if !publisher.trim().is_empty() && !name.trim().is_empty() {
            candidates.push(format!(r"Software\{}\{}", publisher.trim(), name.trim()));
        }
        if !name.trim().is_empty() {
            candidates.push(format!(r"Software\{}", name.trim()));
        }

        for (root, label) in [
            (RegKey::predef(HKEY_CURRENT_USER), "HKCU"),
            (RegKey::predef(HKEY_LOCAL_MACHINE), "HKLM"),
        ] {
            for sub in &candidates {
                if root.open_subkey(sub).is_ok() {
                    let full = format!("{label}\\{sub}");
                    add(&mut items, &mut seen, &full.clone(), LeftoverItem::registry(full));
                }
            }
        }

        // 5. Leftover Run / RunOnce startup values (HKCU + HKLM, 64-bit + WOW node).
        let install_loc_lower = install_location
            .as_deref()
            .map(|s| s.trim().to_lowercase())
            .filter(|s| !s.is_empty());

        let run_keys = [
            (HKEY_CURRENT_USER, "HKCU", r"Software\Microsoft\Windows\CurrentVersion\Run"),
            (HKEY_CURRENT_USER, "HKCU", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
            (HKEY_CURRENT_USER, "HKCU", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
            (HKEY_CURRENT_USER, "HKCU", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce"),
            (HKEY_LOCAL_MACHINE, "HKLM", r"Software\Microsoft\Windows\CurrentVersion\Run"),
            (HKEY_LOCAL_MACHINE, "HKLM", r"Software\Microsoft\Windows\CurrentVersion\RunOnce"),
            (HKEY_LOCAL_MACHINE, "HKLM", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
            (HKEY_LOCAL_MACHINE, "HKLM", r"Software\WOW6432Node\Microsoft\Windows\CurrentVersion\RunOnce"),
        ];

        for (hive, label, subpath) in run_keys {
            let root = RegKey::predef(hive);
            let Ok(key) = root.open_subkey(subpath) else {
                continue;
            };
            for value in key.enum_values() {
                let Ok((val_name, _)) = value else {
                    continue;
                };
                let data: String = key.get_value(&val_name).unwrap_or_default();
                let by_install = install_loc_lower
                    .as_ref()
                    .map(|loc| data.to_lowercase().contains(loc))
                    .unwrap_or(false);
                let by_name = name_norm.len() >= 3
                    && (folder_matches(&normalize(&val_name), &name_norm, &pub_norm)
                        || (name_norm.len() >= 4 && normalize(&data).contains(&name_norm)));
                if by_install || by_name {
                    let full_key = format!("{label}\\{subpath}");
                    let seen_key = format!("{full_key}||{val_name}");
                    add(
                        &mut items,
                        &mut seen,
                        &seen_key,
                        LeftoverItem::registry_value(full_key, val_name),
                    );
                }
            }
        }
    }

    let total_size_bytes = items.iter().map(|i| i.size_bytes).sum();
    Ok(LeftoverReport {
        items,
        total_size_bytes,
    })
}

#[cfg(windows)]
fn split_hive(full: &str) -> Result<(RegKey, &str), String> {
    let (hive, rest) = full
        .split_once('\\')
        .ok_or_else(|| format!("Malformed registry path: {full}"))?;
    let root = match hive {
        "HKCU" => RegKey::predef(HKEY_CURRENT_USER),
        "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
        other => return Err(format!("Unknown hive: {other}")),
    };
    Ok((root, rest))
}

#[cfg(windows)]
fn delete_registry_key(full: &str) -> Result<(), String> {
    let (root, rest) = split_hive(full)?;
    root.delete_subkey_all(rest).map_err(|e| e.to_string())
}

#[cfg(windows)]
fn delete_registry_value(full_key: &str, value_name: &str) -> Result<(), String> {
    let (root, rest) = split_hive(full_key)?;
    let key = root
        .open_subkey_with_flags(rest, KEY_SET_VALUE)
        .map_err(|e| e.to_string())?;
    key.delete_value(value_name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_leftovers(items: Vec<LeftoverItem>) -> Result<(), String> {
    let mut errors: Vec<String> = Vec::new();

    for item in items {
        match item.kind.as_str() {
            "folder" => {
                if let Err(e) = std::fs::remove_dir_all(&item.path_or_key) {
                    errors.push(format!("{}: {e}", item.path_or_key));
                }
            }
            "shortcut" => {
                if let Err(e) = std::fs::remove_file(&item.path_or_key) {
                    errors.push(format!("{}: {e}", item.path_or_key));
                }
            }
            "registry" => {
                #[cfg(windows)]
                {
                    if let Err(e) = delete_registry_key(&item.path_or_key) {
                        errors.push(format!("{}: {e}", item.path_or_key));
                    }
                }
            }
            "registry_value" => {
                #[cfg(windows)]
                {
                    match item.value_name.as_deref() {
                        Some(value) => {
                            if let Err(e) = delete_registry_value(&item.path_or_key, value) {
                                errors.push(format!("{}\\{value}: {e}", item.path_or_key));
                            }
                        }
                        None => errors.push(format!(
                            "{}: registry value has no value name",
                            item.path_or_key
                        )),
                    }
                }
            }
            other => errors.push(format!("Unknown leftover kind: {other}")),
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("; "))
    }
}
