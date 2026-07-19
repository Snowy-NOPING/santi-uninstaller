import type { CategoryId, InstalledProgram } from "./types";

/** Human-readable byte size. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 100 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

/** EstimatedSize is stored in KB. */
export function formatSizeKb(kb: number | null | undefined): string {
  if (kb == null || kb <= 0) return "—";
  return formatBytes(kb * 1024);
}

/** ISO date (YYYY-MM-DD) -> friendly label. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const DAY_MS = 86_400_000;

export function isRecent(p: InstalledProgram): boolean {
  if (!p.installDate) return false;
  const d = new Date(p.installDate + "T00:00:00").getTime();
  if (Number.isNaN(d)) return false;
  return Date.now() - d <= 30 * DAY_MS;
}

export function isLarge(p: InstalledProgram): boolean {
  return p.estimatedSizeKb != null && p.estimatedSizeKb > 1_000_000;
}

/**
 * Exclusive bucket per the spec: recent → large → windows (default catch-all).
 * The three buckets partition every program so the sidebar counts sum to total.
 */
export function bucketOf(p: InstalledProgram): "recent" | "large" | "windows" {
  if (isRecent(p)) return "recent";
  if (isLarge(p)) return "large";
  return "windows";
}

/** Colored-initials avatar palette (flat, no gradients). */
const AVATAR_COLORS = [
  "#4f46e5", "#0891b2", "#db2777", "#ea580c", "#16a34a",
  "#7c3aed", "#0284c7", "#d97706", "#dc2626", "#059669",
  "#2563eb", "#c026d3",
];

export function avatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function initials(name: string): string {
  const words = name.trim().split(/[\s\-_.]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  all: "All apps",
  recent: "Recently installed",
  large: "Large apps",
  windows: "Windows apps",
  leftovers: "Leftovers",
};
