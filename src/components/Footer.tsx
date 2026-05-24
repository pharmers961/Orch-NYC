export function Footer({ lastUpdated }: { lastUpdated: Date | null }) {
  const stamp = lastUpdated
    ? lastUpdated.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <footer className="mt-auto h-12 bg-white/70 dark:bg-black/70 backdrop-blur-xl border-t border-black/10 dark:border-zinc-800/60 flex items-center px-4 sm:px-6 justify-between gap-2 text-[11px] text-slate-400 dark:text-zinc-500 select-none">
      <div className="font-bold uppercase tracking-wider font-mono">Orch</div>
      <div>
        {stamp ? (
          <span className="font-medium animate-fade-in font-mono">Last updated: {stamp}</span>
        ) : (
          <span className="font-mono">Loading…</span>
        )}
      </div>
    </footer>
  );
}
