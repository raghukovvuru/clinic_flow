<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount } from "svelte";
  import { getClinicFlowBoot } from "$lib/boot/boot";
  import type { ArrivalCardRecord, ArrivalCounterBoot } from "$arrival/types";
  import HeaderBar from "$arrival/components/HeaderBar.svelte";
  import InputSurface from "$arrival/components/InputSurface.svelte";
  import ResultCard from "$arrival/components/ResultCard.svelte";
  import RecentArrivals from "$arrival/components/RecentArrivals.svelte";
  import StatusBanner from "$arrival/components/StatusBanner.svelte";
  import { ArrivalCounterState } from "$arrival/state.svelte";
  import { attachArrivalTransport } from "$realtime/frappe-transport";
  import { printTokenSlip } from "$arrival/print-slip";

  let boot: ArrivalCounterBoot | null = null;
  const pageState = new ArrivalCounterState();
  let resetTimer = 0;

  if (browser) {
    boot = getClinicFlowBoot();
  }

  async function handleSubmit(raw: string) {
    clearTimeout(resetTimer);
    await pageState.lookup(raw);
  }

  async function handleConfirm() {
    await pageState.confirmArrival();
    if (pageState.resultState === "success") {
      resetTimer = window.setTimeout(() => pageState.reset(), 5000);
    }
  }

  function handleRouteKeydown(event: KeyboardEvent) {
    if (pageState.isLookupPending || pageState.isConfirmPending) return;
    if (event.key === "Escape" && pageState.resultState !== "idle") {
      event.preventDefault();
      pageState.reset();
    } else if (pageState.resultState === "multiple" && event.key === "ArrowDown") {
      event.preventDefault();
      pageState.moveCandidateFocus(1);
    } else if (pageState.resultState === "multiple" && event.key === "ArrowUp") {
      event.preventDefault();
      pageState.moveCandidateFocus(-1);
    } else if (pageState.resultState === "multiple" && event.key === "Enter") {
      event.preventDefault();
      pageState.selectFocusedCandidate();
    } else if (pageState.resultState === "pre-confirm" && event.key === "Enter") {
      event.preventDefault();
      void handleConfirm();
    }
  }

  const handleChoose = (card: ArrivalCardRecord) => {
    pageState.selected = card;
    pageState.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
  };

  const handleMoveFocus = (delta: number) => {
    pageState.moveCandidateFocus(delta);
  };

  onMount(() => {
    if (!boot) boot = getClinicFlowBoot();
    pageState.requestInputFocus();
    void pageState.refreshContext();
    const transport = attachArrivalTransport({ mode: boot.realtime.mode, invalidate: () => pageState.refreshContext() });
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
  <HeaderBar context={pageState.context} />
  <main class="grid gap-6">
    <InputSurface bind:value={pageState.inputValue} focusSignal={pageState.shouldFocusInput} onSubmit={handleSubmit} disabled={pageState.resultState === "loading"} />

    <StatusBanner message={pageState.message} />

    <ResultCard
      card={pageState.selected}
      state={pageState.resultState}
      candidates={pageState.candidates}
      focusedCandidateIndex={pageState.focusedCandidateIndex}
      onConfirm={handleConfirm}
      onReset={() => pageState.reset()}
      onPrint={() => pageState.selected && boot?.permissions.canPrintTokenSlip && printTokenSlip(pageState.selected)}
      onChoose={handleChoose}
      onMoveCandidateFocus={handleMoveFocus}
    />

    <RecentArrivals context={pageState.context} />
  </main>
</div>
