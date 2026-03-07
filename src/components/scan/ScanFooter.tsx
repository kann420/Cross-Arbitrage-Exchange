interface ScanFooterProps {
  exchangeStatus: {
    okx: "online" | "degraded" | "offline";
    binance: "online" | "degraded" | "offline";
  } | null;
  fetchedAt: number | null;
}

function statusLabel(status: string | undefined): {
  text: string;
  color: string;
} {
  switch (status) {
    case "online":
      return { text: "Online", color: "text-slate-300" };
    case "degraded":
      return { text: "Degraded", color: "text-yellow-400" };
    case "offline":
      return { text: "Offline", color: "text-red-400" };
    default:
      return { text: "Unknown", color: "text-slate-500" };
  }
}

function timeAgo(ts: number | null): string {
  if (!ts) return "—";
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 5) return "Just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export function ScanFooter({ exchangeStatus, fetchedAt }: ScanFooterProps) {
  const isLive =
    exchangeStatus?.okx === "online" || exchangeStatus?.binance === "online";
  const okxStat = statusLabel(exchangeStatus?.okx);
  const binanceStat = statusLabel(exchangeStatus?.binance);

  return (
    <footer className="mt-auto flex items-center justify-between border-t border-slate-800 bg-slate-900 px-6 py-3 md:px-10">
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {isLive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            )}
            <span
              className={`relative inline-flex h-2 w-2 rounded-full ${
                isLive ? "bg-emerald-500" : "bg-slate-500"
              }`}
            />
          </span>
          <p
            className={`text-[10px] font-bold uppercase tracking-widest ${
              isLive ? "text-emerald-500" : "text-slate-500"
            }`}
          >
            {isLive ? "Live Connection" : "Disconnected"}
          </p>
        </div>

        <div className="h-4 w-px bg-slate-800" />

        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          OKX Status:{" "}
          <span className={okxStat.color}>{okxStat.text}</span>
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          Binance Status:{" "}
          <span className={binanceStat.color}>{binanceStat.text}</span>
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-sm text-slate-500">
          update
        </span>
        <p className="text-[10px] font-semibold italic uppercase tracking-widest text-slate-500">
          Last updated: {timeAgo(fetchedAt)}
        </p>
      </div>
    </footer>
  );
}
