export function attachArrivalTransport(
  invalidate: () => void,
  realtime?: { on?: (event: string, cb: (payload: unknown) => void) => unknown },
) {
  const cleanups: Array<() => void> = [];

  if (realtime?.on) {
    const offQueue = realtime.on("queue_update", () => invalidate());
    cleanups.push(() => { if (typeof offQueue === "function") offQueue(); });
    const offSession = realtime.on("session_status", () => invalidate());
    cleanups.push(() => { if (typeof offSession === "function") offSession(); });
  } else {
    console.info("ArrivalCounter: Frappe realtime unavailable, using interval polling.");
  }

  const interval = window.setInterval(invalidate, 30000);
  cleanups.push(() => window.clearInterval(interval));

  return () => {
    for (const fn of cleanups) fn();
  };
}
