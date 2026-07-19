import { AnimatePresence, motion } from "framer-motion";
import { IconBroom, IconX } from "./Icons";
import { LeftoverList } from "./LeftoverList";
import { formatBytes } from "../format";
import type { LeftoverItem, LeftoverReport } from "../types";

interface Props {
  programName: string | null;
  report: LeftoverReport | null;
  busy: boolean;
  onDelete: (items: LeftoverItem[]) => void;
  onClose: () => void;
}

/**
 * Shown right after a force-remove when leftovers were found. Lets the user
 * immediately clean them without running a separate manual scan.
 */
export function LeftoverCleanupModal({
  programName,
  report,
  busy,
  onDelete,
  onClose,
}: Props) {
  const open = report !== null && programName !== null;
  return (
    <AnimatePresence>
      {open && report && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-hidden rounded-xl border border-line bg-surface"
          >
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
              <div className="flex items-center gap-2">
                <span className="text-flag">
                  <IconBroom width={16} height={16} />
                </span>
                <h2 className="text-[14px] font-semibold">Clean up leftovers</h2>
              </div>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <IconX width={15} height={15} />
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">{programName}</span> was
                force-removed. {report.items.length} leftover
                {report.items.length === 1 ? "" : "s"} still on disk (
                {formatBytes(report.totalSizeBytes)}). Select what to delete.
              </p>
              <LeftoverList items={report.items} busy={busy} onDelete={onDelete} />
              <button
                onClick={onClose}
                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-[12px] font-medium text-muted transition-colors hover:bg-canvas"
              >
                Skip / keep them
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
