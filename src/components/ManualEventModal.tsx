import { useState } from "react";
import { CalendarPlus, X, Plus } from "lucide-react";
import { EventCategory } from "../types";
import { CATEGORIES } from "../lib/constants";
import { Modal } from "./Modal";

export function ManualEventModal({
  onAdd,
  onClose,
}: {
  onAdd: (d: { title: string; venue: string; date: string; time: string; price: string; cat: EventCategory; ticketUrl: string; desc: string; artist: string }) => boolean;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [venue, setVenue] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("19:00");
  const [price, setPrice] = useState("");
  const [cat, setCat] = useState<EventCategory>("other");
  const [ticketUrl, setTicketUrl] = useState("");
  const [artist, setArtist] = useState("");
  const [desc, setDesc] = useState("");

  const inputCls = "w-full p-2 text-xs bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500";

  return (
    <Modal
      onClose={onClose}
      ariaLabel="Add an event manually"
      panelClassName="bg-white dark:bg-zinc-950 w-full max-w-md rounded-3xl p-6 border border-slate-200 dark:border-zinc-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto"
    >
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-zinc-800 pb-3">
        <h3 className="font-extrabold text-base text-slate-800 dark:text-zinc-100 flex items-center gap-2">
          <CalendarPlus size={18} className="text-indigo-600" /> Add an event
        </h3>
        <button onClick={onClose} aria-label="Close" className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-900 rounded-full">
          <X size={18} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (onAdd({ title, venue, date, time, price, cat, ticketUrl, desc, artist })) onClose();
        }}
        className="space-y-3"
      >
        <input className={inputCls} placeholder="Event title *" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required aria-label="Date" />
          <input className={inputCls} type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time" />
        </div>
        <input className={inputCls} placeholder="Venue (e.g. Blue Note)" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <input className={inputCls} placeholder="Artist / performer / team" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Price (e.g. $25, Free)" value={price} onChange={(e) => setPrice(e.target.value)} />
          <select className={inputCls} value={cat} onChange={(e) => setCat(e.target.value as EventCategory)} aria-label="Category">
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
        <input className={inputCls} type="url" placeholder="Ticket / info URL (optional)" value={ticketUrl} onChange={(e) => setTicketUrl(e.target.value)} />
        <textarea className={inputCls} rows={2} placeholder="Description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <button type="submit" className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm">
          <Plus size={14} /> Add to calendar
        </button>
      </form>
    </Modal>
  );
}
