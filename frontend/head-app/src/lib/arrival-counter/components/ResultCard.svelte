<script lang="ts">
  import type { ArrivalCardRecord, ResultState } from "$arrival/types";

  let { card = null, state = "idle", onConfirm = () => {}, onReset = () => {}, onPrint = () => {} }: {
    card?: ArrivalCardRecord | null;
    state?: ResultState;
    onConfirm?: () => void;
    onReset?: () => void;
    onPrint?: () => void;
  } = $props();
</script>

<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white p-6 shadow-panel min-h-[20rem]">
  {#if state === "idle"}
    <div class="flex h-full items-center justify-center text-slate-500">Scan a token slip or search for a patient to begin.</div>
  {:else if state === "loading"}
    <div class="flex h-full items-center justify-center gap-3 text-slate-500">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d6f69]"></div>
      <span>Looking up patient…</span>
    </div>
  {:else if state === "no-match"}
    <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div class="text-lg font-semibold text-slate-600">No match found</div>
      <div class="text-sm text-slate-500">Check the barcode or try searching by phone or name.</div>
      <button class="rounded-xl border border-[#d9ddd8] px-4 py-2 text-sm text-slate-600" onclick={onReset}>Start over</button>
    </div>
  {:else if state === "error"}
    <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div class="text-lg font-semibold text-slate-600">Something went wrong</div>
      <div class="text-sm text-slate-500">{card?.queue_entry ?? "Please try again."}</div>
      <button class="rounded-xl border border-[#d9ddd8] px-4 py-2 text-sm text-slate-600" onclick={onReset}>Try again</button>
    </div>
  {:else if card}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">{card.state_label}</div>
        <div class="mt-3 font-display text-6xl font-extrabold text-[#10211f]">{card.display_token}</div>
        <div class="mt-4 text-3xl font-semibold text-[#10211f]">{card.patient_name}</div>
        <div class="mt-3 text-base text-slate-600">{card.visit_label}</div>
      </div>

      <div class="flex flex-wrap gap-3">
        {#if state === "pre-confirm"}
          <button class="rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white" onclick={onConfirm}>Confirm Arrival</button>
          <button class="rounded-2xl px-5 py-3 text-slate-600" onclick={onReset}>Not this patient</button>
        {:else if state === "success"}
          <div class="flex flex-wrap gap-3">
            <button class="rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white" onclick={onPrint}>Print Token Slip</button>
            <button class="rounded-2xl px-5 py-3 text-slate-600" onclick={onReset}>Next patient</button>
          </div>
        {:else if state === "already-arrived"}
          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl bg-mint px-5 py-3 font-semibold text-[#10211f]">Already checked in</div>
            <button class="rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white" onclick={onPrint}>Print Token Slip</button>
            <button class="rounded-2xl px-5 py-3 text-slate-600" onclick={onReset}>Next patient</button>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</section>
