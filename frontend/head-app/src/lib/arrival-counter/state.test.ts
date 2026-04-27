import { describe, expect, it, vi } from "vitest";
import { getArrivalSessionContext, lookupArrivalCandidate, markArrived } from "$api/arrival";
import { ArrivalCounterState } from "$arrival/state.svelte";

vi.mock("$api/arrival", () => ({
  getArrivalSessionContext: vi.fn(async () => ({
    has_active: true,
    stats: { arrived: 1, awaiting_arrival: 2 },
    current_session: null,
    next_session: null,
    recent_arrivals: [],
  } as Awaited<ReturnType<typeof getArrivalSessionContext>>)),
  lookupArrivalCandidate: vi.fn(async () => ({ candidates: [] })),
  markArrived: vi.fn(),
}));

describe("ArrivalCounterState", () => {
  it("starts in idle state", () => {
    const state = new ArrivalCounterState();
    expect(state.resultState).toBe("idle");
    expect(state.selected).toBeNull();
  });

  it("moves to no-match when lookup returns no candidates", async () => {
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("no-match");
  });

  it("moves to error for short input", async () => {
    const state = new ArrivalCounterState();
    await state.lookup("x");
    expect(state.resultState).toBe("error");
    expect(state.message).toBeTruthy();
  });

  it("resets to idle cleanly", () => {
    const state = new ArrivalCounterState();
    state.resultState = "success";
    state.selected = { name: "QE-0001" } as any;
    state.reset();
    expect(state.resultState).toBe("idle");
    expect(state.selected).toBeNull();
    expect(state.inputValue).toBe("");
  });
});
