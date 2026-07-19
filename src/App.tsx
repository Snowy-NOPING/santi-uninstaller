import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ask, confirm } from "@tauri-apps/plugin-dialog";
import {
  cleanError,
  deleteLeftovers,
  forceRemove,
  needsElevation,
  openInstallFolder,
  runUninstall,
  runUninstallAdmin,
  scanInstalledPrograms,
  scanLeftovers,
} from "./api";
import { bucketOf } from "./format";
import type {
  CategoryId,
  InstalledProgram,
  LeftoverItem,
  LeftoverReport,
  SortId,
  Theme,
} from "./types";
import { Sidebar } from "./components/Sidebar";
import { MetricCards } from "./components/MetricCards";
import { SearchSortBar } from "./components/SearchSortBar";
import { BatchBar } from "./components/BatchBar";
import { ProgramList } from "./components/ProgramList";
import { DetailsPanel } from "./components/DetailsPanel";
import { ToastHost, type ToastData } from "./components/Toast";
import { Settings, type AppSettings } from "./components/Settings";
import { IconInfo, IconWarning, IconSettings } from "./components/Icons";

const VALID_THEMES: Theme[] = [
  "light",
  "dark",
  "latte",
  "frappe",
  "macchiato",
  "mocha",
];

const DEFAULT_SETTINGS: AppSettings = { cleanLeftoversFirst: false };

function loadSettings(): AppSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem("settings") || "{}") };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

type Busy = { id: string | null; action: string | null };

export default function App() {
  const [programs, setPrograms] = useState<InstalledProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("name");
  const [category, setCategory] = useState<CategoryId>("all");

  const [leftovers, setLeftovers] = useState<Record<string, LeftoverReport>>({});
  const [busy, setBusy] = useState<Busy>({ id: null, action: null });
  const [toast, setToast] = useState<ToastData | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    return saved && VALID_THEMES.includes(saved) ? saved : "mocha";
  });
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("settings", JSON.stringify(settings));
  }, [settings]);

  const showToast = useCallback(
    (message: string, kind: ToastData["kind"]) => {
      const id = Date.now();
      setToast({ id, message, kind });
      window.clearTimeout(toastTimer.current);
      toastTimer.current = window.setTimeout(
        () => setToast((t) => (t?.id === id ? null : t)),
        4500,
      );
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPrograms(await scanInstalledPrograms());
    } catch (e) {
      setError(cleanError(e));
      showToast(cleanError(e), "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // --- Derived data ---
  const leftoverIds = useMemo(
    () =>
      new Set(
        Object.entries(leftovers)
          .filter(([, r]) => r.items.length > 0)
          .map(([id]) => id),
      ),
    [leftovers],
  );

  const counts = useMemo<Record<CategoryId, number>>(() => {
    const c: Record<CategoryId, number> = {
      all: programs.length,
      recent: 0,
      large: 0,
      windows: 0,
      leftovers: 0,
    };
    for (const p of programs) c[bucketOf(p)] += 1;
    c.leftovers = programs.filter((p) => leftoverIds.has(p.id)).length;
    return c;
  }, [programs, leftoverIds]);

  const metrics = useMemo(() => {
    const totalKb = programs.reduce((s, p) => s + (p.estimatedSizeKb ?? 0), 0);
    const leftoverFiles = Object.values(leftovers).reduce(
      (s, r) => s + r.items.length,
      0,
    );
    return {
      installedCount: programs.length,
      totalSizeBytes: totalKb * 1024,
      leftoverFiles,
    };
  }, [programs, leftovers]);

  const filtered = useMemo(() => {
    let list = programs;
    if (category === "leftovers") list = list.filter((p) => leftoverIds.has(p.id));
    else if (category !== "all") list = list.filter((p) => bucketOf(p) === category);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.publisher.toLowerCase().includes(q),
      );
    }

    return [...list].sort((a, b) => {
      if (sort === "size") return (b.estimatedSizeKb ?? 0) - (a.estimatedSizeKb ?? 0);
      if (sort === "date") return (b.installDate ?? "").localeCompare(a.installDate ?? "");
      return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
    });
  }, [programs, category, search, sort, leftoverIds]);

  const selected = useMemo(
    () => programs.find((p) => p.id === selectedId) ?? null,
    [programs, selectedId],
  );

  // --- Actions ---

  /**
   * Scan for leftovers and delete the orphan data (AppData/ProgramData/registry),
   * deliberately KEEPING the install folder so the program's own uninstaller —
   * which usually lives inside it — can still run afterward. Records the scan for
   * the metrics/badges. Returns how many items were removed.
   */
  const cleanOrphans = async (program: InstalledProgram): Promise<number> => {
    const report = await scanLeftovers(
      program.name,
      program.publisher,
      program.installLocation,
    );
    const instLoc = (program.installLocation ?? "")
      .replace(/[\\/]+$/, "")
      .toLowerCase();
    const toDelete = report.items.filter(
      (i) =>
        !(
          i.kind === "folder" &&
          instLoc.length > 0 &&
          i.pathOrKey.replace(/[\\/]+$/, "").toLowerCase() === instLoc
        ),
    );
    if (toDelete.length > 0) await deleteLeftovers(toDelete);
    setLeftovers((prev) => ({ ...prev, [program.id]: report }));
    return toDelete.length;
  };

  const doUninstall = async (program: InstalledProgram) => {
    const clean = settings.cleanLeftoversFirst;
    const ok = await ask(
      clean
        ? `Uninstall ${program.name}?\n\nLeftover app data and registry keys will be scanned and removed first, then the program's own uninstaller runs.`
        : `Uninstall ${program.name}?\n\nThis runs the program's own uninstaller.`,
      { title: "Uninstall", kind: "warning", okLabel: "Uninstall" },
    );
    if (!ok) return;
    setBusy({ id: program.id, action: "uninstall" });
    try {
      let cleaned = 0;
      if (clean) cleaned = await cleanOrphans(program);
      const msg = await runUninstall(program.id, false);
      showToast(
        clean && cleaned > 0
          ? `Removed ${cleaned} leftover item(s), then uninstalled ${program.name}.`
          : msg,
        "success",
      );
      await load();
    } catch (e) {
      if (needsElevation(e)) {
        const retry = await ask(
          `${cleanError(e)}\n\nRetry with administrator rights?`,
          { title: "Administrator required", kind: "warning", okLabel: "Retry as admin" },
        );
        if (retry) {
          try {
            showToast(await runUninstallAdmin(program.id, false), "info");
            window.setTimeout(() => void load(), 1500);
          } catch (e2) {
            showToast(cleanError(e2), "error");
          }
        }
      } else {
        showToast(cleanError(e), "error");
      }
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const doScanLeftovers = async (program: InstalledProgram) => {
    setBusy({ id: program.id, action: "scan" });
    try {
      const report = await scanLeftovers(
        program.name,
        program.publisher,
        program.installLocation,
      );
      setLeftovers((prev) => ({ ...prev, [program.id]: report }));
      showToast(
        report.items.length
          ? `Found ${report.items.length} leftover item(s).`
          : "No leftovers found — clean.",
        report.items.length ? "info" : "success",
      );
    } catch (e) {
      showToast(cleanError(e), "error");
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const doDeleteLeftovers = async (
    program: InstalledProgram,
    items: LeftoverItem[],
  ) => {
    if (items.length === 0) return;
    const ok = await confirm(
      `Permanently delete ${items.length} leftover item(s)? This removes the listed folders and registry keys.`,
      { title: "Delete leftovers", kind: "warning" },
    );
    if (!ok) return;
    setBusy({ id: program.id, action: "delete-leftovers" });
    try {
      await deleteLeftovers(items);
      setLeftovers((prev) => {
        const rep = prev[program.id];
        if (!rep) return prev;
        const remaining = rep.items.filter(
          (i) =>
            !items.some(
              (d) =>
                d.pathOrKey === i.pathOrKey &&
                (d.valueName ?? null) === (i.valueName ?? null),
            ),
        );
        return {
          ...prev,
          [program.id]: {
            items: remaining,
            totalSizeBytes: remaining.reduce((s, i) => s + i.sizeBytes, 0),
          },
        };
      });
      showToast(`Deleted ${items.length} leftover item(s).`, "success");
    } catch (e) {
      showToast(cleanError(e), "error");
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const doForceRemove = async (program: InstalledProgram) => {
    const ok = await confirm(
      `Force remove ${program.name}?\n\nThis SKIPS the app's own uninstaller and deletes its registry key and install folder directly. It may leave things in a broken state and cannot be undone.`,
      { title: "Force remove", kind: "warning", okLabel: "Force remove" },
    );
    if (!ok) return;
    setBusy({ id: program.id, action: "force" });
    try {
      const msg = await forceRemove(program.id);
      showToast(msg, "success");
      setSelectedId(null);
      await load();
    } catch (e) {
      const suffix = needsElevation(e)
        ? " Try relaunching santi.uninstaller as administrator."
        : "";
      showToast(cleanError(e) + suffix, "error");
    } finally {
      setBusy({ id: null, action: null });
    }
  };

  const doOpenFolder = async (program: InstalledProgram) => {
    if (!program.installLocation) return;
    try {
      await openInstallFolder(program.installLocation);
    } catch (e) {
      showToast(cleanError(e), "error");
    }
  };

  const doBatchUninstall = async () => {
    const targets = programs.filter((p) => checked.has(p.id));
    if (targets.length === 0) return;
    const ok = await ask(
      `Uninstall ${targets.length} selected program(s), one after another?`,
      { title: "Uninstall selected", kind: "warning", okLabel: "Uninstall all" },
    );
    if (!ok) return;
    setBusy({ id: null, action: "batch" });
    let done = 0;
    let failed = 0;
    for (const p of targets) {
      try {
        if (settings.cleanLeftoversFirst) await cleanOrphans(p);
        await runUninstall(p.id, true);
        done += 1;
      } catch {
        failed += 1;
      }
    }
    setChecked(new Set());
    setBusy({ id: null, action: null });
    await load();
    showToast(
      `Batch complete: ${done} uninstalled${failed ? `, ${failed} failed` : ""}.`,
      failed ? "info" : "success",
    );
  };

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setSelectedId(id);
  };

  const selectedReport = selectedId ? leftovers[selectedId] : undefined;
  const busyActionForSelected =
    selected && busy.id === selected.id ? busy.action : null;

  return (
    <div className="flex h-full overflow-hidden">
      <Sidebar active={category} counts={counts} onSelect={setCategory} />

      <main className="flex min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-[15px] font-semibold tracking-tight">
            Installed programs
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              title="Settings"
              className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink"
            >
              <IconSettings width={15} height={15} />
            </button>
            <button
              onClick={() => setShowInfo((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-ink"
            >
              <IconInfo width={14} height={14} />
              v1 notes
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden rounded-lg border border-line bg-accent-soft/60 px-4 py-3 text-[12px] leading-relaxed text-muted"
            >
              <strong className="text-ink">Known v1 limitations:</strong> Browser
              extensions aren't shown — that data lives in each browser's own
              profile, not the registry. Embedded EXE icons fall back to initials.
              Some uninstallers require admin rights; if one fails, santi.uninstaller
              surfaces the real Windows error and offers a “retry as administrator”.
            </motion.div>
          )}
        </AnimatePresence>

        <MetricCards
          installedCount={metrics.installedCount}
          totalSizeBytes={metrics.totalSizeBytes}
          leftoverFiles={metrics.leftoverFiles}
        />

        <SearchSortBar
          search={search}
          onSearch={setSearch}
          sort={sort}
          onSort={setSort}
          onRefresh={() => void load()}
          refreshing={loading}
        />

        <BatchBar
          count={checked.size}
          busy={busy.action === "batch"}
          onUninstall={() => void doBatchUninstall()}
          onClear={() => setChecked(new Set())}
        />

        {error && !loading && (
          <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            <IconWarning width={15} height={15} />
            {error}
          </div>
        )}

        <ProgramList
          programs={filtered}
          loading={loading}
          selectedId={selectedId}
          checked={checked}
          leftoverIds={leftoverIds}
          busyId={busy.id}
          onSelect={setSelectedId}
          onToggle={toggleCheck}
          onUninstall={(p) => void doUninstall(p)}
        />
      </main>

      <DetailsPanel
        program={selected}
        report={selectedReport}
        scanning={busyActionForSelected === "scan"}
        busyAction={busyActionForSelected}
        onUninstall={() => selected && void doUninstall(selected)}
        onScanLeftovers={() => selected && void doScanLeftovers(selected)}
        onForceRemove={() => selected && void doForceRemove(selected)}
        onDeleteLeftovers={(items) =>
          selected && void doDeleteLeftovers(selected, items)
        }
        onOpenFolder={() => selected && void doOpenFolder(selected)}
      />

      <Settings
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        theme={theme}
        onThemeChange={setTheme}
        onClose={() => setSettingsOpen(false)}
      />

      <ToastHost toast={toast} />
    </div>
  );
}
