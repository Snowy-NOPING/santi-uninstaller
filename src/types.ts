export interface InstalledProgram {
  id: string;
  name: string;
  publisher: string;
  version: string;
  installDate: string | null;
  estimatedSizeKb: number | null;
  installLocation: string | null;
  uninstallString: string | null;
  quietUninstallString: string | null;
  iconPath: string | null;
  hive: "HKLM" | "HKCU";
  isWow64: boolean;
}

export interface LeftoverItem {
  pathOrKey: string;
  kind: "folder" | "registry";
  sizeBytes: number;
}

export interface LeftoverReport {
  items: LeftoverItem[];
  totalSizeBytes: number;
}

export type CategoryId = "all" | "recent" | "large" | "windows" | "leftovers";
export type SortId = "name" | "size" | "date";
