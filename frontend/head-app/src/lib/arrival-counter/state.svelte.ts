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
      this.resultState = "error";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 3 letters.";
      return;
    }

    this.resultState = "loading";
    try {
      const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
      this.candidates = response.candidates;
    } catch {
      this.resultState = "error";
      this.message = "Lookup failed. Try again.";
      return;
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
    if (!this.selected) return;
    try {
      const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
      this.selected = result.result_card;
      this.resultState = result.already_arrived ? "already-arrived" : "success";
      await this.refreshContext();
    } catch {
      this.resultState = "error";
      this.message = "Could not confirm arrival. Try again.";
    }
  }

  reset() {
    this.inputValue = "";
    this.message = "";
    this.selected = null;
    this.candidates = [];
    this.resultState = "idle";
  }
}
