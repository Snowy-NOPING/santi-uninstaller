import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconWarning, IconRefresh, IconX } from "./Icons";

export type BatchStatus = "pending" | "running" | "done" | "failed";

export interface BatchItem {
  id: string;
  name: string;
  status: BatchStatus;
  message?: string;
}

interface Props {
  items: BatchItem[] | null;
  running: boolean;
  onClose: () => void;
}

function StatusIcon({ status }: { status: BatchStatus }) {
  switch (status) {
    case "done":
      return (
        <span className="text-good">
          <IconCheck width={14} height={14} />
        </span>
      );
    case "failed":
      return (
        <span className="text-danger">
          <IconWarning width={14} height={14} />
        </span>
      );
    case "running":
      return (
        <span className="animate-spin text-accent">
          <IconRefresh width={14} height={14} />
        </span>
      );
    default:
      return <span className="h-2 w-2 rounded-full bg-line-strong" />;
  }
}

export function BatchProgressModal({ items, running, onClose }: Props) {
  const open = items !== null;
  const done = items?.filter((i) => i.status === "done").length ?? 0;
  const failed = items?.filter((i) => i.status === "failed").length ?? 0;
  const total = items?.length ?? 0;

  return (
    <AnimatePresence>
      {open && items && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={running ? undefined : onClose}
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
              <h2 className="text-[14px] font-semibold">
                {running
                  ? `Uninstalling… (${done + failed}/${total})`
                  : `Batch complete — ${done} done${failed ? `, ${failed} failed` : ""}`}
              </h2>
              <button
                onClick={onClose}
                disabled={running}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink disabled:opacity-40"
              >
                <IconX width={15} height={15} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto px-3 py-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-2.5 rounded-md px-2 py-2"
                >
                  <span className="mt-0.5 flex h-3.5 w-3.5 items-center justify-center">
                    <StatusIcon status={item.status} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">
                      {item.name}
                    </div>
                    {item.message && (
                      <div
                        className={`text-[11px] leading-snug ${
                          item.status === "failed" ? "text-danger" : "text-faint"
                        }`}
                      >
                        {item.message}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!running && (
              <div className="border-t border-line px-5 py-3">
                <button
                  onClick={onClose}
                  className="w-full rounded-lg bg-accent px-3 py-2 text-[12.5px] font-semibold text-on-accent transition-opacity hover:opacity-90"
                >
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
