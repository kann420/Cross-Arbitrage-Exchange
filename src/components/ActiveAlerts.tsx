export interface AlertItem {
  icon: string;
  iconColor: string;
  title: string;
  description: string;
}

export interface ActiveAlertsProps {
  alerts?: AlertItem[];
}

const defaultAlerts: AlertItem[] = [
  {
    icon: "info",
    iconColor: "text-primary",
    title: "Connecting to exchanges...",
    description: "Waiting for live data from OKX and Binance.",
  },
];

export function ActiveAlerts({ alerts }: ActiveAlertsProps) {
  const items = alerts && alerts.length > 0 ? alerts : defaultAlerts;

  return (
    <div className="flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-800 bg-card-dark">
        <h3 className="font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-sm">
            notifications
          </span>
          Active Alerts
        </h3>
      </div>
      <div className="flex flex-col">
        {items.map((alert, i) => (
          <div
            key={`${alert.title}-${i}`}
            className={`p-4 flex gap-3 ${
              i < items.length - 1 ? "border-b border-slate-800/50" : ""
            }`}
          >
            <span
              className={`material-symbols-outlined ${alert.iconColor} text-[20px] mt-0.5`}
            >
              {alert.icon}
            </span>
            <div>
              <p className="text-sm font-medium text-slate-200">
                {alert.title}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {alert.description}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
