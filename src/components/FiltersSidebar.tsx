import React, { useState } from "react";
import { X } from "lucide-react";
import { EventItem, EventCategory } from "../types";
import { CATEGORIES, CITIES, AGE_BUCKETS } from "../lib/constants";
import { formatSourceLabel } from "../lib/events";

function activate(fn: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      fn();
    }
  };
}

// Favicon for a source, falling back to a globe emoji if the icon can't load
// (e.g. friendly labels that aren't real domains).
function SourceIcon({ source }: { source: string }) {
  const [failed, setFailed] = useState(false);
  const isDomain = /\./.test(source) && !/\s/.test(source);
  if (!isDomain || failed) return <span aria-hidden>🌐</span>;
  return (
    <img
      src={`https://www.google.com/s2/favicons?domain=${source}&sz=32`}
      alt=""
      className="w-3.5 h-3.5 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

export function FiltersSidebar({
  events,
  sidebarOpen,
  onCloseSidebar,
  selectedCategories,
  onToggleCategory,
  selectedCities,
  setSelectedCities,
  selectedAges,
  setSelectedAges,
  freeOnly,
  setFreeOnly,
  maxPrice,
  setMaxPrice,
  activeSources,
  sourceStats,
  hiddenSources,
  setHiddenSources,
  isolateSource,
  toggleSource,
  activeVenues,
  venueStats,
  selectedVenues,
  onToggleVenue,
  setSelectedVenues,
  customVenueColors,
  activeTags,
  selectedTags,
  setSelectedTags,
}: {
  events: EventItem[];
  sidebarOpen: boolean;
  onCloseSidebar: () => void;
  selectedCategories: EventCategory[];
  onToggleCategory: (c: EventCategory) => void;
  selectedCities: string[];
  setSelectedCities: React.Dispatch<React.SetStateAction<string[]>>;
  selectedAges: string[];
  setSelectedAges: React.Dispatch<React.SetStateAction<string[]>>;
  freeOnly: boolean;
  setFreeOnly: (b: boolean) => void;
  maxPrice: number;
  setMaxPrice: (n: number) => void;
  activeSources: string[];
  sourceStats: Record<string, number>;
  hiddenSources: string[];
  setHiddenSources: (s: string[]) => void;
  isolateSource: (s: string) => void;
  toggleSource: (s: string) => void;
  activeVenues: string[];
  venueStats: Record<string, number>;
  selectedVenues: string[];
  onToggleVenue: (v: string) => void;
  setSelectedVenues: (v: string[]) => void;
  customVenueColors: Record<string, string>;
  activeTags: Record<string, number>;
  selectedTags: string[];
  setSelectedTags: React.Dispatch<React.SetStateAction<string[]>>;
}) {
  const catCounts: Record<string, number> = {};
  events.forEach((e) => (catCounts[e.cat] = (catCounts[e.cat] || 0) + 1));

  return (
    <aside
      className={`lg:block shrink-0 ${
        sidebarOpen
          ? "fixed inset-0 z-[55] bg-white dark:bg-zinc-950 p-6 overflow-y-auto block"
          : "hidden"
      } space-y-6 lg:bg-white/40 lg:dark:bg-zinc-950/40 lg:backdrop-blur-md lg:border-r lg:border-black/5 lg:dark:border-white/5 lg:p-6 lg:rounded-2xl lg:h-fit`}
    >
      <div className="flex items-center justify-between lg:hidden mb-4 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <span className="font-extrabold text-sm uppercase text-slate-500 font-mono tracking-widest">Filters</span>
        <button onClick={onCloseSidebar} className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full" aria-label="Close filters">
          <X size={18} />
        </button>
      </div>

      {/* Categories — big friendly emoji chips */}
      <div className="space-y-3">
        <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">What kind of fun?</h3>
        <div className="grid grid-cols-2 gap-1.5">
          {CATEGORIES.map((cat) => {
            const active = selectedCategories.includes(cat.id);
            return (
              <button
                key={cat.id}
                onClick={() => onToggleCategory(cat.id)}
                className={`flex items-center gap-1.5 px-2 py-2 rounded-xl text-[11px] font-semibold border transition-all text-left ${
                  active
                    ? "shadow-sm"
                    : "opacity-45 grayscale bg-white dark:bg-zinc-950 border-slate-200 dark:border-zinc-800"
                }`}
                style={active ? { backgroundColor: `${cat.color}1A`, borderColor: `${cat.color}66`, color: cat.color } : undefined}
                aria-pressed={active}
              >
                <span className="text-lg leading-none">{cat.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-slate-700 dark:text-zinc-300">{cat.label.split(" & ")[0]}</span>
                <span className="text-[9px] font-bold opacity-70">{catCounts[cat.id] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ages */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Ages</h3>
          {selectedAges.length > 0 && (
            <button onClick={() => setSelectedAges([])} className="text-[10px] text-emerald-600 font-semibold hover:underline">Clear</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {AGE_BUCKETS.map((b) => {
            const active = selectedAges.includes(b.id);
            return (
              <button
                key={b.id}
                onClick={() => setSelectedAges((prev) => (prev.includes(b.id) ? prev.filter((x) => x !== b.id) : [...prev, b.id]))}
                className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${
                  active
                    ? "bg-sky-500 text-white border-sky-500"
                    : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-sky-400"
                }`}
                aria-pressed={active}
              >
                {b.label} yrs
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-slate-400 dark:text-zinc-600">Events that don't state an age range are always shown.</p>
      </div>

      {/* City */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">City</h3>
          {selectedCities.length > 0 && (
            <button onClick={() => setSelectedCities([])} className="text-[10px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline">Clear</button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CITIES.map((b) => {
            const active = selectedCities.includes(b);
            return (
              <button
                key={b}
                onClick={() => setSelectedCities((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-indigo-400"}`}
              >
                {b}
              </button>
            );
          })}
        </div>
      </div>

      {/* Price */}
      <div className="space-y-2.5 pt-2">
        <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Price</h3>
        <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
          <input type="checkbox" checked={freeOnly} onChange={(e) => setFreeOnly(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700" />
          Free events only
        </label>
        <div className={freeOnly ? "opacity-40 pointer-events-none" : ""}>
          <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 mb-1">
            <span>Max starting price</span>
            <span className="font-mono font-bold">{maxPrice === 0 ? "Any" : `$${maxPrice}`}</span>
          </div>
          <input
            type="range"
            min={0}
            max={500}
            step={10}
            value={maxPrice}
            onChange={(e) => setMaxPrice(parseInt(e.target.value, 10))}
            className="w-full accent-indigo-600"
            aria-label="Maximum starting price"
          />
          <p className="text-[9px] text-slate-400 dark:text-zinc-600 mt-1">Matches events whose price starts at or below this.</p>
        </div>
      </div>

      {/* Sources */}
      {activeSources.length >= 1 && (
        <div className="space-y-3 pt-2 font-sans">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Sources</h3>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setHiddenSources([])}
              className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                hiddenSources.length === 0
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-indigo-400"
              }`}
            >
              All sources
            </button>
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
            {activeSources.map((source) => {
              const visible = !hiddenSources.includes(source);
              return (
                <div
                  key={source}
                  role="button"
                  tabIndex={0}
                  onClick={() => isolateSource(source)}
                  onKeyDown={activate(() => isolateSource(source))}
                  title={`Show only ${formatSourceLabel(source)}`}
                  className="flex items-center justify-between text-xs group cursor-pointer text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={visible}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleSource(source)}
                      className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700 shrink-0"
                      aria-label={`Toggle ${formatSourceLabel(source)}`}
                    />
                    <span className="truncate max-w-[150px] text-[11px] flex items-center gap-1.5">
                      <SourceIcon source={source} />
                      <span className="truncate">{formatSourceLabel(source)}</span>
                    </span>
                  </div>
                  <span className="text-[10px] bg-slate-200/50 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono shrink-0">
                    {sourceStats[source] || 0}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Venues */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Venues</h3>
          {selectedVenues.length > 0 && (
            <button onClick={() => setSelectedVenues([])} className="text-[10px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline">Clear all</button>
          )}
        </div>
        <div className="space-y-1 max-h-60 overflow-y-auto pr-1">
          {activeVenues.map((venue) => {
            const vColor = customVenueColors[venue] || null;
            const checked = selectedVenues.includes(venue);
            return (
              <div
                key={venue}
                role="button"
                tabIndex={0}
                onClick={() => onToggleVenue(venue)}
                onKeyDown={activate(() => onToggleVenue(venue))}
                className="flex items-center justify-between text-xs group cursor-pointer text-slate-700 dark:text-zinc-300 hover:text-slate-900 dark:hover:text-white p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
              >
                <div className="flex items-center gap-2 truncate">
                  <input
                    type="checkbox"
                    checked={checked}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => onToggleVenue(venue)}
                    className="w-3.5 h-3.5 rounded border-slate-300 dark:border-zinc-700"
                    aria-label={`Toggle ${venue}`}
                  />
                  {vColor && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: vColor }} />}
                  <span className="truncate">{venue}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">({venueStats[venue] || 0})</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom tags */}
      {Object.keys(activeTags).length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Custom Tags</h3>
            {selectedTags.length > 0 && (
              <button onClick={() => setSelectedTags([])} className="text-[10px] text-indigo-600 dark:text-[#5e5ce6] font-semibold hover:underline">Clear tags</button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
            {Object.entries(activeTags).map(([tag, count]) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  onClick={() => setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-semibold transition-all flex items-center gap-1 border cursor-pointer ${
                    isSelected
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span>#{tag}</span>
                  <span className={`text-[9px] opacity-80 ${isSelected ? "text-white" : "text-slate-400 dark:text-zinc-500"}`}>({count})</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="pt-4 mt-auto">
        <div className="p-4 rounded-xl bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] text-white shadow-md">
          <span className="text-[9px] font-bold uppercase tracking-wider opacity-90">PRO TIP</span>
          <p className="text-xs font-semibold leading-relaxed mt-1">
            Pin your favorite events. They are cached locally so they survive reload sessions.
          </p>
        </div>
      </div>
    </aside>
  );
}
