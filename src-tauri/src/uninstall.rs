// Runs a program's uninstaller: parses the registry UninstallString, handles
// MSI products, and offers an elevated ("run as admin") retry path.

use crate::registry::{find_program, InstalledProgram};
use serde::Serialize;
use std::path::Path;
use std::process::Command;

/// Result of a force-remove: what was removed, plus any leftovers found
/// afterward so the frontend can offer immediate cleanup.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ForceRemoveResult {
    pub message: String,
    pub leftovers: crate::leftovers::LeftoverReport,
}

/// Choose the command string to run for a given program.
fn choose_command(prog: &InstalledProgram, silent: bool) -> Result<String, String> {
    let cmd = if silent {
        prog.quiet_uninstall_string
            .clone()
            .or_else(|| prog.uninstall_string.clone())
    } else {
        prog.uninstall_string.clone()
    };
    cmd.ok_or_else(|| "This program has no uninstall command registered.".to_string())
}

/// If the command references msiexec, pull out the `{GUID}` product code.
fn extract_msi_guid(cmd: &str) -> Option<String> {
    if !cmd.to_lowercase().contains("msiexec") {
        return None;
    }
    let start = cmd.find('{')?;
    let end = cmd[start..].find('}')? + start;
    Some(cmd[start..=end].to_string())
}

/// Split an UninstallString into (executable, args), handling the common
/// quoted-path form: `"C:\Path\uninst.exe" /S`.
fn split_command(cmd: &str) -> (String, Vec<String>) {
    let cmd = cmd.trim();
    if let Some(stripped) = cmd.strip_prefix('"') {
        if let Some(rel) = stripped.find('"') {
            let exe = stripped[..rel].to_string();
            let rest = stripped[rel + 1..].trim();
            return (exe, split_args(rest));
        }
    }
    // Unquoted: first whitespace-delimited token is the executable.
    let mut parts = cmd.splitn(2, char::is_whitespace);
    let exe = parts.next().unwrap_or("").to_string();
    let rest = parts.next().unwrap_or("").trim();
    (exe, split_args(rest))
}

/// Tokenize an argument string, respecting double quotes.
fn split_args(s: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut cur = String::new();
    let mut in_quotes = false;
    for c in s.chars() {
        match c {
            '"' => in_quotes = !in_quotes,
            c if c.is_whitespace() && !in_quotes => {
                if !cur.is_empty() {
                    args.push(std::mem::take(&mut cur));
                }
            }
            c => cur.push(c),
        }
    }
    if !cur.is_empty() {
        args.push(cur);
    }
    args
}

/// Run a command and interpret its exit status. Error strings are prefixed with
/// a machine-readable tag so the frontend can react (e.g. offer elevation).
fn execute(mut command: Command) -> Result<String, String> {
    match command.output() {
        Ok(output) => {
            let code = output.status.code().unwrap_or(-1);
            if output.status.success() {
                Ok(format!("Uninstaller finished successfully (exit code {code})."))
            } else if code == 3010 {
                Ok("Uninstall completed — a restart is required to finish.".to_string())
            } else if code == 1602 || code == 1223 {
                Err("CANCELLED: The uninstall was cancelled.".to_string())
            } else if code == 1603 {
                Err("ELEVATION_REQUIRED: The uninstaller failed (1603) — this usually means it needs administrator rights.".to_string())
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!(
                    "FAILED: Uninstaller exited with code {code}. {}",
                    stderr.trim()
                ))
            }
        }
        Err(e) => {
            // ERROR_ELEVATION_REQUIRED (740) or a permission error.
            if e.raw_os_error() == Some(740) || e.kind() == std::io::ErrorKind::PermissionDenied {
                Err("ELEVATION_REQUIRED: This uninstaller requires administrator rights.".to_string())
            } else {
                Err(format!("FAILED: Could not start the uninstaller: {e}"))
            }
        }
    }
}

#[tauri::command]
pub fn run_uninstall(program_id: String, silent: bool) -> Result<String, String> {
    #[cfg(not(windows))]
    {
        let _ = (program_id, silent);
        return Err("santi.uninstaller only runs on Windows.".to_string());
    }
    #[cfg(windows)]
    {
        let prog = find_program(&program_id)
            .ok_or_else(|| format!("Program '{program_id}' was not found (already removed?)."))?;
        let cmd = choose_command(&prog, silent)?;

        if let Some(guid) = extract_msi_guid(&cmd) {
            let mut command = Command::new("msiexec");
            command.arg("/x").arg(&guid);
            if silent {
                command.arg("/qn");
            }
            return execute(command);
        }

        let (exe, args) = split_command(&cmd);
        if exe.is_empty() {
            return Err("FAILED: Could not parse the uninstall command.".to_string());
        }
        let mut command = Command::new(&exe);
        command.args(&args);
        execute(command)
    }
}

// ---- Elevated ("run as administrator") path via ShellExecuteW + "runas" ----

#[cfg(windows)]
fn shell_execute_runas(file: &str, params: &str) -> Result<String, String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::UI::Shell::ShellExecuteW;
    use windows_sys::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let verb = wide("runas");
    let file_w = wide(file);
    let params_w = wide(params);

    let result = unsafe {
        ShellExecuteW(
            std::ptr::null_mut(),
            verb.as_ptr(),
            file_w.as_ptr(),
            params_w.as_ptr(),
            std::ptr::null(),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecuteW returns a value > 32 on success.
    let code = result as isize;
    if code > 32 {
        Ok("Launched the uninstaller with administrator rights. Accept the UAC prompt to continue, then re-scan.".to_string())
    } else {
        // 1223 == ERROR_CANCELLED (user declined UAC).
        Err(format!(
            "CANCELLED: Elevation was declined or failed (code {code})."
        ))
    }
}

#[tauri::command]
pub fn run_uninstall_admin(program_id: String, silent: bool) -> Result<String, String> {
    #[cfg(not(windows))]
    {
        let _ = (program_id, silent);
        return Err("santi.uninstaller only runs on Windows.".to_string());
    }
    #[cfg(windows)]
    {
        let prog = find_program(&program_id)
            .ok_or_else(|| format!("Program '{program_id}' was not found."))?;
        let cmd = choose_command(&prog, silent)?;

        if let Some(guid) = extract_msi_guid(&cmd) {
            let params = if silent {
                format!("/x {guid} /qn")
            } else {
                format!("/x {guid}")
            };
            return shell_execute_runas("msiexec.exe", &params);
        }

        let (exe, args) = split_command(&cmd);
        if exe.is_empty() {
            return Err("FAILED: Could not parse the uninstall command.".to_string());
        }
        shell_execute_runas(&exe, &args.join(" "))
    }
}

// ---- Force remove: skip the uninstaller, delete key + folder directly ----

#[tauri::command]
pub fn force_remove(program_id: String) -> Result<ForceRemoveResult, String> {
    #[cfg(not(windows))]
    {
        let _ = program_id;
        return Err("santi.uninstaller only runs on Windows.".to_string());
    }
    #[cfg(windows)]
    {
        let prog = find_program(&program_id)
            .ok_or_else(|| format!("Program '{program_id}' was not found."))?;

        let mut removed: Vec<String> = Vec::new();
        let mut errors: Vec<String> = Vec::new();

        // 1. Delete the install folder (if it exists).
        if let Some(loc) = prog.install_location.as_deref() {
            let path = Path::new(loc);
            if !loc.trim().is_empty() && path.is_dir() {
                match std::fs::remove_dir_all(path) {
                    Ok(_) => removed.push(format!("folder {loc}")),
                    Err(e) => errors.push(format!("folder {loc}: {e}")),
                }
            }
        }

        // 2. Delete the Uninstall registry key.
        match crate::registry::delete_uninstall_key(&prog) {
            Ok(_) => removed.push("registry uninstall key".to_string()),
            Err(e) => errors.push(format!("registry: {e}")),
        }

        if !errors.is_empty() {
            return if removed.is_empty() {
                Err(format!(
                    "ELEVATION_REQUIRED: Force remove failed: {}",
                    errors.join("; ")
                ))
            } else {
                Err(format!(
                    "FAILED: Partially removed [{}]. Errors: {}",
                    removed.join(", "),
                    errors.join("; ")
                ))
            };
        }

        // 3. Removal succeeded — immediately scan for remaining leftovers so the
        //    frontend can offer to clean them without a separate manual scan.
        let leftovers = crate::leftovers::scan_leftovers(
            prog.name.clone(),
            prog.publisher.clone(),
            prog.install_location.clone(),
        )
        .unwrap_or(crate::leftovers::LeftoverReport {
            items: Vec::new(),
            total_size_bytes: 0,
        });

        Ok(ForceRemoveResult {
            message: format!("Force-removed: {}.", removed.join(", ")),
            leftovers,
        })
    }
}
