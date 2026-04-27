import ArrivalCounterPage from "../routes/arrival-counter/+page.svelte";

export function mount({ target }: { target: HTMLElement }) {
  return new ArrivalCounterPage({ target });
}

declare global {
  interface Window {
    clinicFlowArrivalCounterV1?: { mount: typeof mount };
  }
}

window.clinicFlowArrivalCounterV1 = { mount };
