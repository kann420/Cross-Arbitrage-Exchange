import "server-only";
import { createHmac } from "crypto";
import { getConfig } from "../../config";

const BINANCE_FAPI = "https://fapi.binance.com";
const BINANCE_API = "https://api.binance.com";

function sign(queryString: string, secret: string): string {
  return createHmac("sha256", secret).update(queryString).digest("hex");
}

// Server time offset to compensate for local clock drift
let _timeOffsetMs = 0;
let _timeOffsetSynced = false;

async function syncTimeOffset(): Promise<void> {
  if (_timeOffsetSynced) return;
  try {
    const localBefore = Date.now();
    const res = await fetch(`${BINANCE_FAPI}/fapi/v1/time`);
    const localAfter = Date.now();
    const { serverTime } = (await res.json()) as { serverTime: number };
    const localMid = Math.floor((localBefore + localAfter) / 2);
    _timeOffsetMs = serverTime - localMid;
    _timeOffsetSynced = true;
    console.log(`[Binance] Time offset synced: ${_timeOffsetMs}ms`);
  } catch {
    console.warn("[Binance] Failed to sync server time, using local clock");
  }
}

export async function binanceRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>,
  base?: "fapi" | "api"
): Promise<T> {
  await syncTimeOffset();
  const config = getConfig();
  const baseUrl = base === "api" ? BINANCE_API : BINANCE_FAPI;

  const allParams: Record<string, string> = {
    ...params,
    timestamp: (Date.now() + _timeOffsetMs).toString(),
    recvWindow: "10000",
  };

  const queryString = new URLSearchParams(allParams).toString();
  const signature = sign(queryString, config.BINANCE_API_SECRET);
  const fullQs = `${queryString}&signature=${signature}`;

  const url = `${baseUrl}${path}?${fullQs}`;

  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": config.BINANCE_API_KEY,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `Binance ${method} ${path} failed (${res.status}): ${text}`
    );
  }

  return (await res.json()) as T;
}
