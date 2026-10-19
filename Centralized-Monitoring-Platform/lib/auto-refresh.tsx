"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef, 
  useState,
} from "react";

export interface RefreshOption {
  label: string;
  ms: number; // 0 = off
}

export const REFRESH_OPTIONS: RefreshOption[] = [
  { label: "Off", ms: 0 },
  { label: "5s", ms: 5_000 },
  { label: "15s", ms: 15_000 },
  { label: "30s", ms: 30_000 },
  { label: "1m", ms: 60_000 },
  { label: "30m", ms: 30 * 60_000 },
  { label: "1h", ms: 60 * 60_000 },
  { label: "12h", ms: 12 * 60 * 60_000 },
  { label: "1d", ms: 24 * 60 * 60_000 },
];

const DEFAULT_MS = 30_000;
const STORAGE_KEY = "evc-dashboard:auto-refresh-ms";

interface AutoRefreshContextValue {
  intervalMs: number;
  setIntervalMs: (ms: number) => void;
}

const fallbackContext: AutoRefreshContextValue = {
  intervalMs: 0,
  setIntervalMs: () => {},
};

const AutoRefreshContext = createContext<AutoRefreshContextValue | null>(null);

export function AutoRefreshProvider({ children }: { children: React.ReactNode }) {
  const [intervalMs, setIntervalMsState] = useState<number>(DEFAULT_MS);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) {
        const parsed = Number(stored);
        if (!Number.isNaN(parsed)) {
          window.setTimeout(() => setIntervalMsState(parsed), 0);
        }
      }
    } catch {
      // localStorage unavailable
    }
  }, []);

  const setIntervalMs = useCallback((ms: number) => {
    setIntervalMsState(ms);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(ms));
    } catch {
      // ignore
    }
  }, []);

  return (
    <AutoRefreshContext.Provider value={{ intervalMs, setIntervalMs }}>
      {children}
    </AutoRefreshContext.Provider>
  );
}

function useAutoRefreshContext(): AutoRefreshContextValue {
  const ctx = useContext(AutoRefreshContext);
  return ctx || fallbackContext;
}

export function useAutoRefreshInterval() {
  return useAutoRefreshContext();
}

export function useAutoRefresh(callback: () => void) {
  const { intervalMs } = useAutoRefreshContext();
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!intervalMs || intervalMs <= 0) return;

    let id: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (id !== null) return;
      id = setInterval(() => callbackRef.current(), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    if (document.visibilityState === "visible") start();

    const onVisibility = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}
