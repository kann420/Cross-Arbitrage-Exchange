"use client";

import { Fragment, useState } from "react";
import { historyEntries, type HistoryEntry, type HistoryLeg } from "@/lib/mock-data";

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "Settled"
      ? "bg-green-900/30 text-green-400 border-green-800/50"
      : "bg-red-900/30 text-red-400 border-red-800/50";

  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-semibold border ${styles}`}
    >
      {status}
    </span>
  );
}

function LegDetail({ leg, label }: { leg: HistoryLeg; label: string }) {
  return (
    <div className="flex-1">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
        {label} Entry/Exit
      </p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Entry Price</span>
          <span className="font-medium">{leg.entryPrice}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Exit Price</span>
          <span className="font-medium">{leg.exitPrice}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-slate-400">Size</span>
          <span className="font-medium">{leg.size}</span>
        </div>
      </div>
    </div>
  );
}

function ExpandedRow({ entry }: { entry: HistoryEntry }) {
  if (!entry.details) return null;

  return (
    <tr>
      <td colSpan={7} className="px-5 py-0">
        <div className="flex gap-6 py-4 px-4 mb-2 rounded-lg bg-card-dark border border-slate-800">
          <LegDetail leg={entry.details.spotLeg} label={entry.details.spotLeg.exchange} />
          <div className="w-px bg-slate-700 shrink-0" />
          <LegDetail leg={entry.details.perpLeg} label={entry.details.perpLeg.exchange} />
        </div>
      </td>
    </tr>
  );
}

export function HistoryTable() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
              <th className="w-8 px-3 py-3" />
              <th className="text-left font-semibold px-4 py-3">Date/Time</th>
              <th className="text-left font-semibold px-4 py-3">
                Strategy/Asset
              </th>
              <th className="text-left font-semibold px-4 py-3">Legs</th>
              <th className="text-left font-semibold px-4 py-3">Duration</th>
              <th className="text-left font-semibold px-4 py-3">
                Realized Spread %
              </th>
              <th className="text-left font-semibold px-4 py-3">Final PnL</th>
              <th className="text-left font-semibold px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {historyEntries.map((entry, idx) => (
              <Fragment key={idx}>
                <tr
                  className="border-t border-slate-800/50 hover:bg-slate-800/30 transition-colors cursor-pointer"
                  onClick={() => toggle(idx)}
                >
                  <td className="px-3 py-4 text-center">
                    <span className="material-symbols-outlined text-slate-400 text-[18px]">
                      {expandedIdx === idx
                        ? "keyboard_arrow_up"
                        : "keyboard_arrow_down"}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <div className="font-medium">{entry.date}</div>
                    <div className="text-xs text-slate-400">{entry.time}</div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${entry.iconBg}`}
                      >
                        {entry.icon}
                      </div>
                      <span className="font-medium">{entry.strategy}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-col gap-1 text-xs">
                      {entry.legs.map((leg) => (
                        <div key={leg.label} className="flex items-center gap-1.5">
                          <span
                            className={`w-2 h-2 rounded-full ${
                              leg.side === "long"
                                ? "bg-green-400"
                                : "bg-red-400"
                            }`}
                          />
                          <span className="text-slate-300">{leg.label}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 font-medium">{entry.duration}</td>
                  <td className="px-4 py-4">
                    <span
                      className={`font-medium ${
                        entry.spreadPositive
                          ? "text-green-400"
                          : "text-red-400"
                      }`}
                    >
                      {entry.spreadPercent}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <span
                      className={`font-medium ${
                        entry.pnlPositive ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {entry.finalPnl}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={entry.status} />
                  </td>
                </tr>
                {expandedIdx === idx && (
                  <ExpandedRow entry={entry} />
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-between items-center px-5 py-4 border-t border-slate-800 text-sm">
        <span className="text-slate-400">
          Showing 1 to {historyEntries.length} of 142 entries
        </span>
        <div className="flex gap-2">
          <button className="px-4 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition text-sm font-medium">
            Previous
          </button>
          <button className="px-4 py-1.5 rounded bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 transition text-sm font-medium">
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
