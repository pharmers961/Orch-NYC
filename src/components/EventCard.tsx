import React, { useState } from "react";
import { Heart, MapPin, Repeat } from "lucide-react";
import { EventItem } from "../types";
import {
  getCategoryColor, getCategoryEmoji, getEventImage, resolveTicketTarget,
  providerMeta, formatPriceDisplay, formatSourceLabel,
} from "../lib/events";
import { CATEGORIES } from "../lib/constants";

const TONE_CLASSES: Record<string, string> = {
  official: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  web: "bg-slate-400/15 text-slate-500 dark:text-zinc-400",
  manual: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400",
};

export function ProvenanceBadge({ ev }: { ev: EventItem }) {
  const { label, tone } = providerMeta(ev);
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${TONE_CLASSES[tone]}`}>
      {label}
    </span>
  );
}

export function EventCard({
  item,
  isSaved,
  onSelect,
  onToggleSave,
  onIsolateSource,
  customVenueColors,
  series,
  onSelectSibling,
}: {
  item: EventItem;
  isSaved: boolean;
  onSelect: () => void;
  onToggleSave: () => void;
  onIsolateSource: () => void;
  customVenueColors: Record<string, string>;
  // When this card fronts a recurring series: cadence label + the other dates.
  series?: { label: string; events: EventItem[] };
  onSelectSibling?: (id: string) => void;
}) {
  const [datesOpen, setDatesOpen] = useState(false);
  const eventStartDate = new Date(item.start);
  const dayLabel = eventStartDate.getDate();
  const monthLabel = eventStartDate.toLocaleDateString("en-US", { month: "short" });
  const dowLabel = eventStartDate.toLocaleDateString("en-US", { weekday: "short" });
  const timeLabel = eventStartDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const customColor = customVenueColors[item.venue];
  const catLabel = CATEGORIES.find((c) => c.id === item.cat)?.label || item.cat;
  const ticket = resolveTicketTarget(item);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className="event-card group bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-4 pl-5 flex flex-wrap items-center gap-3 sm:gap-4 border border-slate-200/40 dark:border-zinc-800/50 shadow-sm hover:shadow-md hover:border-slate-300 dark:hover:border-zinc-700/80 transition-all duration-200 hover:-translate-y-0.5 cursor-pointer relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ backgroundColor: customColor || getCategoryColor(item.cat) }} />

      <div className="w-16 flex flex-col items-center justify-center border-r border-slate-200 dark:border-zinc-800 pr-3 lg:pr-5 shrink-0 text-center select-none pl-1">
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{monthLabel}</div>
        <div className="text-2xl font-extrabold text-slate-900 dark:text-zinc-100 font-display">{dayLabel}</div>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{dowLabel}</div>
      </div>

      <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-slate-100 dark:bg-zinc-900 flex-none relative">
        {item.image ? (
          <img src={item.image} alt={item.title} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl font-display select-none" style={{ background: getEventImage(item) }}>
            {getCategoryEmoji(item.cat)}
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: `${getCategoryColor(item.cat)}1A`, color: getCategoryColor(item.cat) }}>
            {catLabel}
          </span>
          {/free/i.test(item.price) && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white uppercase tracking-wide">Free</span>
          )}
          {item.ages && item.ages !== "all" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-600 dark:text-sky-400 tracking-wide">
              Ages {item.ages}
            </span>
          )}
          {item.weather && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-600 dark:text-amber-400 tracking-wide"
              title={`Outdoor event — forecast high ${item.weather.hi}°F, ${item.weather.pop}% chance of rain`}
            >
              {item.weather.sym} {item.weather.hi}°{item.weather.pop >= 30 ? ` · ${item.weather.pop}%🌧` : ""}
            </span>
          )}
          {series && (
            <button
              onClick={(e) => { e.stopPropagation(); setDatesOpen(!datesOpen); }}
              className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-600 dark:text-violet-400 tracking-wide flex items-center gap-1 hover:bg-violet-500/25"
              title="Recurring event — tap to see all dates"
            >
              <Repeat size={9} /> {series.label} · +{series.events.length}
            </button>
          )}
          <ProvenanceBadge ev={item} />
          {item.status === "cancelled" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500 uppercase tracking-wide">Cancelled</span>
          )}
          {item.status === "offsale" && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-500/15 text-slate-500 uppercase tracking-wide">Off Sale</span>
          )}
        </div>

        <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate pr-4 leading-tight group-hover:text-indigo-600 dark:group-hover:text-sky-400 transition-colors">
          {item.title}
        </h3>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-zinc-400">
          <span className="flex items-center gap-1">
            <MapPin size={12} className="opacity-60" />
            <span className="truncate max-w-[150px]">{item.venue}</span>
          </span>
          <span className="hidden sm:inline text-slate-300 dark:text-zinc-800">•</span>
          <span>{timeLabel}</span>
          {item.artist && (
            <>
              <span className="hidden sm:inline text-slate-300 dark:text-zinc-800">•</span>
              <span className="truncate italic font-medium">{item.artist}</span>
            </>
          )}
        </div>

        {series && datesOpen && (
          <div className="flex flex-wrap gap-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
            {series.events.slice(0, 8).map((sib) => {
              const d = new Date(sib.start);
              return (
                <button
                  key={sib.id}
                  onClick={() => onSelectSibling?.(sib.id)}
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-600 dark:text-zinc-400 hover:border-violet-400 hover:text-violet-600"
                >
                  {d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                </button>
              );
            })}
            {series.events.length > 8 && (
              <span className="text-[10px] text-slate-400 self-center">+{series.events.length - 8} more</span>
            )}
          </div>
        )}
      </div>

      <div className="w-full sm:w-auto order-last flex sm:flex-col items-center sm:items-end justify-between gap-2 sm:pr-2 sm:shrink-0 mt-1 pt-3 sm:mt-0 sm:pt-0 border-t border-slate-100 dark:border-zinc-800/60 sm:border-0">
        <span className="order-1 text-emerald-600 dark:text-emerald-500 font-extrabold text-sm sm:text-base font-mono">
          {formatPriceDisplay(item.price)}
        </span>

        <div className="order-3 sm:order-2 flex items-center gap-1 sm:gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSave(); }}
            className={`p-2 rounded-full transition-all ${isSaved ? "text-[#ff3b30] bg-[#ff3b30]/10" : "text-slate-400 dark:text-zinc-600 hover:text-red-500 hover:bg-red-500/10"}`}
            title={isSaved ? "Saved" : "Pin Event"}
            aria-label={isSaved ? "Remove from saved" : "Save event"}
          >
            <Heart size={15} fill={isSaved ? "currentColor" : "none"} />
          </button>

          <a
            href={ticket.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 font-bold rounded-full text-xs transition-all shadow-sm"
          >
            Details
          </a>
        </div>

        <button
          onClick={(e) => { e.stopPropagation(); onIsolateSource(); }}
          className="order-2 sm:order-3 text-[10px] sm:text-[9px] font-semibold text-slate-400 dark:text-zinc-500 hover:text-indigo-500 uppercase tracking-wider font-mono truncate max-w-[140px] flex items-center gap-1"
          title={`Filter to ${formatSourceLabel(item.source)}`}
        >
          <img
            src={`https://www.google.com/s2/favicons?domain=${item.source}&sz=32`}
            alt=""
            className="w-3 h-3 rounded-sm"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {formatSourceLabel(item.source)}
        </button>
      </div>
    </div>
  );
}
