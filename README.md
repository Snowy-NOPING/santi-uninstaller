# santi.uninstaller

A modern Windows uninstaller in the spirit of Revo Uninstaller — built with
**Tauri v2** (Rust backend + system WebView) and **React + TypeScript + Tailwind v4**.
It reads the Windows registry for real, runs the actual uninstallers, and finds
and cleans up leftover files and registry keys.

> Windows only. This app talks directly to the registry and spawns uninstaller
> processes; it does nothing meaningful on other platforms.

## Features

- **Real registry scan** across all three Uninstall roots — 64-bit HKLM,
  32-bit `WOW6432Node`, and per-user HKCU — merged and de-duplicated, with
  `SystemComponent`/nameless entries filtered out.
- **Uninstall** — runs the program's own `UninstallString` (or the quiet one),
  handles MSI products via `msiexec /x {GUID}`, parses quoted-path commands,
  and surfaces the real exit code / error.
- **Retry as administrator** — when an uninstaller returns an elevation error,
  re-launches it through the Windows `runas` verb (UAC prompt).
- **Force remove** — skips the uninstaller and deletes the registry key +
  install folder directly (guarded by a stronger confirmation).
- **Leftover scan & cleanup** — fuzzy (case/punctuation-insensitive) match on
  app name + publisher across `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMDATA%`,
  the install location, and `Software\{publisher}\{name}` registry keys.
- **Flat, modern UI** — metric cards, category sidebar with live counts, search
  + sort, batch select, a details panel, and subtle Framer Motion animations.

## Architecture

The privileged work (spawning processes, deleting files, editing the registry)
runs in the **Rust backend** via `std::process`, `std::fs`, and `winreg` — which
gives precise exit-code/error handling. The frontend calls these through Tauri
commands and uses the dialog plugin for confirmations.

```
src-tauri/src/
  registry.rs    # scan_installed_programs, find_program, delete_uninstall_key
  uninstall.rs   # run_uninstall, run_uninstall_admin (runas), force_remove
  leftovers.rs   # scan_leftovers, delete_leftovers
  lib.rs         # command registration, open_install_folder, read_icon
src/
  components/    # Sidebar, MetricCards, SearchSortBar, BatchBar,
                 # ProgramList/ProgramRow, DetailsPanel, Avatar, Toast, Icons
  App.tsx        # state + orchestration
```

## Develop / build

```bash
npm install
npm run tauri dev      # run the app
npm run tauri build    # NSIS installer -> src-tauri/target/release/bundle/nsis/
```

## Known v1 limitations

- **Browser extensions** aren't listed — that data lives in each browser's own
  profile folder, not the registry (Chrome:
  `%LOCALAPPDATA%\Google\Chrome\User Data\Default\Extensions`; Firefox: the
  profile `extensions` folder). A possible future addition.
- **Embedded EXE/DLL icons** aren't extracted — icon files (`.ico`/`.png`) load,
  otherwise the UI falls back to a colored-initials avatar.
- Some uninstallers legitimately **require administrator rights**; the app
  surfaces the real Windows error and offers a "retry as administrator" path
  rather than forcing the whole app to run elevated.
