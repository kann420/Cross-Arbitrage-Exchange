"use client";

import { Fragment, useMemo, useState } from "react";
import type { HistoryEntryClient, HistoryLegClient } from "@/lib/api-types";

function formatDateTime(ts: number): { date: string; time: string } {
  const date = new Date(ts);
  return {
    date: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    time: `${date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    })}`,
  };
}

function formatUsd(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  const prefix = num >= 0 ? "+" : "-";
  return `${prefix}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(ms: number): string {
  const hours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days}d ${remHours}h`;
  return `${remHours}h`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="rounded border border-green-800/50 bg-green-900/30 px-2 py-0.5 text-xs font-semibold text-green-400">
      {status}
    </span>
  );
}

function LegDetail({ leg, label }: { leg: HistoryLegClient; label: string }) {
  return (
    <div className="flex-1">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
        {label} Entry/Exit
      </p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Entry Price</span>
          <span className="font-medium">{leg.entryPrice ?? "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Exit Price</span>
          <span className="font-medium">{leg.exitPrice ?? "—"}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Size</span>
          <span className="font-medium">{leg.size ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ entry }: { entry: HistoryEntryClient }) {
  return (
    <tr>
      <td colSpan={8} className="px-5 py-0">
        <div className="mb-2 flex gap-6 rounded-lg border border-slate-800 bg-card-dark px-4 py-4">
          <LegDetail leg={entry.details.spotLeg} label={entry.details.spotLeg.exchange} />
          <div className="w-px shrink-0 bg-slate-700" />
          <LegDetail leg={entry.details.perpLeg} label={entry.details.perpLeg.exchange} />
        </div>
      </td>
    </tr>
  );
}

interface HistoryTableProps {
  entries: HistoryEntryClient[];
  loading: boolean;
  error: string | null;
}

export function HistoryTable({ entries, loading, error }: HistoryTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const rows = useMemo(() => entries, [entries]);

  if (loading) {
    return (
      <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm text-slate-400">Loading closure history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <p className="text-sm text-red-400">{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
        <p className="text-sm text-slate-400">
          No closed hedge strategies found yet.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400">
              <th className="w-8 px-3 py-3" />
              <th className="px-4 py-3 text-left font-semibold">Date/Time</th>
              <th className="px-4 py-3 text-left font-semibold">Strategy/Asset</th>
              <th className="px-4 py-3 text-left font-semibold">Legs</th>
              <th className="px-4 py-3 text-left font-semibold">Duration</th>
              <th className="px-4 py-3 text-left font-semibold">Realized Spread %</th>
              <th className="px-4 py-3 text-left font-semibold">Final PnL</th>
              <th className="px-4 py-3 text-left font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((entry) => {
              const expanded = expandedId === entry.historyEntryId;
              const { date, time } = formatDateTime(entry.closedAtMs);
              const spreadValue = entry.realizedSpreadPercent
                ? `${parseFloat(entry.realizedSpreadPercent) >= 0 ? "" : ""}${entry.realizedSpreadPercent}%`
                : "—";
              return (
                <Fragment key={entry.historyEntryId}>
                  <tr
                    className="cursor-pointer border-t border-slate-800/50 transition-colors hover:bg-slate-800/30"
                    onClick={() =>
                      setExpandedId(expanded ? null : entry.historyEntryId)
                    }
                  >
                    <td className="px-3 py-4 text-center">
                      <span className="material-symbols-outlined text-[18px] text-slate-400">
                        {expanded ? "keyboard_arrow_up" : "keyboard_arrow_down"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium">{date}</div>
                      <div className="text-xs text-slate-400">{time}</div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-sm font-bold text-primary">
                          {entry.canonicalAsset.charAt(0)}
                        </div>
                        <span className="font-medium">{entry.strategyName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {entry.legs.map((leg) => (
                          <div key={leg.label} className="flex items-center gap-1.5">
                            <span
                              className={`h-2 w-2 rounded-full ${
                                leg.side === "long" ? "bg-green-400" : "bg-red-400"
                              }`}
                            />
                            <span className="text-slate-300">{leg.label}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 font-medium">
                      {formatDuration(entry.durationMs)}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`font-medium ${
                          entry.realizedSpreadPercent &&
                          parseFloat(entry.realizedSpreadPercent) >= 0
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {spreadValue}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`font-medium ${
                          entry.pnlPositive ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {formatUsd(entry.finalPnl)}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge status={entry.status} />
                    </td>
                  </tr>
                  {expanded && <ExpandedRow entry={entry} />}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4 text-sm">
        <span className="text-slate-400">
          Showing 1 to {rows.length} of {rows.length} entries
        </span>
        <div className="flex gap-2">
          <button className="rounded border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700">
            Previous
          </button>
          <button className="rounded border border-slate-700 bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
