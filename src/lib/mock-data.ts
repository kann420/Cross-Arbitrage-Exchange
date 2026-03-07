// ─── Shared ───────────────────────────────────────────────
export const walletAddress = "0x4A...2B9c";

export const alerts = [
  {
    icon: "warning",
    iconColor: "text-orange-500",
    title: "Funding Rate Spike",
    description: "Binance perp funding rate increased by 2% in last 4h.",
  },
  {
    icon: "info",
    iconColor: "text-primary",
    title: "Auto-compound",
    description: "Next OKX staking reward distribution in 2h 15m.",
  },
];

// ─── Positions page ───────────────────────────────────────
export const hedgePosition = {
  pair: "BTC/USDT",
  strategy: "Binance Short + OKX Spot Staking",
  status: "Active" as const,
  livePrice: 64230.5,
  totalPositionSize: 128461.0,
  netPnl: 1450.2,
  netPnlPercent: 1.13,
  netApy: 14.2,
  deltaExposure: -0.05,
};

export const okxLeg = {
  exchange: "OKX",
  label: "OKX Spot / Staking Leg",
  type: "Long Spot" as const,
  icon: "account_balance",
  assetBalance: "1.0000 BTC",
  avgEntry: 63780.5,
  markPrice: 64230.5,
  notionalValue: 64230.5,
  stats: [
    { label: "Staking APY", value: "8.5%", color: "green" as const },
    { label: "Earned PnL", value: "+$450.00", color: "green" as const },
    { label: "Total PNL", value: "+$680", color: "green" as const },
    { label: "Fees", value: "-$18", color: "red" as const },
  ],
};

export const binanceLeg = {
  exchange: "Binance",
  label: "Binance Short Hedge Leg",
  type: "Short Perp" as const,
  icon: "trending_down",
  positionSize: "-1.0500 BTC",
  avgEntry: 65183.0,
  markPrice: 64230.5,
  marginLev: "$12,846 (5x)",
  stats: [
    { label: "Funding APR", value: "5.7%", color: "green" as const },
    { label: "Liq Price", value: "$75,400", color: "red" as const },
    { label: "Leg PnL", value: "+$1,000.20", color: "green" as const },
    { label: "Funding", value: "-$82", color: "red" as const },
  ],
};

// ─── Dashboard page ───────────────────────────────────────
export const dashboardStats = {
  totalNetValue: 1250000.0,
  totalPnl: 12450.0,
  averageNetApy: 15.4,
  totalActiveHedges: 8,
};

export const marketInsights = [
  {
    icon: "show_chart",
    iconColor: "text-green-400",
    title: "BTC Funding Premium",
    description: "Binance perp funding rate is unusually high compared to OKX.",
  },
  {
    icon: "electric_bolt",
    iconColor: "text-blue-400",
    title: "ETH Volatility Alert",
    description: "High volatility detected in ETH pairs. Spreads widened.",
  },
  {
    icon: "star",
    iconColor: "text-orange-400",
    title: "SOL Arbitrage Opportunity",
    description:
      "1.5% spread detected on SOL/USDT between Binance and Kraken.",
  },
];

export const portfolioAllocation = [
  { label: "BTC", percent: 45, color: "#3713ec" },
  { label: "ETH", percent: 30, color: "#22c55e" },
  { label: "SOL", percent: 15, color: "#f97316" },
  { label: "Other", percent: 10, color: "#6b7280" },
];

export const activeStrategies = [
  {
    icon: "₿",
    iconBg: "bg-orange-900/30 text-orange-400",
    name: "BTC Arbitrage (Binance/OKX)",
    totalSize: "$500,000",
    spread: "0.8%",
    dailyCarry: "+$125",
    status: "Active" as const,
  },
  {
    icon: "Ξ",
    iconBg: "bg-blue-900/30 text-blue-400",
    name: "ETH Cash & Carry",
    totalSize: "$350,000",
    spread: "0.6%",
    dailyCarry: "+$80",
    status: "Active" as const,
  },
  {
    icon: "S",
    iconBg: "bg-purple-900/30 text-purple-400",
    name: "SOL Funding Hedge",
    totalSize: "$150,000",
    spread: "1.2%",
    dailyCarry: "+$45",
    status: "Rebalancing" as const,
  },
];

// ─── History page ─────────────────────────────────────────
export const historyStats = {
  totalRealizedPnl: 45230.5,
  completedArbitrages: 142,
  avgStrategyDuration: "4d 12h",
};

export interface HistoryLeg {
  exchange: string;
  side: "long" | "short";
  entryPrice: string;
  exitPrice: string;
  size: string;
}

export interface HistoryEntry {
  date: string;
  time: string;
  icon: string;
  iconBg: string;
  strategy: string;
  legs: { label: string; side: "long" | "short" }[];
  duration: string;
  spreadPercent: string;
  spreadPositive: boolean;
  finalPnl: string;
  pnlPositive: boolean;
  status: "Settled" | "Liquidated";
  details?: {
    spotLeg: HistoryLeg;
    perpLeg: HistoryLeg;
  };
}

export const historyEntries: HistoryEntry[] = [
  {
    date: "Oct 24, 2023",
    time: "14:30 UTC",
    icon: "₿",
    iconBg: "bg-orange-900/30 text-orange-400",
    strategy: "BTC Cash & Carry",
    legs: [
      { label: "OKX Spot", side: "long" },
      { label: "Binance Perp Short", side: "short" },
    ],
    duration: "5d 4h",
    spreadPercent: "1.2%",
    spreadPositive: true,
    finalPnl: "+$1,200.00",
    pnlPositive: true,
    status: "Settled",
    details: {
      spotLeg: {
        exchange: "OKX Spot",
        side: "long",
        entryPrice: "$34,200.00",
        exitPrice: "$35,100.00",
        size: "2.5 BTC",
      },
      perpLeg: {
        exchange: "Binance Perp",
        side: "short",
        entryPrice: "$34,280.00",
        exitPrice: "$35,050.00",
        size: "2.5 BTC",
      },
    },
  },
  {
    date: "Oct 20, 2023",
    time: "09:15 UTC",
    icon: "Ξ",
    iconBg: "bg-blue-900/30 text-blue-400",
    strategy: "ETH Basis Arb",
    legs: [
      { label: "Binance Spot", side: "long" },
      { label: "OKX Perp Short", side: "short" },
    ],
    duration: "8d 14h",
    spreadPercent: "0.8%",
    spreadPositive: true,
    finalPnl: "+$840.50",
    pnlPositive: true,
    status: "Settled",
    details: {
      spotLeg: {
        exchange: "Binance Spot",
        side: "long",
        entryPrice: "$1,820.00",
        exitPrice: "$1,875.00",
        size: "50 ETH",
      },
      perpLeg: {
        exchange: "OKX Perp",
        side: "short",
        entryPrice: "$1,825.00",
        exitPrice: "$1,872.00",
        size: "50 ETH",
      },
    },
  },
  {
    date: "Oct 15, 2023",
    time: "18:45 UTC",
    icon: "S",
    iconBg: "bg-purple-900/30 text-purple-400",
    strategy: "SOL Cross-Exchange",
    legs: [
      { label: "OKX Short", side: "short" },
      { label: "Binance Long", side: "long" },
    ],
    duration: "2d 1h",
    spreadPercent: "-0.1%",
    spreadPositive: false,
    finalPnl: "-$120.00",
    pnlPositive: false,
    status: "Liquidated",
    details: {
      spotLeg: {
        exchange: "OKX Short",
        side: "short",
        entryPrice: "$24.50",
        exitPrice: "$25.10",
        size: "5000 SOL",
      },
      perpLeg: {
        exchange: "Binance Long",
        side: "long",
        entryPrice: "$24.45",
        exitPrice: "$25.05",
        size: "5000 SOL",
      },
    },
  },
];
