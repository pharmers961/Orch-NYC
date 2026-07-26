import { useMemo } from "react";
import { Heart, AlertCircle, CalendarPlus } from "lucide-react";
import { EventItem } from "../types";
import { getCategoryColor, localDateKey, formatPriceDisplay } from "../lib/events";

export function PlanView({
  savedEvents,
  customVenueColors,
  onSelectEvent,
  onToggleSave,
  onExport,
}: {
  savedEvents: EventItem[];
  customVenueColors: Record<string, string>;
  onSelectEvent: (id: string) => void;
  onToggleSave: (id: string) => void;
  onExport: () => void;
}) {
  const planGroups = useMemo(() => {
    const sorted = [...savedEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    const byKey: Record<string, EventItem[]> = {};
    sorted.forEach((e) => {
      const key = localDateKey(new Date(e.start));
      (byKey[key] = byKey[key] || []).push(e);
    });
    return Object.keys(byKey).sort().map((key) => {
      const list = byKey[key];
      const overlaps = new Set<string>();
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const s1 = new Date(list[i].start).getTime();
          const s2 = new Date(list[j].start).getTime();
          if (Math.abs(s1 - s2) < 2.5 * 60 * 60 * 1000) {
            overlaps.add(list[i].id);
            overlaps.add(list[j].id);
          }
        }
      }
      return { key, date: new Date(`${key}T12:00:00`), events: list, overlaps };
    });
  }, [savedEvents]);

  return (
    <div className="space-y-5 animate-fade-in">
      {planGroups.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-white/60 dark:bg-zinc-950/60 border border-slate-200/60 dark:border-zinc-800">
          <Heart size={32} className="text-slate-300 mx-auto mb-4" />
          <h3 className="font-bold text-base text-slate-800 dark:text-zinc-200">Your plan is empty</h3>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2">Tap the heart on any event to build your family's lineup here.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white font-display">My Plan ({savedEvents.length})</h2>
            <button
              onClick={onExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full text-xs font-semibold shadow-sm"
            >
              <CalendarPlus size={13} /> Export plan (.ics)
            </button>
          </div>
          {planGroups.map((group) => (
            <div key={group.key} className="space-y-2">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                {group.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </h3>
              {group.overlaps.size > 0 && (
                <div className="text-[11px] text-amber-600 dark:text-amber-500 flex items-center gap-1.5 font-medium">
                  <AlertCircle size={12} /> Some events on this day overlap in time.
                </div>
              )}
              {group.events.map((e) => (
                <div
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectEvent(e.id)}
                  onKeyDown={(ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onSelectEvent(e.id); } }}
                  className={`flex items-center gap-3 p-3 rounded-xl bg-white/60 dark:bg-zinc-950/60 border cursor-pointer hover:border-indigo-400 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${group.overlaps.has(e.id) ? "border-amber-400/60" : "border-slate-200/50 dark:border-zinc-800/50"}`}
                >
                  <span className="w-1.5 h-10 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold truncate text-slate-800 dark:text-zinc-100">{e.title}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.venue}
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-emerald-600 shrink-0">{formatPriceDisplay(e.price)}</span>
                  <button onClick={(ev) => { ev.stopPropagation(); onToggleSave(e.id); }} className="text-[#ff3b30] p-1.5 shrink-0" title="Remove from plan" aria-label="Remove from plan">
                    <Heart size={15} fill="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
