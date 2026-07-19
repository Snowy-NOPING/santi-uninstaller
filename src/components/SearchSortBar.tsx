import { IconSearch, IconChevron, IconRefresh } from "./Icons";
import type { SortId } from "../types";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  sort: SortId;
  onSort: (v: SortId) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

const SORT_LABELS: Record<SortId, string> = {
  name: "Name",
  size: "Size",
  date: "Install date",
};

export function SearchSortBar({
  search,
  onSearch,
  sort,
  onSort,
  onRefresh,
  refreshing,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint">
          <IconSearch width={16} height={16} />
        </span>
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search apps or publishers…"
          className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-[13px] outline-none placeholder:text-faint focus:border-accent"
        />
      </div>

      <div className="relative">
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortId)}
          className="appearance-none rounded-lg border border-line bg-surface py-2 pl-3 pr-8 text-[13px] font-medium outline-none focus:border-accent"
        >
          {(Object.keys(SORT_LABELS) as SortId[]).map((k) => (
            <option key={k} value={k}>
              Sort: {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-faint">
          <IconChevron width={15} height={15} />
        </span>
      </div>

      <button
        onClick={onRefresh}
        disabled={refreshing}
        title="Re-scan the registry"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-lg border border-line bg-surface text-muted transition-colors hover:text-ink disabled:opacity-50"
      >
        <span className={refreshing ? "animate-spin" : ""}>
          <IconRefresh width={16} height={16} />
        </span>
      </button>
    </div>
  );
}
