"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface UseApiResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
  refetch: (forceRefresh?: boolean) => void;
}

export function useApi<T>(
  url: string,
  pollIntervalMs = 30_000
): UseApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      if (inFlightRef.current) return;

      inFlightRef.current = true;
      if (hasLoadedRef.current) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const separator = url.includes("?") ? "&" : "?";
        const fetchUrl = forceRefresh ? `${url}${separator}refresh=true` : url;
        const res = await fetch(fetchUrl);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const json = await res.json();
        setData(json);
        setError(null);
        hasLoadedRef.current = true;
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
        inFlightRef.current = false;
      }
    },
    [url]
  );

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => fetchData(), pollIntervalMs);
    return () => clearInterval(interval);
  }, [fetchData, pollIntervalMs]);

  return { data, error, loading, refreshing, refetch: fetchData };
}
