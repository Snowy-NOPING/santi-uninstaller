fn main() {
    // Embed a custom Windows application manifest that requests administrator
    // rights at launch (requireAdministrator). Provided through tauri-build's
    // WindowsAttributes so it replaces Tauri's default manifest instead of
    // colliding with it as a second manifest resource.
    let attributes = tauri_build::Attributes::new().windows_attributes(
        tauri_build::WindowsAttributes::new()
            .app_manifest(include_str!("santi-uninstaller.manifest")),
    );

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
