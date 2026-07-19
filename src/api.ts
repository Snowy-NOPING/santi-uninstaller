import { invoke } from "@tauri-apps/api/core";
import type {
  ForceRemoveResult,
  InstalledProgram,
  LeftoverItem,
  LeftoverReport,
} from "./types";

export const scanInstalledPrograms = () =>
  invoke<InstalledProgram[]>("scan_installed_programs");

export const runUninstall = (programId: string, silent: boolean) =>
  invoke<string>("run_uninstall", { programId, silent });

export const runUninstallAdmin = (programId: string, silent: boolean) =>
  invoke<string>("run_uninstall_admin", { programId, silent });

export const forceRemove = (programId: string) =>
  invoke<ForceRemoveResult>("force_remove", { programId });

export const scanLeftovers = (
  name: string,
  publisher: string,
  installLocation: string | null,
) => invoke<LeftoverReport>("scan_leftovers", { name, publisher, installLocation });

export const deleteLeftovers = (items: LeftoverItem[]) =>
  invoke<void>("delete_leftovers", { items });

export const openInstallFolder = (path: string) =>
  invoke<void>("open_install_folder", { path });

export const readIcon = (iconPath: string) =>
  invoke<string>("read_icon", { iconPath });

export const runInstallerFromUrl = (url: string) =>
  invoke<void>("run_installer_from_url", { url });

/** True when a backend error string signals the action needs admin rights. */
export function needsElevation(err: unknown): boolean {
  return typeof err === "string" && err.startsWith("ELEVATION_REQUIRED");
}

/** Strip the machine-readable tag ("FAILED:", "ELEVATION_REQUIRED:", ...). */
export function cleanError(err: unknown): string {
  const s = typeof err === "string" ? err : String(err);
  return s.replace(/^[A-Z_]+:\s*/, "");
}
