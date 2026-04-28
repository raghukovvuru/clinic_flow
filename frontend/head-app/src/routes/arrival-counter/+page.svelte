<script lang="ts">
  import { onMount } from "svelte";
  import { getClinicFlowBoot } from "$lib/boot/boot";
  import HeaderBar from "$arrival/components/HeaderBar.svelte";
  import InputSurface from "$arrival/components/InputSurface.svelte";
  import ResultCard from "$arrival/components/ResultCard.svelte";
  import RecentArrivals from "$arrival/components/RecentArrivals.svelte";
  import StatusBanner from "$arrival/components/StatusBanner.svelte";
  import { ArrivalCounterState } from "$arrival/state.svelte";
  import { attachArrivalTransport } from "$realtime/frappe-transport";
  import { printTokenSlip } from "$arrival/print-slip";

  const boot = getClinicFlowBoot();
  const state = new ArrivalCounterState();
  let resetTimer = 0;

  async function handleSubmit(raw: string) {
    clearTimeout(resetTimer);
    await state.lookup(raw);
  }

  async function handleConfirm() {
    await state.confirmArrival();
    if (state.resultState === "success") {
      resetTimer = window.setTimeout(() => state.reset(), 5000);
    }
  }

  function handleRouteKeydown(event: KeyboardEvent) {
    if (state.isLookupPending || state.isConfirmPending) return;
    if (event.key === "Escape" && state.resultState !== "idle") {
      event.preventDefault();
      state.reset();
    } else if (state.resultState === "multiple" && event.key === "ArrowDown") {
      event.preventDefault();
      state.moveCandidateFocus(1);
    } else if (state.resultState === "multiple" && event.key === "ArrowUp") {
      event.preventDefault();
      state.moveCandidateFocus(-1);
    } else if (state.resultState === "multiple" && event.key === "Enter") {
      event.preventDefault();
      state.selectFocusedCandidate();
    } else if (state.resultState === "pre-confirm" && event.key === "Enter") {
      event.preventDefault();
      void handleConfirm();
    }
  }

  onMount(() => {
    state.requestInputFocus();
    void state.refreshContext();
    const transport = attachArrivalTransport({ mode: boot.realtime.mode, invalidate: () => state.refreshContext() });
    return () => {
      clearTimeout(resetTimer);
      transport.detach();
    };
  });
</script>

<svelte:window onkeydown={handleRouteKeydown} />

<svelte:head>
  <title>Arrival Counter</title>
</svelte:head>

<div class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
  <HeaderBar context={state.context} />
  <main class="grid gap-6">
    <InputSurface bind:value={state.inputValue} focusSignal={state.shouldFocusInput} onSubmit={handleSubmit} disabled={state.resultState === "loading"} />

    <StatusBanner state={state.resultState} message={state.message} />

    <ResultCard
      card={state.selected}
      state={state.resultState}
      candidates={state.candidates}
      focusedCandidateIndex={state.focusedCandidateIndex}
      onConfirm={handleConfirm}
      onReset={() => state.reset()}
      onPrint={() => state.selected && boot.permissions.canPrintTokenSlip && printTokenSlip(state.selected)}
      onChoose={(card) => {
        state.selected = card;
        state.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
      }}
      onMoveCandidateFocus={(delta) => state.moveCandidateFocus(delta)}
    />

    <RecentArrivals context={state.context} />
  </main>
</div>
