// Scans the Windows registry for installed programs across the three
// Uninstall locations (64-bit HKLM, 32-bit WOW6432Node, per-user HKCU).

use serde::{Deserialize, Serialize};

#[cfg(windows)]
use winreg::enums::*;
#[cfg(windows)]
use winreg::RegKey;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledProgram {
    pub id: String,                       // registry key name, stable identifier
    pub name: String,                     // DisplayName
    pub publisher: String,                // Publisher
    pub version: String,                  // DisplayVersion
    pub install_date: Option<String>,     // YYYYMMDD parsed -> YYYY-MM-DD
    pub estimated_size_kb: Option<u64>,   // EstimatedSize DWORD
    pub install_location: Option<String>, // InstallLocation
    pub uninstall_string: Option<String>, // UninstallString
    pub quiet_uninstall_string: Option<String>, // QuietUninstallString
    pub icon_path: Option<String>,        // DisplayIcon
    pub hive: String,                     // "HKLM" | "HKCU"
    pub is_wow64: bool,                   // true for WOW6432Node entries
}

/// The three registry roots we scan, described so both the scanner and the
/// force-remove path can reconstruct a key location.
#[cfg(windows)]
const UNINSTALL_64: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
#[cfg(windows)]
const UNINSTALL_32: &str = r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall";

#[cfg(windows)]
fn parse_install_date(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.len() == 8 && raw.chars().all(|c| c.is_ascii_digit()) {
        let (y, rest) = raw.split_at(4);
        let (m, d) = rest.split_at(2);
        return Some(format!("{y}-{m}-{d}"));
    }
    None
}

#[cfg(windows)]
fn non_empty(v: Result<String, std::io::Error>) -> Option<String> {
    v.ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Read a single Uninstall subkey into an `InstalledProgram`, or `None` if it
/// should be filtered out (system component or missing display name).
#[cfg(windows)]
fn read_program(
    uninstall_key: &RegKey,
    subkey_name: &str,
    hive: &str,
    is_wow64: bool,
) -> Option<InstalledProgram> {
    let sub = uninstall_key.open_subkey(subkey_name).ok()?;

    // Filter out Windows updates / components.
    let system_component: u32 = sub.get_value("SystemComponent").unwrap_or(0);
    if system_component == 1 {
        return None;
    }
    let name = non_empty(sub.get_value("DisplayName"))?;

    let publisher = non_empty(sub.get_value("Publisher")).unwrap_or_default();
    let version = non_empty(sub.get_value("DisplayVersion")).unwrap_or_default();
    let install_date = sub
        .get_value::<String, _>("InstallDate")
        .ok()
        .and_then(|d| parse_install_date(&d));
    let estimated_size_kb = sub
        .get_value::<u32, _>("EstimatedSize")
        .ok()
        .map(|v| v as u64);
    let install_location = non_empty(sub.get_value("InstallLocation"));
    let uninstall_string = non_empty(sub.get_value("UninstallString"));
    let quiet_uninstall_string = non_empty(sub.get_value("QuietUninstallString"));
    let icon_path = non_empty(sub.get_value("DisplayIcon"));

    Some(InstalledProgram {
        id: subkey_name.to_string(),
        name,
        publisher,
        version,
        install_date,
        estimated_size_kb,
        install_location,
        uninstall_string,
        quiet_uninstall_string,
        icon_path,
        hive: hive.to_string(),
        is_wow64,
    })
}

#[cfg(windows)]
fn scan() -> Vec<InstalledProgram> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);

    // (root, subpath, hive label, is_wow64)
    let sources: [(&RegKey, &str, &str, bool); 3] = [
        (&hklm, UNINSTALL_64, "HKLM", false),
        (&hklm, UNINSTALL_32, "HKLM", true),
        (&hkcu, UNINSTALL_64, "HKCU", false),
    ];

    let mut out: Vec<InstalledProgram> = Vec::new();
    let mut seen: std::collections::HashSet<String> = std::collections::HashSet::new();

    for (root, path, hive, is_wow64) in sources {
        if let Ok(uninstall_key) = root.open_subkey(path) {
            for name in uninstall_key.enum_keys().flatten() {
                if let Some(prog) = read_program(&uninstall_key, &name, hive, is_wow64) {
                    // Dedup by id (registry key name).
                    if seen.insert(prog.id.clone()) {
                        out.push(prog);
                    }
                }
            }
        }
    }

    out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    out
}

/// Look up a single program by its id (registry key name) across all roots.
#[cfg(windows)]
pub fn find_program(id: &str) -> Option<InstalledProgram> {
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let sources: [(&RegKey, &str, &str, bool); 3] = [
        (&hklm, UNINSTALL_64, "HKLM", false),
        (&hklm, UNINSTALL_32, "HKLM", true),
        (&hkcu, UNINSTALL_64, "HKCU", false),
    ];
    for (root, path, hive, is_wow64) in sources {
        if let Ok(uninstall_key) = root.open_subkey(path) {
            if uninstall_key.open_subkey(id).is_ok() {
                if let Some(prog) = read_program(&uninstall_key, id, hive, is_wow64) {
                    return Some(prog);
                }
            }
        }
    }
    None
}

/// Delete a program's Uninstall registry key entirely (used by force-remove).
#[cfg(windows)]
pub fn delete_uninstall_key(prog: &InstalledProgram) -> Result<(), String> {
    let root = if prog.hive == "HKLM" {
        RegKey::predef(HKEY_LOCAL_MACHINE)
    } else {
        RegKey::predef(HKEY_CURRENT_USER)
    };
    let base = if prog.hive == "HKLM" && prog.is_wow64 {
        UNINSTALL_32
    } else {
        UNINSTALL_64
    };
    let key = root
        .open_subkey_with_flags(base, KEY_ALL_ACCESS)
        .map_err(|e| format!("open {base}: {e}"))?;
    key.delete_subkey_all(&prog.id)
        .map_err(|e| format!("delete {}: {e}", prog.id))
}

#[tauri::command]
pub fn scan_installed_programs() -> Result<Vec<InstalledProgram>, String> {
    #[cfg(windows)]
    {
        Ok(scan())
    }
    #[cfg(not(windows))]
    {
        Err("santi.uninstaller only runs on Windows.".to_string())
    }
}
