import { X } from "lucide-react";
import { EventItem } from "../types";
import { getCategoryColor, formatPriceDisplay } from "../lib/events";
import { Modal } from "./Modal";

export function DayAgendaPopover({
  dayKey,
  events,
  customVenueColors,
  onClose,
  onSelectEvent,
}: {
  dayKey: string;
  events: EventItem[];
  customVenueColors: Record<string, string>;
  onClose: () => void;
  onSelectEvent: (id: string) => void;
}) {
  return (
    <Modal
      onClose={onClose}
      ariaLabel="Events for selected day"
      panelClassName="bg-white dark:bg-zinc-950 w-full max-w-md rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-2xl space-y-3 max-h-[80vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
        <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100 font-display">
          {new Date(`${dayKey}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </h3>
        <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full">
          <X size={18} />
        </button>
      </div>
      <div className="space-y-2">
        {events.map((e) => (
          <button
            key={e.id}
            onClick={() => onSelectEvent(e.id)}
            className="w-full text-left flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900/40 border border-slate-200/50 dark:border-zinc-800/50 hover:border-indigo-400 transition-all"
          >
            <span className="w-1.5 h-9 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold truncate text-slate-800 dark:text-zinc-100">{e.title}</div>
              <div className="text-[10px] text-slate-500 truncate">
                {new Date(e.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.venue}
              </div>
            </div>
            <span className="text-[11px] font-mono font-bold text-emerald-600 shrink-0">{formatPriceDisplay(e.price)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
