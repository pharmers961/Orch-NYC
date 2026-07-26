import { useCallback, useMemo, useState } from "react";
import { EventItem, EventCategory } from "../types";
import { ALL_CATEGORY_IDS, AGE_BUCKETS } from "../lib/constants";
import { getCity, parseLowestNumericPrice } from "../lib/events";

export type DateFilter = "all" | "today" | "weekend" | "week" | "month" | "custom";
export type SortBy = "soonest" | "lowestPrice" | "recentlyAdded" | "endingSoon";
export type ViewMode = "list" | "calendar" | "map" | "plan";

// True when the event's stated age range overlaps a selected bucket. Events
// with no stated ages (or "all") always pass — most sources don't state ages,
// so the filter removes clear mismatches rather than demanding matches.
function agesMatch(eventAges: string | undefined, selected: string[]): boolean {
  if (selected.length === 0) return true;
  if (!eventAges || eventAges === "all") return true;
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(eventAges);
  if (!m) return true;
  const lo = +m[1];
  const hi = +m[2];
  return selected.some((id) => {
    const b = AGE_BUCKETS.find((x) => x.id === id);
    return b ? lo <= b.hi && hi >= b.lo : false;
  });
}

export function useFilters(events: EventItem[], savedIds: string[], viewMode: ViewMode) {
  const [hiddenSources, setHiddenSources] = useState<string[]>([]);
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<EventCategory[]>(ALL_CATEGORY_IDS);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // Parents plan weekends — land there by default.
  const [dateFilter, setDateFilter] = useState<DateFilter>("weekend");
  const [selectedAges, setSelectedAges] = useState<string[]>([]);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortBy>("soonest");
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [maxPrice, setMaxPrice] = useState<number>(0); // 0 = no cap
  const [freeOnly, setFreeOnly] = useState(false);

  const activeSources = useMemo(
    () => [...new Set(events.map((e) => e.source).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [events]
  );
  const activeVenues = useMemo(() => [...new Set(events.map((e) => e.venue))].sort(), [events]);

  const venueStats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => (counts[e.venue] = (counts[e.venue] || 0) + 1));
    return counts;
  }, [events]);

  const sourceStats = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => (counts[e.source] = (counts[e.source] || 0) + 1));
    return counts;
  }, [events]);

  const activeTags = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => (e.tags || []).forEach((t) => (counts[t] = (counts[t] || 0) + 1)));
    return counts;
  }, [events]);

  const filteredEventsList = useMemo(() => {
    return events
      .filter((e) => {
        if (!selectedCategories.includes(e.cat)) return false;
        if (hiddenSources.includes(e.source)) return false;
        if (selectedVenues.length > 0 && !selectedVenues.includes(e.venue)) return false;
        if (selectedCities.length > 0 && !selectedCities.includes(getCity(e.area, e.venue))) return false;
        if (!agesMatch(e.ages, selectedAges)) return false;

        const isFree = /free/i.test(e.price) || parseLowestNumericPrice(e.price) === 0;
        if (freeOnly && !isFree) return false;
        if (maxPrice > 0) {
          const low = parseLowestNumericPrice(e.price);
          if (low !== 99999 && low > maxPrice) return false;
        }

        if (savedOnly && !savedIds.includes(e.id)) return false;

        if (selectedTags.length > 0) {
          const evTags = e.tags || [];
          if (!evTags.some((t) => selectedTags.includes(t))) return false;
        }

        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase();
          const match =
            e.title.toLowerCase().includes(q) ||
            e.artist.toLowerCase().includes(q) ||
            e.venue.toLowerCase().includes(q) ||
            (e.desc ? e.desc.toLowerCase().includes(q) : false);
          if (!match) return false;
        }

        // Date period filter (only applied in list/plan view, not the calendar grid)
        if (viewMode === "list" || viewMode === "plan") {
          const evDate = new Date(e.start);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (dateFilter === "today") {
            const endOfToday = new Date(today);
            endOfToday.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > endOfToday) return false;
          } else if (dateFilter === "weekend") {
            // "This weekend" = the upcoming Fri-Sun, still including today when
            // it's already Saturday or Sunday (5-day offset alone would jump a
            // Sunday visitor to NEXT weekend).
            const currentDay = today.getDay();
            const friOffset = currentDay === 0 ? -2 : 5 - currentDay;
            const fri = new Date(today);
            fri.setDate(today.getDate() + friOffset);
            const sun = new Date(fri);
            sun.setDate(fri.getDate() + 2);
            sun.setHours(23, 59, 59, 999);
            if (evDate < fri || evDate > sun) return false;
          } else if (dateFilter === "week") {
            const sevenDaysLater = new Date(today);
            sevenDaysLater.setDate(today.getDate() + 7);
            sevenDaysLater.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > sevenDaysLater) return false;
          } else if (dateFilter === "month") {
            const thirtyDaysLater = new Date(today);
            thirtyDaysLater.setDate(today.getDate() + 30);
            thirtyDaysLater.setHours(23, 59, 59, 999);
            if (evDate < today || evDate > thirtyDaysLater) return false;
          } else if (dateFilter === "custom") {
            if (customStart) {
              const start = new Date(`${customStart}T00:00:00`);
              if (evDate < start) return false;
            }
            if (customEnd) {
              const end = new Date(`${customEnd}T23:59:59`);
              if (evDate > end) return false;
            }
            if (!customStart && !customEnd && evDate < today) return false;
          } else {
            if (evDate < today) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "soonest") return new Date(a.start).getTime() - new Date(b.start).getTime();
        if (sortBy === "recentlyAdded") return b.added - a.added;
        if (sortBy === "lowestPrice") return parseLowestNumericPrice(a.price) - parseLowestNumericPrice(b.price);
        if (sortBy === "endingSoon") {
          const now = Date.now();
          const ta = new Date(a.start).getTime();
          const tb = new Date(b.start).getTime();
          return (ta < now ? Infinity : ta) - (tb < now ? Infinity : tb);
        }
        return 0;
      });
  }, [
    events, selectedCategories, hiddenSources, selectedVenues, selectedCities, selectedAges, maxPrice, freeOnly,
    savedOnly, savedIds, searchQuery, dateFilter, customStart, customEnd, sortBy, selectedTags, viewMode,
  ]);

  const stats = useMemo(() => ({
    events: filteredEventsList.length,
    venues: new Set(filteredEventsList.map((e) => e.venue)).size,
    sources: new Set(filteredEventsList.map((e) => e.source)).size,
  }), [filteredEventsList]);

  const isolateSource = useCallback(
    (source: string) => setHiddenSources(activeSources.filter((s) => s !== source)),
    [activeSources]
  );

  const toggleSource = useCallback((source: string) => {
    setHiddenSources((prev) => (prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source]));
  }, []);

  const clearAllFilters = useCallback(() => {
    setSelectedCategories(ALL_CATEGORY_IDS);
    setHiddenSources([]);
    setSelectedVenues([]);
    setSelectedCities([]);
    setSelectedAges([]);
    setMaxPrice(0);
    setFreeOnly(false);
    setDateFilter("weekend");
    setCustomStart("");
    setCustomEnd("");
    setSearchQuery("");
    setSavedOnly(false);
    setSelectedTags([]);
  }, []);

  const isFiltered =
    selectedCategories.length !== ALL_CATEGORY_IDS.length ||
    hiddenSources.length > 0 ||
    selectedVenues.length > 0 ||
    selectedCities.length > 0 ||
    selectedAges.length > 0 ||
    maxPrice > 0 ||
    freeOnly ||
    dateFilter !== "weekend" ||
    searchQuery.trim() !== "" ||
    savedOnly ||
    selectedTags.length > 0;

  return {
    // state
    hiddenSources, setHiddenSources,
    selectedVenues, setSelectedVenues,
    selectedCategories, setSelectedCategories,
    selectedTags, setSelectedTags,
    dateFilter, setDateFilter,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    searchQuery, setSearchQuery,
    sortBy, setSortBy,
    savedOnly, setSavedOnly,
    selectedCities, setSelectedCities,
    selectedAges, setSelectedAges,
    maxPrice, setMaxPrice,
    freeOnly, setFreeOnly,
    // derived
    activeSources, activeVenues, venueStats, sourceStats, activeTags,
    filteredEventsList, stats, isFiltered,
    // actions
    isolateSource, toggleSource, clearAllFilters,
  };
}
