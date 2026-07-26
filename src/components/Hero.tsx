export function Hero({ stats }: { stats: { events: number; venues: number; sources: number } }) {
  return (
    <header className="col-span-full pt-8 pb-4 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-500 uppercase tracking-widest font-mono">
            Sprout Scout
          </span>
        </div>
        <h1 className="text-4xl lg:text-5xl font-extrabold tracking-tight mb-2 text-slate-900 dark:text-white font-display">
          Kid-friendly fun, <br className="hidden sm:inline" />
          all over the East Bay.
        </h1>
        <p className="text-lg font-bold tracking-tight text-slate-800 dark:text-zinc-200 font-display">
          Storytimes, crafts, music in the park &amp; more.
        </p>
        <p
          className="text-slate-600 dark:text-zinc-300 text-sm font-medium mb-2 cursor-default"
          title="M.A.L.U. — made for you, Malu ♥"
        >
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">M</span>ake{" "}
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">A</span>{" "}
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">L</span>ineup{" "}
          <span className="text-emerald-600 dark:text-emerald-500 font-bold">U</span>nforgettable.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500 dark:text-zinc-400">
        <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
          <span className="text-slate-900 dark:text-white font-bold">{stats.events}</span> Events listed
        </div>
        <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
          <span className="text-slate-900 dark:text-white font-bold">{stats.venues}</span> Venues
        </div>
        <div className="bg-white dark:bg-zinc-950 px-3 py-1.5 rounded-lg border border-slate-200/60 dark:border-zinc-800">
          <span className="text-slate-900 dark:text-white font-bold">{stats.sources}</span> Sources
        </div>
      </div>
    </header>
  );
}
