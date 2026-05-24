import { Search, Heart, X, CalendarPlus, List as ListIcon, Calendar } from "lucide-react";
import { DateFilter, SortBy, ViewMode } from "../hooks/useFilters";

const DATE_CHIPS: { id: DateFilter; label: string }[] = [
  { id: "all", label: "All upcoming" },
  { id: "today", label: "Today" },
  { id: "weekend", label: "This weekend" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom range" },
];

export function Toolbar({
  dateFilter, setDateFilter,
  customStart, setCustomStart,
  customEnd, setCustomEnd,
  savedOnly, setSavedOnly, savedCount,
  searchQuery, setSearchQuery,
  sortBy, setSortBy,
  onBulkExport,
  viewMode, setViewMode,
}: {
  dateFilter: DateFilter; setDateFilter: (d: DateFilter) => void;
  customStart: string; setCustomStart: (s: string) => void;
  customEnd: string; setCustomEnd: (s: string) => void;
  savedOnly: boolean; setSavedOnly: (b: boolean) => void; savedCount: number;
  searchQuery: string; setSearchQuery: (s: string) => void;
  sortBy: SortBy; setSortBy: (s: SortBy) => void;
  onBulkExport: () => void;
  viewMode: ViewMode; setViewMode: (v: ViewMode) => void;
}) {
  const chipCls = (active: boolean) =>
    `px-3 py-1.5 text-xs font-semibold rounded-full transition-all ${
      active
        ? "bg-slate-900 text-white dark:bg-zinc-100 dark:text-black"
        : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900"
    }`;

  return (
    <section className="col-span-full sticky top-[57px] z-40 bg-slate-50/80 dark:bg-black/80 backdrop-blur-xl py-3 border-b border-slate-200/60 dark:border-zinc-800/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="flex flex-wrap items-center gap-1.5" id="date-chips">
        {DATE_CHIPS.map((chip) => (
          <button
            key={chip.id}
            onClick={() => { setDateFilter(chip.id); setSavedOnly(false); }}
            className={chipCls(dateFilter === chip.id && !savedOnly)}
          >
            {chip.label}
          </button>
        ))}

        {dateFilter === "custom" && (
          <div className="flex items-center gap-1.5 pl-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="Start date"
            />
            <span className="text-slate-400 text-xs">→</span>
            <input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="px-2 py-1 text-xs rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-700 dark:text-zinc-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              aria-label="End date"
            />
            {(customStart || customEnd) && (
              <button
                onClick={() => { setCustomStart(""); setCustomEnd(""); }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300 p-1"
                title="Clear range"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        <div className="w-px h-6 bg-slate-200 dark:bg-zinc-800 mx-1" />

        <button
          onClick={() => setSavedOnly(!savedOnly)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-all flex items-center gap-1.5 ${
            savedOnly
              ? "bg-[#ff3b30] text-white"
              : "bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-900 text-[#ff3b30]"
          }`}
        >
          <Heart size={12} fill={savedOnly ? "currentColor" : "none"} />
          Saved <span className="opacity-80">({savedCount})</span>
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:justify-end">
        <div className="relative flex-1 sm:flex-initial">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search artists, sports, venues..."
            aria-label="Search events"
            className="w-full sm:w-60 pl-8 pr-7 py-2 bg-white/60 dark:bg-zinc-950/60 border border-slate-200 dark:border-zinc-800 rounded-full text-xs focus:outline-none focus:ring-1 focus:ring-slate-500 dark:focus:ring-zinc-500"
          />
          <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-zinc-300"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          aria-label="Sort events"
          className="px-3 py-1.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-xs text-slate-700 dark:text-zinc-300 focus:outline-none"
        >
          <option value="soonest">Soonest</option>
          <option value="endingSoon">Ending soon</option>
          <option value="lowestPrice">Lowest price</option>
          <option value="recentlyAdded">Recently added</option>
        </select>

        <button
          onClick={onBulkExport}
          className="p-1.5 rounded-full border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-900 transition-all"
          title="Export all visible events to your calendar (.ics)"
          aria-label="Export visible events"
        >
          <CalendarPlus size={14} />
        </button>

        <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-100 dark:bg-zinc-900">
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "list" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"}`}
            title="List View"
            aria-label="List view"
          >
            <ListIcon size={14} />
          </button>
          <button
            onClick={() => setViewMode("calendar")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "calendar" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"}`}
            title="Calendar View"
            aria-label="Calendar view"
          >
            <Calendar size={14} />
          </button>
          <button
            onClick={() => setViewMode("plan")}
            className={`p-1.5 rounded-md transition-all ${viewMode === "plan" ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"}`}
            title="My Plan (saved itinerary)"
            aria-label="My plan"
          >
            <Heart size={14} />
          </button>
        </div>
      </div>
    </section>
  );
}
