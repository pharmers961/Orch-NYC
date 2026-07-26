import { X } from "lucide-react";
import { useFilters, DateFilter } from "../hooks/useFilters";
import { ALL_CATEGORY_IDS } from "../lib/constants";

const DATE_LABELS: Record<Exclude<DateFilter, "all">, string> = {
  today: "Today",
  weekend: "This weekend",
  week: "This week",
  month: "This month",
  custom: "Custom range",
};

type Filters = ReturnType<typeof useFilters>;

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      onClick={onRemove}
      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 text-[11px] font-semibold hover:bg-indigo-600/20 transition-all"
    >
      {label}
      <X size={11} />
    </button>
  );
}

export function ActiveFilters({ filters, totalCategories }: { filters: Filters; totalCategories: number }) {
  if (!filters.isFiltered) return null;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];

  if (filters.searchQuery.trim())
    chips.push({ key: "q", label: `“${filters.searchQuery.trim()}”`, onRemove: () => filters.setSearchQuery("") });

  // "This weekend" is the default view, so it isn't shown as a removable chip.
  if (filters.dateFilter !== "all" && filters.dateFilter !== "weekend")
    chips.push({ key: "date", label: DATE_LABELS[filters.dateFilter], onRemove: () => filters.setDateFilter("weekend") });

  filters.selectedAges.forEach((a) =>
    chips.push({ key: `a-${a}`, label: `Ages ${a}`, onRemove: () => filters.setSelectedAges((prev) => prev.filter((x) => x !== a)) })
  );

  if (filters.savedOnly)
    chips.push({ key: "saved", label: "Saved only", onRemove: () => filters.setSavedOnly(false) });

  if (filters.freeOnly)
    chips.push({ key: "free", label: "Free only", onRemove: () => filters.setFreeOnly(false) });

  if (filters.maxPrice > 0)
    chips.push({ key: "price", label: `Up to $${filters.maxPrice}`, onRemove: () => filters.setMaxPrice(0) });

  filters.selectedCities.forEach((b) =>
    chips.push({ key: `b-${b}`, label: b, onRemove: () => filters.setSelectedCities((prev) => prev.filter((x) => x !== b)) })
  );

  filters.selectedVenues.forEach((v) =>
    chips.push({ key: `v-${v}`, label: v, onRemove: () => filters.setSelectedVenues(filters.selectedVenues.filter((x) => x !== v)) })
  );

  filters.selectedTags.forEach((t) =>
    chips.push({ key: `t-${t}`, label: `#${t}`, onRemove: () => filters.setSelectedTags((prev) => prev.filter((x) => x !== t)) })
  );

  if (filters.hiddenSources.length > 0)
    chips.push({ key: "sources", label: "Sources filtered", onRemove: () => filters.setHiddenSources([]) });

  if (filters.selectedCategories.length !== totalCategories)
    chips.push({ key: "cats", label: `Categories (${filters.selectedCategories.length})`, onRemove: () => filters.setSelectedCategories(ALL_CATEGORY_IDS) });

  return (
    <div className="col-span-full flex flex-wrap items-center gap-2 -mt-2">
      <span className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Filters</span>
      {chips.map((c) => (
        <Chip key={c.key} label={c.label} onRemove={c.onRemove} />
      ))}
      <button
        onClick={filters.clearAllFilters}
        className="text-[11px] font-semibold text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white underline underline-offset-2"
      >
        Clear all
      </button>
    </div>
  );
}
