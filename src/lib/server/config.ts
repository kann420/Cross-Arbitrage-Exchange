import "server-only";
import { z } from "zod";

const envSchema = z.object({
  OKX_API_KEY: z.string().min(1, "OKX_API_KEY is required"),
  OKX_API_SECRET: z.string().min(1, "OKX_API_SECRET is required"),
  OKX_API_PASSPHRASE: z.string().min(1, "OKX_API_PASSPHRASE is required"),
  BINANCE_API_KEY: z.string().min(1, "BINANCE_API_KEY is required"),
  BINANCE_API_SECRET: z.string().min(1, "BINANCE_API_SECRET is required"),
});

export type EnvConfig = z.infer<typeof envSchema>;

let _config: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (_config) return _config;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Missing required environment variables: ${missing}`);
  }

  _config = result.data;
  return _config;
}
