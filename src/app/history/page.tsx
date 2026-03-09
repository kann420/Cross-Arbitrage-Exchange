"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { HistoryFilters } from "@/components/HistoryFilters";
import { HistoryTable } from "@/components/HistoryTable";
import { useApi } from "@/lib/use-api";
import type { HistoryApiResponse } from "@/lib/api-types";

type HistoryTab = "All History" | "Position Closures" | "Funding/Fees";

function formatUsd(value: string | null): string {
  if (!value) return "—";
  const num = parseFloat(value);
  return `${num >= 0 ? "+" : "-"}$${Math.abs(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDuration(ms: number | null): string {
  if (!ms) return "—";
  const hours = Math.max(0, Math.floor(ms / (1000 * 60 * 60)));
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  if (days > 0) return `${days}d ${remHours}h`;
  return `${remHours}h`;
}

function inRange(ts: number, selectedRange: string): boolean {
  const now = Date.now();
  switch (selectedRange) {
    case "Last 7 Days":
      return now - ts <= 7 * 24 * 60 * 60 * 1000;
    case "Last 30 Days":
      return now - ts <= 30 * 24 * 60 * 60 * 1000;
    case "Last 90 Days":
      return now - ts <= 90 * 24 * 60 * 60 * 1000;
    default:
      return true;
  }
}

export default function HistoryPage() {
  const { data, error, loading, refetch } =
    useApi<HistoryApiResponse>("/api/history", 60_000);
  const [activeTab, setActiveTab] = useState<HistoryTab>("All History");
  const [search, setSearch] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("All Assets");
  const [selectedExchange, setSelectedExchange] = useState("All Exchanges");
  const [selectedRange, setSelectedRange] = useState("Last 30 Days");
  const forcedRefreshRef = useRef(false);

  useEffect(() => {
    if (forcedRefreshRef.current) return;
    forcedRefreshRef.current = true;
    refetch(true);
  }, [refetch]);

  const entries = useMemo(() => data?.entries ?? [], [data?.entries]);
  const assetOptions = useMemo(
    () =>
      [...new Set(entries.map((entry) => entry.canonicalAsset))]
        .sort((left, right) => left.localeCompare(right)),
    [entries]
  );

  const filteredEntries = useMemo(() => {
    const searchValue = search.trim().toLowerCase();

    return entries.filter((entry) => {
      if (activeTab === "Funding/Fees") return false;
      if (!inRange(entry.closedAtMs, selectedRange)) return false;
      if (selectedAsset !== "All Assets" && entry.canonicalAsset !== selectedAsset) {
        return false;
      }
      if (
        selectedExchange !== "All Exchanges" &&
        !entry.legs.some((leg) => leg.label.toLowerCase().includes(selectedExchange.toLowerCase()))
      ) {
        return false;
      }
      if (
        searchValue &&
        !entry.strategyName.toLowerCase().includes(searchValue) &&
        !entry.canonicalAsset.toLowerCase().includes(searchValue)
      ) {
        return false;
      }
      return true;
    });
  }, [activeTab, entries, search, selectedAsset, selectedExchange, selectedRange]);

  const stats = data?.stats ?? {
    totalRealizedPnl: null,
    completedArbitrages: 0,
    avgStrategyDurationMs: null,
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <Header />

      <div className="flex flex-1 justify-center px-4 py-6 lg:px-10">
        <div className="flex w-full max-w-[1400px] flex-col gap-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Realized PnL"
              value={formatUsd(stats.totalRealizedPnl)}
              color={
                stats.totalRealizedPnl && parseFloat(stats.totalRealizedPnl) < 0
                  ? "red"
                  : "green"
              }
              large
            />
            <StatCard
              label="Completed Arbitrages"
              value={stats.completedArbitrages.toString()}
              large
            />
            <StatCard
              label="Average Strategy Duration"
              value={formatDuration(stats.avgStrategyDurationMs)}
              large
            />
          </div>

          <HistoryFilters
            activeTab={activeTab}
            onTabChange={setActiveTab}
            search={search}
            onSearchChange={setSearch}
            selectedAsset={selectedAsset}
            onAssetChange={setSelectedAsset}
            selectedExchange={selectedExchange}
            onExchangeChange={setSelectedExchange}
            selectedRange={selectedRange}
            onRangeChange={setSelectedRange}
            assetOptions={assetOptions}
          />

          <HistoryTable
            entries={filteredEntries}
            loading={loading}
            error={error ?? (data?.errors[0] ?? null)}
          />
        </div>
      </div>
    </div>
  );
}
