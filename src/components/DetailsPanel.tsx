import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Avatar } from "./Avatar";
import {
  IconTrash,
  IconBroom,
  IconWarning,
  IconFolder,
  IconRegistry,
  IconBox,
} from "./Icons";
import { bucketOf, CATEGORY_LABELS, formatBytes, formatDate, formatSizeKb } from "../format";
import type { InstalledProgram, LeftoverItem, LeftoverReport } from "../types";

interface Props {
  program: InstalledProgram | null;
  report: LeftoverReport | undefined;
  scanning: boolean;
  busyAction: string | null;
  onUninstall: () => void;
  onScanLeftovers: () => void;
  onForceRemove: () => void;
  onDeleteLeftovers: (items: LeftoverItem[]) => void;
  onOpenFolder: () => void;
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-[12px] text-faint">{label}</span>
      <span className="truncate text-right text-[12.5px] font-medium">{value}</span>
    </div>
  );
}

export function DetailsPanel({
  program,
  report,
  scanning,
  busyAction,
  onUninstall,
  onScanLeftovers,
  onForceRemove,
  onDeleteLeftovers,
  onOpenFolder,
}: Props) {
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Reset picked leftovers whenever the program or its report changes.
  useEffect(() => {
    setPicked(new Set(report?.items.map((i) => i.pathOrKey) ?? []));
  }, [program?.id, report]);

  if (!program) {
    return (
      <div className="flex w-80 shrink-0 flex-col items-center justify-center border-l border-line bg-surface p-8 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-canvas text-faint">
          <IconBox width={22} height={22} />
        </div>
        <div className="text-[13px] font-medium text-muted">No app selected</div>
        <div className="mt-1 text-[12px] text-faint">
          Pick a program from the list to see details and actions.
        </div>
      </div>
    );
  }

  const busy = (id: string) => busyAction === id;
  const anyBusy = busyAction !== null;

  return (
    <motion.div
      key={program.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
      className="flex w-80 shrink-0 flex-col overflow-y-auto border-l border-line bg-surface"
    >
      <div className="flex flex-col items-center gap-3 border-b border-line px-5 py-6 text-center">
        <Avatar program={program} size={64} />
        <div>
          <div className="text-[15px] font-semibold leading-tight">{program.name}</div>
          <div className="mt-0.5 text-[12px] text-faint">
            {program.publisher || "Unknown publisher"}
          </div>
        </div>
      </div>

      <div className="border-b border-line px-5 py-3">
        <MetaRow label="Version" value={program.version || "—"} />
        <MetaRow label="Size" value={formatSizeKb(program.estimatedSizeKb)} />
        <MetaRow label="Installed" value={formatDate(program.installDate)} />
        <MetaRow label="Category" value={CATEGORY_LABELS[bucketOf(program)]} />
        <MetaRow
          label="Source"
          value={`${program.hive}${program.isWow64 ? " · 32-bit" : ""}`}
        />
        {program.installLocation && (
          <button
            onClick={onOpenFolder}
            className="mt-1 flex w-full items-center gap-1.5 truncate text-[12px] text-accent hover:underline"
            title={program.installLocation}
          >
            <IconFolder width={13} height={13} />
            <span className="truncate">Open install folder</span>
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 px-5 py-4">
        <button
          onClick={onUninstall}
          disabled={anyBusy}
          className="flex items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-[13px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <IconTrash width={15} height={15} />
          {busy("uninstall") ? "Uninstalling…" : "Uninstall"}
        </button>

        <button
          onClick={onScanLeftovers}
          disabled={anyBusy}
          className="flex items-center justify-center gap-2 rounded-lg border border-line px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-canvas disabled:opacity-50"
        >
          <IconBroom width={15} height={15} />
          {scanning ? "Scanning…" : "Scan for leftovers"}
        </button>

        <button
          onClick={onForceRemove}
          disabled={anyBusy}
          className="flex items-center justify-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] font-semibold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          <IconWarning width={15} height={15} />
          {busy("force") ? "Removing…" : "Force remove"}
        </button>
        <p className="px-1 text-[11px] leading-relaxed text-faint">
          Force remove skips the app's own uninstaller and deletes its registry
          key and install folder directly.
        </p>
      </div>

      {/* Leftover findings */}
      <AnimatePresence>
        {report && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-line px-5 py-4"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-semibold">
                {report.items.length} leftover
                {report.items.length === 1 ? "" : "s"} found
              </span>
              <span className="text-[11px] text-faint">
                {formatBytes(report.totalSizeBytes)}
              </span>
            </div>

            {report.items.length === 0 ? (
              <p className="text-[12px] text-faint">
                No orphaned files or registry keys detected. Clean!
              </p>
            ) : (
              <>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {report.items.map((item) => (
                    <label
                      key={item.pathOrKey}
                      className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-canvas"
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(item.pathOrKey)}
                        onChange={() =>
                          setPicked((prev) => {
                            const next = new Set(prev);
                            next.has(item.pathOrKey)
                              ? next.delete(item.pathOrKey)
                              : next.add(item.pathOrKey);
                            return next;
                          })
                        }
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
                      />
                      <span className="mt-0.5 shrink-0 text-faint">
                        {item.kind === "registry" ? (
                          <IconRegistry width={13} height={13} />
                        ) : (
                          <IconFolder width={13} height={13} />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block break-all text-[11.5px] leading-snug">
                          {item.pathOrKey}
                        </span>
                        {item.kind === "folder" && (
                          <span className="text-[10.5px] text-faint">
                            {formatBytes(item.sizeBytes)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={() =>
                    onDeleteLeftovers(
                      report.items.filter((i) => picked.has(i.pathOrKey)),
                    )
                  }
                  disabled={anyBusy || picked.size === 0}
                  className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-[12px] font-semibold text-on-danger transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  <IconTrash width={13} height={13} />
                  {busy("delete-leftovers")
                    ? "Deleting…"
                    : `Delete selected (${picked.size})`}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
