import { AnimatePresence, motion } from "framer-motion";
import { IconCheck, IconWarning, IconInfo } from "./Icons";

export interface ToastData {
  id: number;
  message: string;
  kind: "success" | "error" | "info";
}

const STYLES = {
  success: { bar: "bg-good", icon: IconCheck, text: "text-good" },
  error: { bar: "bg-danger", icon: IconWarning, text: "text-danger" },
  info: { bar: "bg-accent", icon: IconInfo, text: "text-accent" },
} as const;

export function ToastHost({ toast }: { toast: ToastData | null }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="pointer-events-auto flex max-w-md items-start gap-2.5 overflow-hidden rounded-xl border border-line-strong bg-surface py-2.5 pl-3 pr-4"
          >
            <span className={`mt-0.5 ${STYLES[toast.kind].text}`}>
              {(() => {
                const I = STYLES[toast.kind].icon;
                return <I width={16} height={16} />;
              })()}
            </span>
            <span className="text-[12.5px] leading-snug text-ink">
              {toast.message}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
