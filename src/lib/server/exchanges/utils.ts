import Decimal from "decimal.js";

/**
 * Convert any timestamp input to milliseconds since epoch.
 */
export function toUnixMs(input: string | number | Date): number {
  if (input instanceof Date) return input.getTime();

  if (typeof input === "string") {
    // Try ISO parse first
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d.getTime();

    // Try numeric string
    const n = Number(input);
    if (!isNaN(n)) return n < 1e12 ? n * 1000 : n;

    throw new Error(`Invalid timestamp string: ${input}`);
  }

  // Number: detect seconds vs milliseconds
  if (input < 1e12) return input * 1000;
  return input;
}

/**
 * Safe decimal string — preserves original string, never lossy float conversion.
 */
export function toDecimalStr(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === "") return "0";
  return new Decimal(String(value)).toString();
}

/**
 * Absolute value of a decimal string.
 */
export function absDecimalStr(value: string): string {
  return new Decimal(value).abs().toString();
}

/**
 * Check if a decimal string is effectively zero (below dust).
 */
export function isZeroish(
  value: string,
  dustThreshold: string = "0.00000001"
): boolean {
  return new Decimal(value).abs().lessThanOrEqualTo(new Decimal(dustThreshold));
}

/**
 * Format a number as compact currency for display.
 */
export function formatUsd(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
