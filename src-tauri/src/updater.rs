// Auto-update helper: downloads a release installer and launches it. The
// version check itself lives in the frontend (a plain fetch to the public
// GitHub Releases API), so this only handles the download + run + exit.

/// Download the installer at `url`, save it to the temp dir, launch it, then
/// exit the app so the installer can replace the running files.
#[cfg(windows)]
#[tauri::command]
pub fn run_installer_from_url(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use std::io::Read;

    // Only ever download over HTTPS from GitHub's release hosts.
    let allowed = url.starts_with("https://github.com/")
        || url.starts_with("https://objects.githubusercontent.com/")
        || url.starts_with("https://release-assets.githubusercontent.com/");
    if !allowed {
        return Err("Refusing to download the update from an untrusted URL.".to_string());
    }

    let response = ureq::get(&url)
        .set("User-Agent", "santi-uninstaller-updater")
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;

    let mut bytes: Vec<u8> = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Reading the download failed: {e}"))?;

    // Sanity-check that we got a Windows executable (MZ header) of plausible size.
    if bytes.len() < 4096 || bytes.get(0..2) != Some(&[0x4D, 0x5A]) {
        return Err("The downloaded file doesn't look like a valid installer.".to_string());
    }

    let path = std::env::temp_dir().join("santi.uninstaller-update-setup.exe");
    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Could not save the installer: {e}"))?;

    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("Could not launch the installer: {e}"))?;

    // Exit so the installer can overwrite the running executable.
    app.exit(0);
    Ok(())
}

#[cfg(not(windows))]
#[tauri::command]
pub fn run_installer_from_url(_app: tauri::AppHandle, _url: String) -> Result<(), String> {
    Err("Updates are only supported on Windows.".to_string())
}
