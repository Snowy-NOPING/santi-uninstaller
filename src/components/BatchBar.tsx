import { AnimatePresence, motion } from "framer-motion";
import { IconTrash, IconX } from "./Icons";

interface Props {
  count: number;
  busy: boolean;
  onUninstall: () => void;
  onClear: () => void;
}

export function BatchBar({ count, busy, onUninstall, onClear }: Props) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: 44, marginBottom: 8 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-3 overflow-hidden rounded-lg border border-accent/30 bg-accent-soft px-3"
        >
          <span className="text-[13px] font-semibold text-accent">
            {count} selected
          </span>
          <button
            onClick={onUninstall}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <IconTrash width={14} height={14} />
            {busy ? "Uninstalling…" : "Uninstall selected"}
          </button>
          <button
            onClick={onClear}
            className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-muted hover:text-ink"
          >
            <IconX width={14} height={14} />
            Clear
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
