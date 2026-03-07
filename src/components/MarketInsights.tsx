import { marketInsights } from "@/lib/mock-data";

export function MarketInsights() {
  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-card-dark">
        <h3 className="font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">show_chart</span>
          Market Insights
        </h3>
      </div>
      <div className="flex flex-col">
        {marketInsights.map((item, i) => (
          <div
            key={item.title}
            className={`p-4 flex gap-3 ${
              i < marketInsights.length - 1
                ? "border-b border-slate-800/50"
                : ""
            }`}
          >
            <span
              className={`material-symbols-outlined ${item.iconColor} text-[20px] mt-0.5`}
            >
              {item.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-200">
                {item.title}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {item.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
