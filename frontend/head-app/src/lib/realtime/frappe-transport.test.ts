import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachArrivalTransport } from "./frappe-transport";

describe("attachArrivalTransport", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("polls when boot mode is polling", () => {
    const invalidate = vi.fn();
    const transport = attachArrivalTransport({ mode: "polling", invalidate, intervalMs: 30000 });

    vi.advanceTimersByTime(30000);

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(transport.state.mode).toBe("polling");
    transport.detach();
  });

  it("cleans polling interval", () => {
    const invalidate = vi.fn();
    const transport = attachArrivalTransport({ mode: "polling", invalidate, intervalMs: 30000 });

    transport.detach();
    vi.advanceTimersByTime(30000);

    expect(invalidate).not.toHaveBeenCalled();
  });

  it("uses injected realtime without reading window.frappe", () => {
    const invalidate = vi.fn();
    const callbacks: Record<string, () => void> = {};
    const realtime = { on: vi.fn((event: string, cb: () => void) => { callbacks[event] = cb; return () => {}; }) };

    const transport = attachArrivalTransport({ mode: "frappe", invalidate, realtime, intervalMs: 30000 });
    callbacks.queue_update();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(realtime.on).toHaveBeenCalledWith("queue_update", expect.any(Function));
    transport.detach();
  });
});
