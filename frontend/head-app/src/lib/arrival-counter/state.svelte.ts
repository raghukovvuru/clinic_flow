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
    this.context = await getArrivalSessionContext();
  }

  async lookup(raw: string) {
    const classified = classifyInput(raw);
    if (!classified) {
      this.resultState = "error";
      this.message = "Scan a QR code, enter 6+ phone digits, or type at least 2 letters.";
      return;
    }

    this.resultState = "loading";
    const response = await lookupArrivalCandidate({ [classified.mode]: classified.value });
    this.candidates = response.candidates;

    if (!response.candidates.length) {
      this.resultState = "no-match";
      return;
    }

    if (response.candidates.length > 1) {
      this.resultState = "multiple";
      return;
    }

    this.selected = response.candidates[0];
    this.resultState = this.selected.status === "Arrived" ? "already-arrived" : "pre-confirm";
  }

  async confirmArrival() {
    if (!this.selected) return;
    const result = await markArrived(this.selected.queue_entry, this.selected.queue_session);
    this.selected = result.result_card;
    this.resultState = result.already_arrived ? "already-arrived" : "success";
    await this.refreshContext();
  }

  reset() {
    this.inputValue = "";
    this.message = "";
    this.selected = null;
    this.candidates = [];
    this.resultState = "idle";
  }
}
