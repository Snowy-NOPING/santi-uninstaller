import { motion } from "framer-motion";
import { CATEGORY_ICONS } from "./Icons";
import { CATEGORY_LABELS } from "../format";
import type { CategoryId } from "../types";

interface Props {
  active: CategoryId;
  counts: Record<CategoryId, number>;
  onSelect: (c: CategoryId) => void;
}

const ORDER: CategoryId[] = ["all", "recent", "large", "windows", "leftovers"];

export function Sidebar({ active, counts, onSelect }: Props) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-surface">
      <div className="flex items-center gap-2 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-on-accent">
          s.
        </div>
        <div className="text-[13px] font-semibold tracking-tight">
          santi<span className="text-faint">.uninstaller</span>
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 py-2">
        {ORDER.map((id) => {
          const Icon = CATEGORY_ICONS[id];
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onSelect(id)}
              className="relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors"
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-accent-soft"
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              )}
              <span
                className={`relative z-10 ${isActive ? "text-accent" : "text-faint"}`}
              >
                <Icon width={17} height={17} />
              </span>
              <span
                className={`relative z-10 flex-1 text-left font-medium ${
                  isActive ? "text-accent" : "text-ink"
                }`}
              >
                {CATEGORY_LABELS[id]}
              </span>
              <span
                className={`relative z-10 min-w-6 rounded-md px-1.5 py-0.5 text-center text-[11px] font-semibold tabular-nums ${
                  isActive
                    ? "bg-accent text-on-accent"
                    : "bg-canvas text-muted"
                }`}
              >
                {counts[id]}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-5 py-4 text-[11px] leading-relaxed text-faint">
        Reads the Windows registry directly. Uninstall actions run the real
        uninstaller.
      </div>
    </aside>
  );
}
