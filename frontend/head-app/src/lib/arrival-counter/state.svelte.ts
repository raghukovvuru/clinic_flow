import { getArrivalSessionContext, lookupArrivalCandidate, markArrived } from "$api/arrival";
import { classifyInput } from "$arrival/classify";
import type { ArrivalCardRecord, ArrivalSessionContext, ResultState } from "$arrival/types";

export class ArrivalCounterState {
  context = $state<ArrivalSessionContext | null>(null);
  resultState = $state<ResultState>("idle");
  inputValue = $state("");
  message = $state("");
  selected = $state<ArrivalCardRecord | null>(null);
  candidates = $state<ArrivalCardRecord[]>([]);
  focusedCandidateIndex = $state(0);
  isLookupPending = $state(false);
  isConfirmPending = $state(false);
  shouldFocusInput = $state(0);

  moveCandidateFocus(delta: number) {
    if (!this.candidates.length) return;
    this.focusedCandidateIndex = (this.focusedCandidateIndex + delta + this.candidates.length) % this.candidates.length;
  }

  selectFocusedCandidate() {
    const card = this.candidates[this.focusedCandidateIndex];
    if (!card) return;
    this.selected = card;
    this.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  requestInputFocus() {
    this.shouldFocusInput += 1;
  }

  async refreshContext() {
    try {
      this.context = await getArrivalSessionContext();
    } catch {
      // stale-while-revalidate: keep current context on error
    }
  }

  async lookup(raw: string) {
    this.inputValue = raw;
    const classified = classifyInput(raw);
    if (!classified) {
      this.resultState = "idle";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 3 letters.";
      return;
    }

    this.isLookupPending = true;
    this.resultState = "loading";
    try {
      const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
      this.candidates = response.candidates;
      this.focusedCandidateIndex = 0;
    } catch (error) {
      this.resultState = "idle";
      this.message = error instanceof Error ? error.message : "Lookup failed. Try again.";
      return;
    } finally {
      this.isLookupPending = false;
    }

    if (!this.candidates.length) {
      this.resultState = "no-match";
      return;
    }

    if (this.candidates.length > 1) {
      this.resultState = "multiple";
      return;
    }

    this.selected = this.candidates[0];
    this.resultState = this.selected.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  async confirmArrival() {
    if (!this.selected || this.isConfirmPending) return;
    this.isConfirmPending = true;
    try {
      const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
      this.selected = result.result_card;
      this.resultState = result.already_arrived ? "already-arrived" : "success";
      await this.refreshContext();
    } catch (error) {
      this.message = error instanceof Error ? error.message : "Could not confirm arrival. Try again.";
    } finally {
      this.isConfirmPending = false;
    }
  }

  reset() {
    this.inputValue = "";
    this.message = "";
    this.selected = null;
    this.candidates = [];
    this.focusedCandidateIndex = 0;
    this.resultState = "idle";
    this.requestInputFocus();
  }
}
