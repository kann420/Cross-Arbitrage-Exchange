import { NextResponse } from "next/server";
import { OkxAdapter } from "@/lib/server/exchanges/okx/adapter";
import { BinanceAdapter } from "@/lib/server/exchanges/binance/adapter";

export const dynamic = "force-dynamic";

export async function GET() {
  const okx = new OkxAdapter();
  const binance = new BinanceAdapter();

  const [okxHealth, binanceHealth] = await Promise.all([
    okx.healthcheck().catch((e: Error) => ({
      ok: false,
      exchange: "okx" as const,
      message: e.message,
    })),
    binance.healthcheck().catch((e: Error) => ({
      ok: false,
      exchange: "binance" as const,
      message: e.message,
    })),
  ]);

  return NextResponse.json({
    status: okxHealth.ok && binanceHealth.ok ? "healthy" : "degraded",
    exchanges: { okx: okxHealth, binance: binanceHealth },
    ts: Date.now(),
  });
}
