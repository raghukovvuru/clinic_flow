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
  print_context: {
    queue_entry: "QE-0001",
    display_token: "OPD-001",
    patient_name: "Mimi Test",
    qr_svg: "<svg></svg>",
  },
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

  it("moves to error for short input", async () => {
    const state = new ArrivalCounterState();
    await state.lookup("x");
    expect(state.resultState).toBe("error");
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

  it("shows error state when lookup throws", async () => {
    vi.mocked(lookupArrivalCandidate).mockRejectedValueOnce(new Error("Network error"));
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    expect(state.resultState).toBe("error");
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
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New", print_context: { queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg/>" } };
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
    const mockCard = { name: "QE-0001", queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", queue_session: "QS-1", status: "Booked", state_label: "Ready", visit_label: "New", print_context: { queue_entry: "QE-0001", display_token: "OPD-001", patient_name: "Mimi One", qr_svg: "<svg/>" } };
    vi.mocked(lookupArrivalCandidate).mockResolvedValueOnce({ candidates: [mockCard] });
    const state = new ArrivalCounterState();
    await state.lookup("Mimi");
    await state.refreshContext();

    expect(state.selected?.queue_entry).toBe("QE-0001");
    expect(state.resultState).toBe("pre-confirm");
  });
});
