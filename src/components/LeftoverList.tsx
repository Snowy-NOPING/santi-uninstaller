import { useEffect, useState } from "react";
import { IconTrash, IconFolder, IconRegistry, IconShortcut } from "./Icons";
import { formatBytes } from "../format";
import type { LeftoverItem } from "../types";

/** Stable id — registry_value items share a key path, so include the value. */
export const itemId = (i: LeftoverItem) =>
  i.valueName ? `${i.pathOrKey}||${i.valueName}` : i.pathOrKey;

function LeftoverIcon({ kind }: { kind: LeftoverItem["kind"] }) {
  if (kind === "registry" || kind === "registry_value")
    return <IconRegistry width={13} height={13} />;
  if (kind === "shortcut") return <IconShortcut width={13} height={13} />;
  return <IconFolder width={13} height={13} />;
}

interface Props {
  items: LeftoverItem[];
  busy: boolean;
  onDelete: (items: LeftoverItem[]) => void;
}

/** Checkboxed list of leftover items with a "Delete selected" action. */
export function LeftoverList({ items, busy, onDelete }: Props) {
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(items.map(itemId)),
  );

  // Re-select everything whenever the item set changes (new scan).
  useEffect(() => {
    setPicked(new Set(items.map(itemId)));
  }, [items]);

  return (
    <>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {items.map((item) => {
          const id = itemId(item);
          const hasSize = item.kind === "folder" || item.kind === "shortcut";
          return (
            <label
              key={id}
              className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 hover:bg-canvas"
            >
              <input
                type="checkbox"
                checked={picked.has(id)}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })
                }
                className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-accent"
              />
              <span className="mt-0.5 shrink-0 text-faint">
                <LeftoverIcon kind={item.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-all text-[11.5px] leading-snug">
                  {item.kind === "registry_value" && item.valueName
                    ? `${item.pathOrKey} \\ ${item.valueName}`
                    : item.pathOrKey}
                </span>
                {hasSize && (
                  <span className="text-[10.5px] text-faint">
                    {formatBytes(item.sizeBytes)}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      <button
        onClick={() => onDelete(items.filter((i) => picked.has(itemId(i))))}
        disabled={busy || picked.size === 0}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-danger px-3 py-2 text-[12px] font-semibold text-on-danger transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        <IconTrash width={13} height={13} />
        {busy ? "Deleting…" : `Delete selected (${picked.size})`}
      </button>
    </>
  );
}
