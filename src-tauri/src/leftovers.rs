// Finds and removes orphaned files/folders and registry keys left behind after
// an uninstall, using a fuzzy (case-insensitive, punctuation-stripped) match.

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
    pub kind: String, // "folder" | "registry"
    pub size_bytes: u64,
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

/// Does a folder name look like it belongs to this app/publisher?
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

    // 1. Fuzzy-match immediate subfolders of the common data roots.
    for var in ["APPDATA", "LOCALAPPDATA", "ProgramData"] {
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
                let key = path.to_string_lossy().to_string();
                if seen.insert(key.clone()) {
                    items.push(LeftoverItem {
                        path_or_key: key,
                        kind: "folder".to_string(),
                        size_bytes: dir_size(&path),
                    });
                }
            }
        }
    }

    // 2. The original install location, if it survived the uninstall.
    if let Some(loc) = install_location {
        let path = PathBuf::from(&loc);
        if !loc.trim().is_empty() && path.is_dir() {
            let key = path.to_string_lossy().to_string();
            if seen.insert(key.clone()) {
                items.push(LeftoverItem {
                    path_or_key: key,
                    kind: "folder".to_string(),
                    size_bytes: dir_size(&path),
                });
            }
        }
    }

    // 3. Leftover registry keys under Software\{publisher}\{name} and Software\{name}.
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
                    if seen.insert(full.clone()) {
                        items.push(LeftoverItem {
                            path_or_key: full,
                            kind: "registry".to_string(),
                            size_bytes: 0,
                        });
                    }
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
fn delete_registry_key(full: &str) -> Result<(), String> {
    let (hive, rest) = full
        .split_once('\\')
        .ok_or_else(|| format!("Malformed registry path: {full}"))?;
    let root = match hive {
        "HKCU" => RegKey::predef(HKEY_CURRENT_USER),
        "HKLM" => RegKey::predef(HKEY_LOCAL_MACHINE),
        other => return Err(format!("Unknown hive: {other}")),
    };
    root.delete_subkey_all(rest).map_err(|e| e.to_string())
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
            "registry" => {
                #[cfg(windows)]
                {
                    if let Err(e) = delete_registry_key(&item.path_or_key) {
                        errors.push(format!("{}: {e}", item.path_or_key));
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
