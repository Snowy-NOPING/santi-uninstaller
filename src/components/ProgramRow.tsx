import { motion } from "framer-motion";
import { Avatar } from "./Avatar";
import { IconTrash, IconBroom } from "./Icons";
import { formatDate, formatSizeKb } from "../format";
import type { InstalledProgram } from "../types";

interface Props {
  program: InstalledProgram;
  selected: boolean;
  checked: boolean;
  hasLeftovers: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggle: () => void;
  onUninstall: () => void;
}

export function ProgramRow({
  program,
  selected,
  checked,
  hasLeftovers,
  busy,
  onSelect,
  onToggle,
  onUninstall,
}: Props) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onSelect}
      className={`group flex cursor-pointer items-center gap-3 border-b border-line px-3 py-2.5 transition-colors ${
        selected ? "bg-accent-soft" : "hover:bg-canvas"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="h-4 w-4 shrink-0 cursor-pointer accent-accent"
      />

      <Avatar program={program} size={36} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium">{program.name}</span>
          {hasLeftovers && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-flag-soft px-1.5 py-0.5 text-[10px] font-semibold text-flag">
              <IconBroom width={10} height={10} />
              leftovers
            </span>
          )}
        </div>
        <div className="truncate text-[11.5px] text-faint">
          {program.publisher || "Unknown publisher"}
        </div>
      </div>

      <div className="w-20 shrink-0 text-right text-[12px] tabular-nums text-muted">
        {formatSizeKb(program.estimatedSizeKb)}
      </div>
      <div className="hidden w-24 shrink-0 text-right text-[12px] tabular-nums text-faint sm:block">
        {formatDate(program.installDate)}
      </div>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onUninstall();
        }}
        disabled={busy}
        className="flex shrink-0 items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-[12px] font-medium text-muted opacity-0 transition group-hover:opacity-100 hover:border-danger/40 hover:text-danger disabled:opacity-50 data-[selected=true]:opacity-100"
        data-selected={selected}
      >
        <IconTrash width={13} height={13} />
        Uninstall
      </button>
    </motion.div>
  );
}
