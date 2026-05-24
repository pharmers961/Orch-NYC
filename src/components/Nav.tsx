import { Moon, Sun, Monitor, Plus, SlidersHorizontal } from "lucide-react";
import { Theme } from "../hooks/useTheme";

export function Nav({
  theme,
  onCycleTheme,
  onAddEvent,
  onToggleSidebar,
}: {
  theme: Theme;
  onCycleTheme: () => void;
  onAddEvent: () => void;
  onToggleSidebar: () => void;
}) {
  return (
    <nav
      id="glass-nav"
      className="sticky top-0 z-50 h-14 flex items-center justify-between gap-2 px-4 sm:px-6 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-b border-black/10 dark:border-zinc-800/60 font-sans"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#0071e3] to-[#5e5ce6] flex items-center justify-center shadow-md">
          <span className="text-white font-bold text-lg leading-none font-display">O</span>
        </div>
        <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-slate-900 via-slate-700 to-indigo-900 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
          Orch
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onCycleTheme}
          className="p-2 text-slate-600 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-all"
          title="Toggle theme (Light / Dark / System)"
          aria-label="Toggle theme"
          id="theme-toggle"
        >
          {theme === "light" ? <Sun size={18} /> : theme === "dark" ? <Moon size={18} /> : <Monitor size={18} />}
        </button>

        <button
          onClick={onAddEvent}
          className="flex px-3 sm:px-4 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 active:scale-[0.98] transition-all text-xs font-semibold rounded-full items-center gap-1.5 shadow-sm"
          id="add-event-btn"
          title="Add an event to your calendar"
        >
          <Plus size={13} />
          <span className="hidden sm:inline">Add event</span>
        </button>

        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 text-slate-700 dark:text-zinc-300 hover:bg-black/5 dark:hover:bg-white/5 rounded-full"
          aria-label="Open filters"
          id="filter-drawer-toggle"
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
    </nav>
  );
}
