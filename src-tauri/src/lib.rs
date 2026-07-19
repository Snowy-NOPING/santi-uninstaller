mod leftovers;
mod registry;
mod uninstall;

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

/// Try to load an icon from a `DisplayIcon` path and return it as a data URL.
/// Handles the common `C:\path\app.exe,0` form by stripping the icon index.
/// Embedded EXE/DLL icons are a known v1 gap — those return an error and the
/// frontend falls back to a colored-initials avatar.
#[tauri::command]
fn read_icon(icon_path: String) -> Result<String, String> {
    use base64::Engine;

    let trimmed = icon_path.trim().trim_matches('"');
    let path_part = match trimmed.rsplit_once(',') {
        Some((p, idx))
            if !idx.is_empty() && idx.chars().all(|c| c.is_ascii_digit() || c == '-') =>
        {
            p
        }
        _ => trimmed,
    };

    let path = std::path::Path::new(path_part.trim());
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let mime = match ext.as_str() {
        "ico" => "image/x-icon",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        _ => return Err(format!("Unsupported icon source: {}", path.display())),
    };

    let bytes = std::fs::read(path).map_err(|e| format!("read icon: {e}"))?;
    if bytes.is_empty() {
        return Err("Icon file is empty.".to_string());
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
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
            open_install_folder,
            read_icon,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
