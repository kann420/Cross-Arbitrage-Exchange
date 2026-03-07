import "server-only";
import { createHmac } from "crypto";
import { getConfig } from "../../config";

const OKX_BASE = "https://www.okx.com";

function sign(
  timestamp: string,
  method: string,
  requestPath: string,
  body: string,
  secret: string
): string {
  const prehash = timestamp + method.toUpperCase() + requestPath + body;
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

export async function okxRequest<T>(
  method: "GET" | "POST",
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const config = getConfig();
  const timestamp = new Date().toISOString();

  let fullPath = path;
  if (params && method === "GET") {
    const qs = new URLSearchParams(params).toString();
    if (qs) fullPath = `${path}?${qs}`;
  }

  const body = "";
  const signature = sign(
    timestamp,
    method,
    fullPath,
    body,
    config.OKX_API_SECRET
  );

  const res = await fetch(`${OKX_BASE}${fullPath}`, {
    method,
    headers: {
      "OK-ACCESS-KEY": config.OKX_API_KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": config.OKX_API_PASSPHRASE,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OKX ${method} ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json();

  // OKX wraps responses in { code, msg, data }
  if (json.code !== "0") {
    throw new Error(
      `OKX API error on ${path}: code=${json.code} msg=${json.msg}`
    );
  }

  return json.data as T;
}
