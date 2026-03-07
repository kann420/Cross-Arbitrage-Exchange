interface LegStat {
  label: string;
  value: string;
  color: "green" | "red";
}

interface LegCardProps {
  label: string;
  type: string;
  typeBadgeColor: "blue" | "red";
  icon: string;
  iconColor?: string;
  primaryLabel: string;
  primaryValue: string;
  details: { label: string; value: string; highlight?: boolean }[];
  stats: LegStat[];
}

export function LegCard({
  label,
  type,
  typeBadgeColor,
  icon,
  iconColor = "text-primary",
  primaryLabel,
  primaryValue,
  details,
  stats,
}: LegCardProps) {
  const badgeStyles =
    typeBadgeColor === "blue"
      ? "bg-blue-900/30 text-blue-400"
      : "bg-red-900/30 text-red-400";

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-card-dark">
        <div className="flex items-center gap-2">
          <span className={`material-symbols-outlined ${iconColor}`}>
            {icon}
          </span>
          <h3 className="font-bold">{label}</h3>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-xs font-semibold ${badgeStyles}`}
        >
          {type}
        </span>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="flex justify-between items-end flex-wrap gap-4">
          <div>
            <p className="text-slate-400 text-sm mb-1">{primaryLabel}</p>
            <p className="text-2xl font-bold">{primaryValue}</p>
          </div>
          <div className="flex gap-6 text-right">
            {details.map((d) => (
              <div key={d.label}>
                <p className="text-slate-400 text-sm mb-1">{d.label}</p>
                <p
                  className={`text-lg font-semibold ${d.highlight ? "text-green-400" : ""}`}
                >
                  {d.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="h-px w-full bg-slate-800 my-2" />

        <div className="grid grid-cols-4 gap-4">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="text-slate-400 text-xs uppercase tracking-wider mb-1">
                {stat.label}
              </p>
              <p
                className={`font-semibold ${
                  stat.color === "green" ? "text-green-400" : "text-red-400"
                }`}
              >
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
