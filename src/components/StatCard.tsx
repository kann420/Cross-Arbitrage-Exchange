interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: "green" | "red" | "default";
  /** Use larger text for hero-style cards */
  large?: boolean;
}

export function StatCard({
  label,
  value,
  sub,
  color = "default",
  large = false,
}: StatCardProps) {
  const colorClass =
    color === "green"
      ? "text-green-400"
      : color === "red"
        ? "text-red-400"
        : "";

  return (
    <div className="flex flex-col gap-1 p-4 rounded-lg bg-card-dark border border-slate-800">
      <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider">
        {label}
      </p>
      <p
        className={`font-bold ${large ? "text-2xl lg:text-3xl" : "text-xl"} ${colorClass}`}
      >
        {value}
        {sub && <span className="text-sm font-medium ml-1">{sub}</span>}
      </p>
    </div>
  );
}
