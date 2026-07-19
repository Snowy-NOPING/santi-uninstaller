import { AnimatePresence, motion } from "framer-motion";
import { IconX } from "./Icons";

export interface AppSettings {
  cleanLeftoversFirst: boolean;
}

interface Props {
  open: boolean;
  settings: AppSettings;
  onChange: (next: AppSettings) => void;
  onClose: () => void;
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-line-strong"
      }`}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 600, damping: 34 }}
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white ${
          checked ? "right-0.5" : "left-0.5"
        }`}
      />
    </button>
  );
}

export function Settings({ open, settings, onChange, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
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
              <h2 className="text-[14px] font-semibold">Settings</h2>
              <button
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-canvas hover:text-ink"
              >
                <IconX width={15} height={15} />
              </button>
            </div>

            <div className="px-5 py-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                Uninstall behavior
              </p>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-line p-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-medium">
                    Clean leftovers before uninstalling
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted">
                    When you uninstall, first scan for and delete orphaned app
                    data and registry keys, then run the program's uninstaller.
                    The install folder is kept so the uninstaller can run — it
                    removes that itself.
                  </p>
                </div>
                <Toggle
                  checked={settings.cleanLeftoversFirst}
                  onChange={(v) =>
                    onChange({ ...settings, cleanLeftoversFirst: v })
                  }
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
