"use client";

import { useState, useMemo, useCallback } from "react";
import { Header } from "@/components/Header";
import { ScanFilters } from "@/components/scan/ScanFilters";
import { ScanSummaryCards } from "@/components/scan/ScanSummaryCards";
import { ScanTable } from "@/components/scan/ScanTable";
import { ScanFooter } from "@/components/scan/ScanFooter";
import { useApi } from "@/lib/use-api";
import type { ScanApiResponse, ScanOpportunityClient } from "@/lib/scan-types";

export type SortField =
  | "okxApr"
  | "binanceFunding"
  | "estProfit1h"
  | "estProfit1d"
  | "estProfit30d";
export type SortDir = "asc" | "desc";

function getSortValue(opp: ScanOpportunityClient, field: SortField): number {
  switch (field) {
    case "okxApr":
      return opp.okxAprPercent ? parseFloat(opp.okxAprPercent) : -Infinity;
    case "binanceFunding":
      return opp.binanceFundingRatePercent
        ? parseFloat(opp.binanceFundingRatePercent)
        : -Infinity;
    case "estProfit1h":
      return opp.estimatedProfit1h ? parseFloat(opp.estimatedProfit1h) : -Infinity;
    case "estProfit1d":
      return opp.estimatedProfit1d ? parseFloat(opp.estimatedProfit1d) : -Infinity;
    case "estProfit30d":
      return opp.estimatedProfit30d ? parseFloat(opp.estimatedProfit30d) : -Infinity;
  }
}

export default function ScanPage() {
  const { data, error, loading, refreshing, refetch } =
    useApi<ScanApiResponse>("/api/scan", 60_000);

  const [minApr, setMinApr] = useState("80");
  const [assetSearch, setAssetSearch] = useState("");
  const [positionSize, setPositionSize] = useState("100");
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortField(field);
        setSortDir("desc");
      }
    },
    [sortField]
  );

  const positionNum = parseFloat(positionSize) || 100;
  const refPosition = data?.referencePositionUsd ?? 100;
  const positionScale = positionNum / refPosition;

  // Filter opportunities client-side
  const filtered = useMemo(() => {
    if (!data?.opportunities) return [];
    const minAprNum = parseFloat(minApr) || 0;
    const search = assetSearch.toLowerCase().trim();

    let result = data.opportunities.filter((opp) => {
      const aprVal = opp.okxAprPercent ? parseFloat(opp.okxAprPercent) : 0;
      if (aprVal < minAprNum) return false;
      if (
        search &&
        !opp.asset.toLowerCase().includes(search) &&
        !opp.displayName.toLowerCase().includes(search)
      )
        return false;
      return true;
    });

    // Apply sort
    if (sortField) {
      result = [...result].sort((a, b) => {
        const va = getSortValue(a, sortField);
        const vb = getSortValue(b, sortField);
        return sortDir === "desc" ? vb - va : va - vb;
      });
    }

    return result;
  }, [data, minApr, assetSearch, sortField, sortDir]);

  const filteredSummary = useMemo(() => {
    if (!data?.summary) return null;
    return {
      ...data.summary,
      totalOpportunities: filtered.length,
    };
  }, [data?.summary, filtered.length]);

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <Header />

      <main className="mx-auto flex w-full max-w-[1280px] flex-1 flex-col gap-6 px-4 py-6 md:px-10">
        <ScanFilters
          minApr={minApr}
          onMinAprChange={setMinApr}
          assetSearch={assetSearch}
          onAssetSearchChange={setAssetSearch}
          onScan={() => refetch(true)}
          scanning={loading || refreshing}
        />

        <ScanSummaryCards
          summary={filteredSummary}
          loading={loading}
          error={error}
        />

        {/* Table header */}
        <div className="mt-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <span className="material-symbols-outlined text-primary">sort</span>
            Recommended Hedges
          </h3>
          <div className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1">
            <span className="text-xs font-medium text-slate-500">
              Based on{" "}
            </span>
            <span className="text-xs font-medium text-slate-500">$</span>
            <input
              type="number"
              value={positionSize}
              onChange={(e) => setPositionSize(e.target.value)}
              className="w-20 bg-transparent text-xs font-bold text-slate-200 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />
            <span className="text-xs font-medium text-slate-500">
              Position
            </span>
          </div>
        </div>

        <ScanTable
          opportunities={filtered}
          loading={loading}
          error={error}
          positionScale={positionScale}
          sortField={sortField}
          sortDir={sortDir}
          onSort={handleSort}
        />

        {/* Pagination info */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between py-2">
            <p className="text-xs font-medium text-slate-500">
              Showing {filtered.length} of{" "}
              {data?.opportunities.length ?? 0} results
            </p>
          </div>
        )}
      </main>

      <ScanFooter
        exchangeStatus={data?.exchangeStatus ?? null}
        fetchedAt={data?.fetchedAt ?? null}
      />
    </div>
  );
}
