import type { AllocationSlice } from "@/lib/api-types";

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export interface PortfolioAllocationProps {
  allocation: AllocationSlice[];
  totalValue: string;
}

/**
 * SVG donut chart for portfolio allocation.
 * Each segment uses stroke-dasharray on a circle to render a slice.
 */
export function PortfolioAllocation({ allocation, totalValue }: PortfolioAllocationProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let cumulativeOffset = 0;

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden p-6">
      <h3 className="font-bold text-lg mb-4">Portfolio Allocation</h3>

      <div className="flex flex-col items-center gap-4">
        {/* Donut chart */}
        <div className="relative w-48 h-48">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            {allocation.map((slice) => {
              const dashLength = (slice.percent / 100) * circumference;
              const dashGap = circumference - dashLength;
              const offset = cumulativeOffset;
              cumulativeOffset += dashLength;

              return (
                <circle
                  key={slice.label}
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth="12"
                  strokeDasharray={`${dashLength} ${dashGap}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              );
            })}
          </svg>
          {/* Center label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xs text-slate-400">Total Assets</p>
            <p className="text-xl font-bold">{formatCompactUsd(parseFloat(totalValue))}</p>
          </div>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2">
          {allocation.map((slice) => (
            <div key={slice.label} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: slice.color }}
              />
              <span className="text-slate-300">
                {slice.label} ({slice.percent.toFixed(0)}%)
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
