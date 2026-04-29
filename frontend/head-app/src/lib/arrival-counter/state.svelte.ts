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
  isContextStale = $state(false);
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
      this.isContextStale = false;
      return true;
    } catch {
      this.isContextStale = true;
      return false;
    }
  }

  async lookup(raw: string) {
    if (this.isLookupPending) return;

    this.inputValue = raw;
    const classified = classifyInput(raw);
    if (!classified) {
      this.resultState = "idle";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 3 letters.";
      return;
    }

    this.message = "";
    this.isLookupPending = true;
    this.resultState = "loading";
    try {
      const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
      this.candidates = response.candidates;
      if (response.error === "no_active_session") {
        this.message = "No arrival session is active. Ask the queue manager to start or resume a session, then try again.";
      }
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

    const contextVerified = await this.refreshContext();
    if (!contextVerified) {
      this.message = "Could not verify the active arrival session. Check the connection and try again.";
      return;
    }

    if (this.context && !this.context.has_active) {
      this.message = "Arrival session is no longer active. Refresh the counter or contact the queue manager.";
      return;
    }

    this.isConfirmPending = true;
    try {
      const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
      this.selected = result.result_card;
      this.resultState = result.already_arrived ? "already-arrived" : "success";
      await this.refreshContext();
    } catch (error) {
      const reconciled = await this.reconcileSelectedAfterConfirmFailure();
      if (reconciled) {
        this.message = "Arrival was already confirmed. Token slip can be printed if needed.";
        return;
      }

      this.message = error instanceof Error ? error.message : "Could not confirm arrival. Try again.";
    } finally {
      this.isConfirmPending = false;
    }
  }

  async reconcileSelectedAfterConfirmFailure() {
    if (!this.selected?.queue_entry) return false;

    try {
      const response = await lookupArrivalCandidate({ queue_entry: this.selected.queue_entry });
      const reconciled = response.candidates[0];
      if (!reconciled) return false;

      this.selected = reconciled;
      this.resultState = reconciled.status === "Arrived" ? "already-arrived" : "pre-confirm";
      return reconciled.status === "Arrived";
    } catch {
      return false;
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
