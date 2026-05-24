import { useMemo, useState } from "react";
import { EventItem } from "../types";
import { CATEGORIES } from "../lib/constants";
import { getCategoryColor, localDateKey, formatPriceDisplay } from "../lib/events";

type CalView = "month" | "week" | "agenda";

export function CalendarView({
  eventsByLocalDate,
  customVenueColors,
  onSelectEvent,
  onOpenDay,
}: {
  eventsByLocalDate: Record<string, EventItem[]>;
  customVenueColors: Record<string, string>;
  onSelectEvent: (id: string) => void;
  onOpenDay: (key: string) => void;
}) {
  const [calendarView, setCalendarView] = useState<CalView>("month");
  const [calendarYear, setCalendarYear] = useState(() => new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date().getMonth());
  const [weekRef, setWeekRef] = useState(() => new Date());

  const monthData = useMemo(() => {
    const today = new Date();
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: { dateNum: number | null; events: EventItem[]; isToday: boolean }[] = [];
    for (let i = 0; i < startOffset; i++) cells.push({ dateNum: null, events: [], isToday: false });
    for (let d = 1; d <= daysInMonth; d++) {
      const cellKey = localDateKey(new Date(calendarYear, calendarMonth, d));
      cells.push({
        dateNum: d,
        events: eventsByLocalDate[cellKey] || [],
        isToday: today.getDate() === d && today.getMonth() === calendarMonth && today.getFullYear() === calendarYear,
      });
    }
    const monthLabel = new Date(calendarYear, calendarMonth).toLocaleString("default", { month: "long", year: "numeric" });
    return { monthLabel, cells };
  }, [eventsByLocalDate, calendarYear, calendarMonth]);

  const weekData = useMemo(() => {
    const start = new Date(weekRef);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - start.getDay());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = localDateKey(d);
      return { date: d, key, events: eventsByLocalDate[key] || [], isToday: key === localDateKey(new Date()) };
    });
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const label = `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
    return { days, label };
  }, [weekRef, eventsByLocalDate]);

  const agendaGroups = useMemo(() => {
    return Object.keys(eventsByLocalDate)
      .sort()
      .map((key) => ({ key, date: new Date(`${key}T12:00:00`), events: eventsByLocalDate[key] }));
  }, [eventsByLocalDate]);

  const goPrev = () => {
    if (calendarView === "month") {
      setCalendarMonth((prev) => { if (prev === 0) { setCalendarYear((y) => y - 1); return 11; } return prev - 1; });
    } else {
      setWeekRef((d) => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; });
    }
  };
  const goNext = () => {
    if (calendarView === "month") {
      setCalendarMonth((prev) => { if (prev === 11) { setCalendarYear((y) => y + 1); return 0; } return prev + 1; });
    } else {
      setWeekRef((d) => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; });
    }
  };
  const goToday = () => { const now = new Date(); setCalendarYear(now.getFullYear()); setCalendarMonth(now.getMonth()); setWeekRef(now); };

  return (
    <div className="bg-white/60 dark:bg-zinc-950/60 backdrop-blur-md rounded-2xl p-4 sm:p-6 border border-slate-200/60 dark:border-zinc-800/60 space-y-4 animate-fade-in">
      <div className="flex flex-col gap-3 border-b border-slate-200 dark:border-zinc-800 pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {calendarView !== "agenda" && (
              <button onClick={goPrev} className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 font-bold" aria-label="Previous">
                &larr;
              </button>
            )}
            <h3 className="font-bold text-sm sm:text-base text-slate-800 dark:text-zinc-100 font-display text-center min-w-[120px]">
              {calendarView === "month" ? monthData.monthLabel : calendarView === "week" ? weekData.label : "Upcoming agenda"}
            </h3>
            {calendarView !== "agenda" && (
              <button onClick={goNext} className="p-1 px-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-900 dark:hover:bg-zinc-800 rounded-lg text-slate-600 dark:text-zinc-300 font-bold" aria-label="Next">
                &rarr;
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={goToday} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-slate-100 dark:bg-zinc-900 hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-600 dark:text-zinc-300">
              Today
            </button>
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-zinc-800 p-0.5 bg-slate-100 dark:bg-zinc-900 text-[11px] font-semibold">
              {(["month", "week", "agenda"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setCalendarView(v)}
                  className={`px-2.5 py-1 rounded-md transition-all capitalize ${calendarView === v ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white" : "text-slate-500"}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {CATEGORIES.map((c) => (
            <span key={c.id} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-zinc-400">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      {/* Month grid */}
      {calendarView === "month" && (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5 min-h-[300px]">
            {monthData.cells.map((cell, idx) => {
              const cellKey = cell.dateNum !== null ? localDateKey(new Date(calendarYear, calendarMonth, cell.dateNum)) : null;
              return (
                <div
                  key={idx}
                  onClick={() => { if (cellKey && cell.events.length > 0) onOpenDay(cellKey); }}
                  className={`min-h-[70px] sm:min-h-[88px] border border-slate-200/50 dark:border-zinc-800 p-1 sm:p-2 rounded-xl flex flex-col justify-between transition-all ${
                    cell.dateNum === null
                      ? "opacity-20 bg-slate-100/30 dark:bg-zinc-900/10"
                      : cell.events.length > 0
                        ? "bg-white/30 dark:bg-zinc-900/10 cursor-pointer hover:border-indigo-400 hover:shadow-sm"
                        : "bg-white/30 dark:bg-zinc-900/10"
                  } ${cell.isToday ? "ring-2 ring-indigo-500 ring-offset-2 dark:ring-offset-black" : ""}`}
                >
                  {cell.dateNum !== null ? (
                    <>
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold leading-none ${cell.isToday ? "bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center p-0.5" : "text-slate-700 dark:text-zinc-300"}`}>
                          {cell.dateNum}
                        </span>
                        {cell.events.length > 0 && (
                          <span className="text-[9px] bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 font-bold px-1 py-0.5 rounded font-mono">
                            {cell.events.length}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 space-y-1">
                        {cell.events.slice(0, 3).map((e) => {
                          const vColor = customVenueColors[e.venue] || getCategoryColor(e.cat);
                          const t = new Date(e.start).toLocaleTimeString([], { hour: "numeric" });
                          return (
                            <div
                              key={e.id}
                              onClick={(ev) => { ev.stopPropagation(); onSelectEvent(e.id); }}
                              className="group flex items-center gap-1 cursor-pointer"
                              title={`${e.title} at ${e.venue}`}
                            >
                              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: vColor }} />
                              <span className="hidden sm:inline text-[9px] font-semibold text-slate-700 dark:text-zinc-400 truncate max-w-[90px]">
                                <span className="text-slate-400">{t}</span> {e.title}
                              </span>
                            </div>
                          );
                        })}
                        {cell.events.length > 3 && (
                          <button
                            onClick={(ev) => { ev.stopPropagation(); if (cellKey) onOpenDay(cellKey); }}
                            className="text-[9px] font-semibold text-indigo-500 hover:underline leading-none"
                          >
                            +{cell.events.length - 3} more
                          </button>
                        )}
                      </div>
                    </>
                  ) : (
                    <div />
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Week view */}
      {calendarView === "week" && (
        <div className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
          {weekData.days.map((day) => (
            <div key={day.key} className={`border border-slate-200/50 dark:border-zinc-800 rounded-xl p-2 min-h-[120px] ${day.isToday ? "ring-2 ring-indigo-500" : ""}`}>
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-1.5">
                {day.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })}
              </div>
              <div className="space-y-1">
                {day.events.length === 0 && <div className="text-[9px] text-slate-300 dark:text-zinc-700">—</div>}
                {day.events.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEvent(e.id)}
                    className="w-full text-left rounded-md px-1.5 py-1 text-[10px] font-semibold truncate hover:opacity-90"
                    style={{ backgroundColor: `${customVenueColors[e.venue] || getCategoryColor(e.cat)}22`, color: customVenueColors[e.venue] || getCategoryColor(e.cat) }}
                    title={`${e.title} · ${e.venue}`}
                  >
                    {new Date(e.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} {e.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agenda view */}
      {calendarView === "agenda" && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {agendaGroups.length === 0 && <p className="text-sm text-slate-400 text-center py-8">No upcoming events match your filters.</p>}
          {agendaGroups.map((group) => (
            <div key={group.key} className="flex gap-3">
              <div className="w-12 shrink-0 text-center">
                <div className="text-[10px] font-bold text-slate-400 uppercase">{group.date.toLocaleDateString("en-US", { month: "short" })}</div>
                <div className="text-xl font-extrabold text-slate-800 dark:text-zinc-100">{group.date.getDate()}</div>
                <div className="text-[10px] text-slate-400">{group.date.toLocaleDateString("en-US", { weekday: "short" })}</div>
              </div>
              <div className="flex-1 space-y-1.5">
                {group.events.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => onSelectEvent(e.id)}
                    className="w-full text-left flex items-center gap-2 p-2 rounded-lg bg-white/50 dark:bg-zinc-900/30 border border-slate-200/50 dark:border-zinc-800/50 hover:border-indigo-400 transition-all"
                  >
                    <span className="w-1 h-8 rounded-full shrink-0" style={{ backgroundColor: customVenueColors[e.venue] || getCategoryColor(e.cat) }} />
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
