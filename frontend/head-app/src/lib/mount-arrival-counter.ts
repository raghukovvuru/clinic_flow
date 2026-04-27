import ArrivalCounterPage from "../routes/arrival-counter/+page.svelte";

export function mount({ target, props = {} }: { target: HTMLElement; props?: Record<string, unknown> }) {
  return new ArrivalCounterPage({ target, props: props as any });
}

declare global {
  interface Window {
    clinicFlowArrivalCounterV1?: { mount: typeof mount };
  }
}

window.clinicFlowArrivalCounterV1 = { mount };
