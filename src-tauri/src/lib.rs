mod icon;
mod leftovers;
mod registry;
mod uninstall;
mod updater;

use std::process::Command;

/// Reveal a folder in Explorer (selected within its parent).
#[tauri::command]
fn open_install_folder(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        // explorer.exe returns a non-zero code even on success, so we don't
        // wait on it — spawning is enough to open the window.
        Command::new("explorer")
            .arg(format!("/select,{path}"))
            .spawn()
            .map_err(|e| format!("Could not open Explorer: {e}"))?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("Only supported on Windows.".to_string())
    }
}

/// Try to load an icon from a `DisplayIcon` value and return it as a data URL.
/// Standalone image files (.ico/.png/.bmp/.gif/.jpg) are returned as-is; the
/// common `C:\path\app.exe,0` form extracts the embedded icon at that index
/// from the exe/dll. Only genuine failures return an error, at which point the
/// frontend falls back to a colored-initials avatar.
#[tauri::command]
fn read_icon(icon_path: String) -> Result<String, String> {
    use base64::Engine;

    let trimmed = icon_path.trim().trim_matches('"');

    // Split a trailing ",<index>" (last comma) — paths themselves can contain
    // commas, so split from the right.
    let (path_part, index) = match trimmed.rsplit_once(',') {
        Some((p, idx))
            if !idx.trim().is_empty()
                && idx
                    .trim()
                    .char_indices()
                    .all(|(i, c)| c.is_ascii_digit() || (i == 0 && c == '-')) =>
        {
            (p.trim().trim_matches('"'), idx.trim().parse::<i32>().unwrap_or(0))
        }
        _ => (trimmed, 0),
    };

    let path = std::path::Path::new(path_part);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    // Standalone image files: hand the raw bytes straight to the webview.
    let image_mime = match ext.as_str() {
        "ico" => Some("image/x-icon"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "bmp" => Some("image/bmp"),
        "gif" => Some("image/gif"),
        _ => None,
    };
    if let Some(mime) = image_mime {
        let bytes = std::fs::read(path).map_err(|e| format!("read icon: {e}"))?;
        if bytes.is_empty() {
            return Err("Icon file is empty.".to_string());
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        return Ok(format!("data:{mime};base64,{b64}"));
    }

    // Otherwise it's a PE (exe/dll/…) — extract the embedded icon resource.
    #[cfg(windows)]
    {
        if !path.exists() {
            return Err(format!("Icon source not found: {}", path.display()));
        }
        icon::extract_exe_icon_data_url(&path.to_string_lossy(), index, 128)
    }
    #[cfg(not(windows))]
    {
        let _ = index;
        Err(format!("Unsupported icon source: {}", path.display()))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            registry::scan_installed_programs,
            uninstall::run_uninstall,
            uninstall::run_uninstall_admin,
            uninstall::force_remove,
            leftovers::scan_leftovers,
            leftovers::delete_leftovers,
            updater::run_installer_from_url,
            open_install_folder,
            read_icon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
