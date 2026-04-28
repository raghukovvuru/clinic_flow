import type { ArrivalRealtimeClient, ArrivalRealtimeMode, ArrivalTransportState } from "$arrival/types";

export function attachArrivalTransport({
  mode,
  invalidate,
  realtime,
  intervalMs = 30000,
}: {
  mode: ArrivalRealtimeMode;
  invalidate: () => void | Promise<void>;
  realtime?: ArrivalRealtimeClient;
  intervalMs?: number;
}) {
  const cleanups: Array<() => void> = [];
  const state: ArrivalTransportState = {
    mode,
    lastRefreshAt: null,
    stale: false,
    failureCount: 0,
  };

  async function safeInvalidate() {
    try {
      await invalidate();
      state.lastRefreshAt = Date.now();
      state.stale = false;
      state.failureCount = 0;
    } catch {
      state.failureCount += 1;
      state.stale = true;
    }
  }

  if (mode === "frappe" && realtime?.on) {
    for (const event of ["queue_update", "session_status"] as const) {
      const cleanup = realtime.on(event, () => void safeInvalidate());
      if (typeof cleanup === "function") cleanups.push(cleanup as () => void);
    }
  }

  if (mode === "polling" || mode === "frappe") {
    const interval = window.setInterval(() => void safeInvalidate(), intervalMs);
    cleanups.push(() => window.clearInterval(interval));
  }

  return {
    state,
    detach() {
      for (const cleanup of cleanups) cleanup();
    },
  };
}
