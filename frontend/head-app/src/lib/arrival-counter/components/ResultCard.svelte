<script lang="ts">
  import MultipleMatchesList from "$arrival/components/MultipleMatchesList.svelte";
  import type { ArrivalCardRecord, ResultState } from "$arrival/types";

  let {
    card = null,
    state = "idle",
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    canConfirm = true,
    canPrint = true,
    onConfirm = () => {},
    onReset = () => {},
    onPrint = () => {},
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveCandidateFocus = (_: number) => {},
  } = $props();
</script>

<section data-testid="arrival-result-card" class="min-h-[21rem] rounded-[1.5rem] border border-[#d9ddd8] bg-white p-6 shadow-panel lg:p-7">
  {#if state === "idle"}
    <div class="flex h-full items-center justify-center text-center text-slate-500">Scan a QR code or search for a patient to begin.</div>
  {:else if state === "loading"}
    <div class="flex h-full items-center justify-center gap-3 text-slate-500">
      <div class="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-[#0d6f69]"></div>
      <span>Looking up patient...</span>
    </div>
  {:else if state === "no-match"}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">No match</div>
        <div class="mt-4 text-2xl font-semibold text-[#10211f]">No patient found</div>
        <div class="mt-3 text-base text-slate-600">Check the QR code, patient name, child name, or mobile number and try again.</div>
      </div>
      <div class="flex flex-wrap gap-3">
        <button class="cursor-pointer rounded-2xl border border-[#d9ddd8] px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Start over</button>
      </div>
    </div>
  {:else if state === "multiple"}
    <MultipleMatchesList {candidates} {focusedCandidateIndex} onChoose={onChoose} onMoveFocus={onMoveCandidateFocus} />
  {:else if card}
    <div class="flex h-full flex-col justify-between gap-6">
      <div>
        <div class="text-sm uppercase tracking-[0.18em] text-slate-500">{card.state_label}</div>
        <div class="mt-3 font-display text-[3.75rem] font-extrabold leading-none text-[#10211f]">{card.display_token}</div>
        <div class="mt-4 text-[2rem] font-semibold leading-tight text-[#10211f]">{card.patient_name}</div>
        <div class="mt-3 text-base text-slate-600">{card.visit_label}</div>
      </div>
      <div class="flex flex-wrap gap-3">
        {#if state === "pre-confirm"}
          {#if canConfirm}
            <button class="cursor-pointer rounded-2xl bg-[#0d6f69] px-5 py-3 font-semibold text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onConfirm()}>Confirm Arrival</button>
          {/if}
          <button class="cursor-pointer rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Not this patient</button>
        {:else}
          {#if state === "already-arrived"}
            <div class="rounded-2xl bg-[#ddebe7] px-5 py-3 font-semibold text-[#10211f]">Already checked in</div>
          {/if}
          {#if canPrint}
            <button class="cursor-pointer rounded-2xl border border-[#d9ddd8] bg-white px-5 py-3 font-semibold text-[#10211f] focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onPrint()}>Print Token Slip</button>
          {/if}
          <button class="cursor-pointer rounded-2xl px-5 py-3 text-slate-600 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={() => onReset()}>Next patient</button>
        {/if}
      </div>
    </div>
  {/if}
</section>
