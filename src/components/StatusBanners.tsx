import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function StatusBanners({
  errorMessage,
  onClearError,
  apiSuccessNote,
  onClearSuccess,
}: {
  errorMessage: string | null;
  onClearError: () => void;
  apiSuccessNote: string | null;
  onClearSuccess: () => void;
}) {
  return (
    <>
      {errorMessage && (
        <div className="col-span-full p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-500 text-xs flex items-center gap-3">
          <AlertCircle size={16} className="shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">{errorMessage}</p>
          </div>
          <button onClick={onClearError} className="p-1 hover:bg-red-500/10 rounded" aria-label="Dismiss error">
            <X size={14} />
          </button>
        </div>
      )}

      {apiSuccessNote && (
        <div className="col-span-full p-3.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-3 animate-fade-in">
          <CheckCircle2 size={16} className="shrink-0" />
          <p className="flex-1 font-medium">{apiSuccessNote}</p>
          <button onClick={onClearSuccess} className="p-1 hover:bg-emerald-500/10 rounded" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}
    </>
  );
}
