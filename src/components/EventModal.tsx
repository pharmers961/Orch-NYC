import React from "react";
import { Heart, X, ExternalLink, Share2, CalendarPlus, Calendar, Palette, Plus } from "lucide-react";
import { EventItem } from "../types";
import {
  getEventImage, getCategoryEmoji, getCategoryColor, resolveTicketTarget,
  googleCalendarUrl, downloadICS, shareEvent, formatPriceDisplay,
} from "../lib/events";
import { CATEGORIES } from "../lib/constants";
import { Modal } from "./Modal";
import { ProvenanceBadge } from "./EventCard";

const VENUE_COLORS = ["#0071e3", "#00a17a", "#5e5ce6", "#ff9f0a", "#e63946", "#8a2be2"];

export function EventModal({
  event,
  isSaved,
  onClose,
  onToggleSave,
  tagInput,
  setTagInput,
  onAddTag,
  onRemoveTag,
  customVenueColors,
  setCustomVenueColors,
}: {
  event: EventItem;
  isSaved: boolean;
  onClose: () => void;
  onToggleSave: () => void;
  tagInput: string;
  setTagInput: (s: string) => void;
  onAddTag: (id: string, tag: string) => void;
  onRemoveTag: (id: string, tag: string) => void;
  customVenueColors: Record<string, string>;
  setCustomVenueColors: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}) {
  const ticket = resolveTicketTarget(event);
  const catLabel = CATEGORIES.find((c) => c.id === event.cat)?.label || event.cat;

  return (
    <Modal
      onClose={onClose}
      ariaLabel={event.title}
      panelClassName="bg-white dark:bg-zinc-950 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl relative border border-slate-200 dark:border-zinc-800 flex flex-col max-h-[90vh]"
    >
      <div className="h-52 w-full relative bg-slate-100 dark:bg-zinc-900 shrink-0 select-none">
        {event.image ? (
          <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl" style={{ background: getEventImage(event) }}>
            {getCategoryEmoji(event.cat)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

        <button
          onClick={onToggleSave}
          className={`absolute top-4 left-4 p-2.5 rounded-full transition-all ${isSaved ? "bg-[#ff3b30] text-white" : "bg-black/45 text-white/80 hover:text-white"}`}
          aria-label={isSaved ? "Remove from saved" : "Save event"}
        >
          <Heart size={18} fill={isSaved ? "currentColor" : "none"} />
        </button>

        <button onClick={onClose} className="absolute top-4 right-4 p-2.5 rounded-full bg-black/45 text-white/80 hover:text-white" aria-label="Close">
          <X size={18} />
        </button>

        <div className="absolute bottom-4 left-4 right-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: getCategoryColor(event.cat) }}>
              {catLabel}
            </span>
            <ProvenanceBadge ev={event} />
          </div>
          <h2 className="text-lg sm:text-2xl font-black mt-2 leading-tight">{event.title}</h2>
        </div>
      </div>

      <div className="p-6 space-y-5 overflow-y-auto flex-1">
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div className="space-y-1">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">When</span>
            <p className="font-semibold text-slate-800 dark:text-zinc-200">
              {new Date(event.start).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
            <p className="text-slate-500 font-medium">
              At {new Date(event.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <div className="space-y-1">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Where</span>
            <p className="font-semibold text-slate-800 dark:text-zinc-200">{event.venue}</p>
            <p className="text-slate-500 font-medium">{event.area}</p>
          </div>
        </div>

        {event.artist && (
          <div className="space-y-1 text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Performer</span>
            <p className="font-semibold text-slate-800 dark:text-zinc-200 italic">{event.artist}</p>
          </div>
        )}

        {event.desc && (
          <div className="space-y-1 text-xs leading-relaxed">
            <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">Description</span>
            <p className="text-slate-700 dark:text-zinc-300">{event.desc}</p>
          </div>
        )}

        {/* Tags */}
        <div className="space-y-2.5 text-xs border-t border-slate-200 dark:border-zinc-900 pt-4">
          <span className="text-slate-400 font-bold uppercase tracking-widest text-[10px] flex items-center gap-1">Custom Event Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {event.tags && event.tags.length > 0 ? (
              event.tags.map((tg) => (
                <span key={tg} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-[11px] font-medium text-slate-700 dark:text-zinc-300">
                  #{tg}
                  <button onClick={() => onRemoveTag(event.id, tg)} className="p-0.5 rounded-full text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-zinc-800 select-none cursor-pointer" aria-label={`Remove tag ${tg}`}>
                    <X size={10} />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-slate-400 dark:text-zinc-500 italic text-[11px] py-1">
                No tags. Add custom tags below to help categorize this event (e.g. "wnyc", "podcast", "jazz")
              </span>
            )}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); onAddTag(event.id, tagInput); }} className="flex gap-1.5">
            <input
              type="text"
              placeholder="Add a custom tag (e.g. free, podcast)..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              aria-label="Add a custom tag"
              className="flex-1 p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button type="submit" className="px-3 bg-slate-900 dark:bg-zinc-100 hover:opacity-95 text-white dark:text-black rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-sm shrink-0">
              <Plus size={11} /> Tag
            </button>
          </form>
        </div>

        {/* Venue color picker */}
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800/80 flex items-center justify-between text-xs col-span-full">
          <div className="flex items-center gap-2">
            <Palette size={14} className="text-slate-500" />
            <span className="font-semibold text-slate-700 dark:text-zinc-300">Custom color for {event.venue}</span>
          </div>
          <div className="flex items-center gap-1.5">
            {VENUE_COLORS.map((hex) => (
              <button
                key={hex}
                onClick={() => setCustomVenueColors((prev) => ({ ...prev, [event.venue]: hex }))}
                className={`w-4 h-4 rounded-full border border-white dark:border-black transition-transform ${customVenueColors[event.venue] === hex ? "scale-125 shadow-sm" : "hover:scale-110"}`}
                style={{ backgroundColor: hex }}
                aria-label={`Set venue color ${hex}`}
              />
            ))}
            {customVenueColors[event.venue] && (
              <button
                onClick={() => setCustomVenueColors((prev) => { const updated = { ...prev }; delete updated[event.venue]; return updated; })}
                className="text-[10px] text-red-500 font-bold pl-1 hover:underline"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Share / calendar exports */}
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-200 dark:border-zinc-900">
          <button onClick={() => shareEvent(event)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all cursor-pointer">
            <Share2 size={12} /> Share
          </button>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all">
            <CalendarPlus size={12} /> Google Calendar
          </a>
          <button onClick={() => downloadICS(event)} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold hover:bg-slate-200 text-slate-700 dark:text-zinc-300 transition-all">
            <Calendar size={12} /> Download .ics
          </button>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="p-4 bg-slate-50 dark:bg-zinc-900/60 border-t border-slate-200 dark:border-zinc-900 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-zinc-400 px-1 font-mono">
          <span>{ticket.label}</span>
          <span className="font-extrabold text-emerald-600 dark:text-emerald-500">{formatPriceDisplay(event.price)}</span>
        </div>
        <a href={ticket.url} target="_blank" rel="noopener noreferrer" className="w-full py-3 bg-indigo-600 text-white hover:bg-indigo-700 text-sm font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:shadow-indigo-600/10 transition-all cursor-pointer text-center">
          Buy Tickets <ExternalLink size={14} />
        </a>
      </div>
    </Modal>
  );
}
