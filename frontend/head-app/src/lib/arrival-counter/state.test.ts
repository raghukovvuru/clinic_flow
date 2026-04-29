import { describe, expect, it, vi, beforeEach } from "vitest";
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

const mockCard = {
  name: "PAT-001",
  queue_entry: "QE-0001",
  display_token: "OPD-001",
  patient_name: "Mimi Test",
  queue_session: "QS-001",
  status: "Waiting",
  state_label: "Waiting",
  visit_label: "OPD",
};

describe("ArrivalCounterState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("ignores duplicate lookup while a lookup is pending", async () => {
    let resolveLookup: (value: { candidates: typeof mockCard[] }) => void = () => {};
    vi.mocked(lookupArrivalCandidate).mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );

    const state = new ArrivalCounterState();
    const first = state.lookup("Mimi Test");
    const second = state.lookup("Mimi Test");

    expect(lookupArrivalCandidate).toHaveBeenCalledTimes(1);

    resolveLookup({ candidates: [mockCard] });
    await first;
    await second;

    expect(state.resultState).toBe("pre-confirm");
  });

  it("returns to idle with message for invalid input", async () => {
    const state = new ArrivalCounterState();
    await state.lookup("x");
    expect(state.resultState).toBe("idle");
    expect(state.message).toBeTruthy();
  });

  it("moves to pre-confirm when lookup finds a single candidate", async () => {
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("pre-confirm");
    expect(state.selected).toEqual(mockCard);
  });

  it("moves to multiple when lookup returns many candidates", async () => {
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard, { ...mockCard, name: "PAT-002" }] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("multiple");
    expect(state.candidates).toHaveLength(2);
  });

  it("returns to idle with message when lookup throws", async () => {
    vi.mocked(lookupArrivalCandidate).mockRejectedValueOnce(new Error("Network error"));
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("idle");
    expect(state.message).toBe("Network error");
  });

  it("sets inputValue before classifier call", () => {
    const state = new ArrivalCounterState();
    state.lookup("  Mimi  ");
    expect(state.inputValue).toBe("  Mimi  ");
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

  it("tracks focused candidate for keyboard selection", async () => {
    // Set up mock with two candidates
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New" };
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard, { ...mockCard, queue_entry: "QE-0002", name: "QE-0002" }] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");

    expect(state.resultState).toBe("multiple");
    expect(state.focusedCandidateIndex).toBe(0);

    state.moveCandidateFocus(1);
    expect(state.focusedCandidateIndex).toBe(1);

    state.selectFocusedCandidate();
    expect(state.selected?.queue_entry).toBe("QE-0002");
    expect(state.resultState).toBe("pre-confirm");
  });

  it("does not overwrite an active decision during context refresh", async () => {
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New" };
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    await state.refreshContext();

    expect(state.selected?.queue_entry).toBe("QE-0001");
    expect(state.resultState).toBe("pre-confirm");
  });

  it("shows already-arrived state when confirm response reports already arrived", async () => {
    const state = new ArrivalCounterState();
    state.selected = mockCard as any;

    vi.mocked(markArrived).mockResolvedValueOnce({
      status: "Arrived",
      already_arrived: true,
      result_card: { ...mockCard, status: "Arrived", state_label: "Already Arrived" },
    });

    await state.confirmArrival();

    expect(state.resultState).toBe("already-arrived");
    expect(state.selected?.state_label).toBe("Already Arrived");
  });

  it("blocks confirm when refreshed context reports no active session", async () => {
    const state = new ArrivalCounterState();
    state.selected = mockCard as any;
    state.context = {
      has_active: true,
      stats: { arrived: 0, awaiting_arrival: 1 },
      current_session: { name: "QS-1", session_name: "Morning Clinic", status: "Active", start_time: "09:00:00" },
      next_session: null,
      recent_arrivals: [],
    };

    vi.mocked(getArrivalSessionContext).mockResolvedValueOnce({
      has_active: false,
      stats: { arrived: 0, awaiting_arrival: 1 },
      current_session: null,
      next_session: null,
      recent_arrivals: [],
    });

    await state.confirmArrival();

    expect(markArrived).not.toHaveBeenCalled();
    expect(state.resultState).toBe("idle");
    expect(state.message).toBe("Arrival session is no longer active. Refresh the counter or contact the queue manager.");
  });

  it("reconciles selected candidate after confirm timeout before showing retry guidance", async () => {
    const state = new ArrivalCounterState();
    state.selected = mockCard as any;

    vi.mocked(markArrived).mockRejectedValueOnce(new Error("Request timed out"));
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({
      candidates: [{ ...mockCard, status: "Arrived", state_label: "Already Arrived" } as any],
    });

    await state.confirmArrival();

    expect(lookupArrivalCandidate).toHaveBeenCalledWith({ queue_entry: mockCard.queue_entry });
    expect(state.resultState).toBe("already-arrived");
    expect(state.selected?.status).toBe("Arrived");
  });

  it("keeps current context when refresh fails and preserves the visible decision state", async () => {
    const state = new ArrivalCounterState();
    state.context = {
      has_active: true,
      stats: { arrived: 1, awaiting_arrival: 2 },
      current_session: null,
      next_session: null,
      recent_arrivals: [],
    };
    vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("Network connection failed. Retry when the connection is stable."));

    await state.refreshContext();

    expect(state.context?.stats.arrived).toBe(1);
  });

  it("marks context stale when background refresh fails without clearing active context", async () => {
    const state = new ArrivalCounterState();
    state.context = {
      has_active: true,
      stats: { arrived: 1, awaiting_arrival: 2 },
      current_session: null,
      next_session: null,
      recent_arrivals: [],
    };
    vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("offline"));

    await state.refreshContext();

    expect(state.isContextStale).toBe(true);
    expect(state.context?.stats.arrived).toBe(1);
  });

  it("returns false when context refresh fails", async () => {
    const state = new ArrivalCounterState();
    vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("offline"));

    await expect(state.refreshContext()).resolves.toBe(false);
  });

  it("blocks confirm when active session cannot be verified", async () => {
    const state = new ArrivalCounterState();
    state.selected = mockCard as any;
    state.context = {
      has_active: true,
      stats: { arrived: 0, awaiting_arrival: 1 },
      current_session: { name: "QS-1", session_name: "Morning Clinic", status: "Active", start_time: "09:00:00" },
      next_session: null,
      recent_arrivals: [],
    };
    vi.mocked(getArrivalSessionContext).mockRejectedValueOnce(new Error("offline"));

    await state.confirmArrival();

    expect(markArrived).not.toHaveBeenCalled();
    expect(state.message).toBe("Could not verify the active arrival session. Check the connection and try again.");
  });

  it("clears previous warning when valid lookup starts", async () => {
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard] });
    const state = new ArrivalCounterState();
    state.message = "No arrival session is active. Ask the queue manager to start or resume a session, then try again.";

    await state.lookup("Mimi");

    expect(state.message).toBe("");
    expect(state.resultState).toBe("pre-confirm");
  });
});
