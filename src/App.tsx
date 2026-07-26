import { useEffect, useMemo, useState } from "react";
import { Sparkles, AlertCircle } from "lucide-react";
import { EventCategory } from "./types";
import { CATEGORIES, ALL_CATEGORY_IDS } from "./lib/constants";
import { localDateKey, downloadMultiICS } from "./lib/events";
import { useTheme } from "./hooks/useTheme";
import { useEvents } from "./hooks/useEvents";
import { useFilters, ViewMode, SortBy } from "./hooks/useFilters";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { Footer } from "./components/Footer";
import { Toolbar } from "./components/Toolbar";
import { StatusBanners } from "./components/StatusBanners";
import { ActiveFilters } from "./components/ActiveFilters";
import { FiltersSidebar } from "./components/FiltersSidebar";
import { EventCard } from "./components/EventCard";
import { CalendarView } from "./components/CalendarView";
import { PlanView } from "./components/PlanView";
import { EventModal } from "./components/EventModal";
import { DayAgendaPopover } from "./components/DayAgendaPopover";
import { ManualEventModal } from "./components/ManualEventModal";

export default function App() {
  const { theme, cycleTheme } = useTheme();
  const {
    events, savedIds, customVenueColors, setCustomVenueColors,
    loading, errorMessage, setErrorMessage, apiSuccessNote, setApiSuccessNote,
    lastUpdated, addManualEvent, toggleSave, addTag, removeTag,
  } = useEvents();

  // View + modal UI state
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [addEventOpen, setAddEventOpen] = useState(false);
  const [dayAgendaKey, setDayAgendaKey] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState("");

  const filters = useFilters(events, savedIds, viewMode);

  // Auto-dismiss the success toast.
  useEffect(() => {
    if (!apiSuccessNote) return;
    const t = setTimeout(() => setApiSuccessNote(null), 4000);
    return () => clearTimeout(t);
  }, [apiSuccessNote, setApiSuccessNote]);

  // Esc closes the mobile filter drawer (modals trap their own Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sidebarOpen && !selectedEventId && !addEventOpen && !dayAgendaKey) {
        setSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen, selectedEventId, addEventOpen, dayAgendaKey]);

  // Persist primary view state to the URL (shareable + survives reload).
  useEffect(() => {
    const params = new URLSearchParams();
    if (viewMode !== "list") params.set("view", viewMode);
    if (filters.sortBy !== "soonest") params.set("sort", filters.sortBy);
    if (filters.dateFilter !== "all") params.set("when", filters.dateFilter);
    if (filters.savedOnly) params.set("saved", "1");
    if (filters.searchQuery.trim()) params.set("q", filters.searchQuery.trim());
    if (filters.selectedCities.length) params.set("cities", filters.selectedCities.join(","));
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [viewMode, filters.sortBy, filters.dateFilter, filters.savedOnly, filters.searchQuery, filters.selectedCities]);

  // Read view state from the URL once on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get("view");
    if (v === "calendar" || v === "plan" || v === "list") setViewMode(v);
    const s = params.get("sort");
    if (s === "endingSoon" || s === "lowestPrice" || s === "recentlyAdded" || s === "soonest") filters.setSortBy(s as SortBy);
    const w = params.get("when");
    if (w === "today" || w === "weekend" || w === "week" || w === "month" || w === "all") filters.setDateFilter(w);
    if (params.get("saved") === "1") filters.setSavedOnly(true);
    const q = params.get("q");
    if (q) filters.setSearchQuery(q);
    const b = params.get("cities");
    if (b) filters.setSelectedCities(b.split(",").filter(Boolean));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const eventsByLocalDate = useMemo(() => {
    const map: Record<string, typeof filters.filteredEventsList> = {};
    filters.filteredEventsList.forEach((e) => {
      const key = localDateKey(new Date(e.start));
      (map[key] = map[key] || []).push(e);
    });
    Object.values(map).forEach((list) => list.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()));
    return map;
  }, [filters.filteredEventsList]);

  const savedEvents = useMemo(() => events.filter((e) => savedIds.includes(e.id)), [events, savedIds]);
  const activeEvent = useMemo(() => events.find((e) => e.id === selectedEventId) || null, [events, selectedEventId]);

  const onToggleCategory = (cat: EventCategory) =>
    filters.setSelectedCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  const onToggleVenue = (venue: string) =>
    filters.setSelectedVenues(filters.selectedVenues.includes(venue) ? filters.selectedVenues.filter((v) => v !== venue) : [...filters.selectedVenues, venue]);

  const handleBulkExport = (list: typeof events, filename: string) => {
    const n = downloadMultiICS(list, filename);
    if (n === 0) setErrorMessage("No events to export with the current filters.");
    else setApiSuccessNote(`Exported ${n} event(s) to ${filename}.`);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-[#000000] text-slate-900 dark:text-zinc-100 transition-colors duration-300 flex flex-col antialiased">
      {loading && <div className="fixed top-0 left-0 right-0 h-1 z-[110] bg-gradient-to-r from-blue-500 to-indigo-600 animate-pulse" />}

      <Nav theme={theme} onCycleTheme={cycleTheme} onAddEvent={() => setAddEventOpen(true)} onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} />

      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 flex-1 flex flex-col md:grid md:grid-cols-[260px_minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)] gap-8 pb-16">
        <Hero stats={filters.stats} />

        <StatusBanners
          errorMessage={errorMessage}
          onClearError={() => setErrorMessage(null)}
          apiSuccessNote={apiSuccessNote}
          onClearSuccess={() => setApiSuccessNote(null)}
        />

        <Toolbar
          dateFilter={filters.dateFilter} setDateFilter={filters.setDateFilter}
          customStart={filters.customStart} setCustomStart={filters.setCustomStart}
          customEnd={filters.customEnd} setCustomEnd={filters.setCustomEnd}
          savedOnly={filters.savedOnly} setSavedOnly={filters.setSavedOnly} savedCount={savedIds.length}
          searchQuery={filters.searchQuery} setSearchQuery={filters.setSearchQuery}
          sortBy={filters.sortBy} setSortBy={filters.setSortBy}
          onBulkExport={() => handleBulkExport(filters.filteredEventsList, "sprout-scout-events.ics")}
          viewMode={viewMode} setViewMode={setViewMode}
        />

        <ActiveFilters filters={filters} totalCategories={ALL_CATEGORY_IDS.length} />

        <FiltersSidebar
          events={events}
          sidebarOpen={sidebarOpen}
          onCloseSidebar={() => setSidebarOpen(false)}
          selectedCategories={filters.selectedCategories}
          onToggleCategory={onToggleCategory}
          selectedCities={filters.selectedCities}
          setSelectedCities={filters.setSelectedCities}
          freeOnly={filters.freeOnly}
          setFreeOnly={filters.setFreeOnly}
          maxPrice={filters.maxPrice}
          setMaxPrice={filters.setMaxPrice}
          activeSources={filters.activeSources}
          sourceStats={filters.sourceStats}
          hiddenSources={filters.hiddenSources}
          setHiddenSources={filters.setHiddenSources}
          isolateSource={filters.isolateSource}
          toggleSource={filters.toggleSource}
          activeVenues={filters.activeVenues}
          venueStats={filters.venueStats}
          selectedVenues={filters.selectedVenues}
          onToggleVenue={onToggleVenue}
          setSelectedVenues={filters.setSelectedVenues}
          customVenueColors={customVenueColors}
          activeTags={filters.activeTags}
          selectedTags={filters.selectedTags}
          setSelectedTags={filters.setSelectedTags}
        />

        <main className="space-y-6 min-w-0">
          {events.length === 0 && !loading && (
            <div className="p-8 sm:p-12 rounded-2xl bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800 text-center">
              <Sparkles size={32} className="text-indigo-500 mx-auto mb-4" />
              <h3 className="font-bold text-lg text-slate-800 dark:text-zinc-200">No events loaded yet</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 max-w-md mx-auto">
                Events load automatically from the East Bay kids feed, which refreshes a few times a day. If nothing appears, the feed may still be updating — check back shortly, or add your own event.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={() => setAddEventOpen(true)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-full">
                  Add an event
                </button>
              </div>
            </div>
          )}

          {loading && events.length === 0 && (
            <div className="space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-white/40 dark:bg-zinc-950/40 border border-slate-200/60 dark:border-zinc-800/60 p-4 animate-pulse flex gap-4">
                  <div className="w-16 bg-slate-200 dark:bg-zinc-800 h-full rounded-xl" />
                  <div className="w-24 bg-slate-200 dark:bg-zinc-800 h-full rounded-xl shrink-0" />
                  <div className="flex-1 space-y-3 pt-2">
                    <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-1/3" />
                    <div className="h-4 bg-slate-200 dark:bg-zinc-800 rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {viewMode === "list" && filters.filteredEventsList.length === 0 && events.length > 0 && (
            <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-950/60 backdrop-blur-sm border border-slate-200/60 dark:border-zinc-800">
              <AlertCircle size={32} className="text-slate-400 mx-auto mb-4" />
              <h3 className="font-bold text-base text-slate-800 dark:text-zinc-200">No matching listings found</h3>
              <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">We couldn't locate any loaded events matching your filters. Try clearing them.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button onClick={filters.clearAllFilters} className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-zinc-200 dark:text-slate-900 hover:opacity-90 rounded-full">
                  Clear all filters
                </button>
              </div>
            </div>
          )}

          {viewMode === "list" && filters.filteredEventsList.length > 0 && (
            <div className="space-y-4">
              {filters.filteredEventsList.map((item) => (
                <EventCard
                  key={item.id}
                  item={item}
                  isSaved={savedIds.includes(item.id)}
                  onSelect={() => setSelectedEventId(item.id)}
                  onToggleSave={() => toggleSave(item.id)}
                  onIsolateSource={() => filters.isolateSource(item.source)}
                  customVenueColors={customVenueColors}
                />
              ))}
            </div>
          )}

          {viewMode === "calendar" && events.length > 0 && (
            <CalendarView
              eventsByLocalDate={eventsByLocalDate}
              customVenueColors={customVenueColors}
              onSelectEvent={(id) => setSelectedEventId(id)}
              onOpenDay={(key) => setDayAgendaKey(key)}
            />
          )}

          {viewMode === "plan" && (
            <PlanView
              savedEvents={savedEvents}
              customVenueColors={customVenueColors}
              onSelectEvent={(id) => setSelectedEventId(id)}
              onToggleSave={toggleSave}
              onExport={() => handleBulkExport(savedEvents, "sprout-scout-plan.ics")}
            />
          )}
        </main>
      </div>

      {activeEvent && (
        <EventModal
          event={activeEvent}
          isSaved={savedIds.includes(activeEvent.id)}
          onClose={() => setSelectedEventId(null)}
          onToggleSave={() => toggleSave(activeEvent.id)}
          tagInput={tagInput}
          setTagInput={setTagInput}
          onAddTag={(id, tag) => { addTag(id, tag); setTagInput(""); }}
          onRemoveTag={removeTag}
          customVenueColors={customVenueColors}
          setCustomVenueColors={setCustomVenueColors}
        />
      )}

      {dayAgendaKey && (
        <DayAgendaPopover
          dayKey={dayAgendaKey}
          events={eventsByLocalDate[dayAgendaKey] || []}
          customVenueColors={customVenueColors}
          onClose={() => setDayAgendaKey(null)}
          onSelectEvent={(id) => { setSelectedEventId(id); setDayAgendaKey(null); }}
        />
      )}

      {addEventOpen && <ManualEventModal onClose={() => setAddEventOpen(false)} onAdd={addManualEvent} />}

      <Footer lastUpdated={lastUpdated} />
    </div>
  );
}
