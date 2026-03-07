import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { HistoryFilters } from "@/components/HistoryFilters";
import { HistoryTable } from "@/components/HistoryTable";
import { historyStats } from "@/lib/mock-data";

function formatCurrency(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  });
}

export default function HistoryPage() {
  const stats = historyStats;

  return (
    <div className="relative flex min-h-screen w-full flex-col">
      <Header />

      <div className="flex flex-1 justify-center py-6 px-4 lg:px-10">
        <div className="flex flex-col max-w-[1400px] w-full gap-6">
          {/* Stats row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Realized PnL"
              value={`+${formatCurrency(stats.totalRealizedPnl)}`}
              color="green"
              large
            />
            <StatCard
              label="Completed Arbitrages"
              value={stats.completedArbitrages.toString()}
              large
            />
            <StatCard
              label="Average Strategy Duration"
              value={stats.avgStrategyDuration}
              large
            />
          </div>

          {/* Filters */}
          <HistoryFilters />

          {/* Table */}
          <HistoryTable />
        </div>
      </div>
    </div>
  );
}
