<script lang="ts">
  import { onMount } from "svelte";
  import HeaderBar from "$arrival/components/HeaderBar.svelte";
  import InputSurface from "$arrival/components/InputSurface.svelte";
  import ResultCard from "$arrival/components/ResultCard.svelte";
  import MultipleMatchesList from "$arrival/components/MultipleMatchesList.svelte";
  import RecentArrivals from "$arrival/components/RecentArrivals.svelte";
  import StatusBanner from "$arrival/components/StatusBanner.svelte";
  import { ArrivalCounterState } from "$arrival/state.svelte";
  import { attachArrivalTransport } from "$realtime/frappe-transport";
  import { printTokenSlip } from "$arrival/print-slip";

  const state = new ArrivalCounterState();
  let resetTimer = 0;

  async function handleSubmit(raw: string) {
    clearTimeout(resetTimer);
    state.inputValue = raw;
    await state.lookup(raw);
  }

  async function handleConfirm() {
    await state.confirmArrival();
    if (state.resultState === "success") {
      resetTimer = window.setTimeout(() => state.reset(), 3500);
    }
  }

  onMount(() => {
    state.refreshContext();
    const detach = attachArrivalTransport(() => state.refreshContext(), (window as any).frappe?.realtime);
    return () => {
      clearTimeout(resetTimer);
      detach();
    };
  });
</script>

<svelte:head>
  <title>Arrival Counter</title>
</svelte:head>

<div class="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-6 py-8 lg:px-10">
  <HeaderBar context={state.context} />
  <main class="grid gap-6">
    <InputSurface bind:value={state.inputValue} onSubmit={handleSubmit} disabled={state.resultState === "loading"} />

    <StatusBanner state={state.resultState} message={state.message} />

    {#if state.resultState === "multiple"}
      <MultipleMatchesList
        candidates={state.candidates}
        onChoose={(card) => {
          state.selected = card;
          state.resultState = card.status === "Arrived" ? "already-arrived" : "pre-confirm";
        }}
      />
    {/if}

    <ResultCard
      card={state.selected}
      state={state.resultState}
      onConfirm={handleConfirm}
      onReset={() => state.reset()}
      onPrint={() => state.selected && printTokenSlip(state.selected)}
    />

    <RecentArrivals context={state.context} />
  </main>
</div>
