import { AnimatePresence } from "framer-motion";
import { ProgramRow } from "./ProgramRow";
import type { InstalledProgram } from "../types";

interface Props {
  programs: InstalledProgram[];
  loading: boolean;
  selectedId: string | null;
  checked: Set<string>;
  leftoverIds: Set<string>;
  busyId: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onUninstall: (p: InstalledProgram) => void;
}

function Skeleton() {
  return (
    <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
      <div className="h-4 w-4 rounded bg-canvas" />
      <div className="h-9 w-9 rounded-lg bg-canvas" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-40 rounded bg-canvas" />
        <div className="h-2.5 w-24 rounded bg-canvas" />
      </div>
      <div className="h-3 w-14 rounded bg-canvas" />
    </div>
  );
}

export function ProgramList({
  programs,
  loading,
  selectedId,
  checked,
  leftoverIds,
  busyId,
  onSelect,
  onToggle,
  onUninstall,
}: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-center gap-3 border-b border-line bg-canvas/60 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
        <span className="w-4" />
        <span className="w-9" />
        <span className="flex-1">Name</span>
        <span className="w-20 text-right">Size</span>
        <span className="hidden w-24 text-right sm:block">Installed</span>
        <span className="w-[86px]" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="animate-pulse">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} />
            ))}
          </div>
        ) : programs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-10 text-center">
            <div className="text-[14px] font-medium text-muted">
              No programs here
            </div>
            <div className="text-[12px] text-faint">
              Try a different category or clear the search.
            </div>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {programs.map((p) => (
              <ProgramRow
                key={p.id}
                program={p}
                selected={selectedId === p.id}
                checked={checked.has(p.id)}
                hasLeftovers={leftoverIds.has(p.id)}
                busy={busyId === p.id}
                onSelect={() => onSelect(p.id)}
                onToggle={() => onToggle(p.id)}
                onUninstall={() => onUninstall(p)}
              />
            ))}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
