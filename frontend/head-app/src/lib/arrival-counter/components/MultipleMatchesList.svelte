<script lang="ts">
  import { tick } from "svelte";
  import type { ArrivalCardRecord } from "$arrival/types";

  let {
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveFocus = (_: number) => {},
  } = $props();

  let rowButtons: HTMLButtonElement[] = [];

  $effect(() => {
    focusedCandidateIndex;
    tick().then(() => {
      const button = rowButtons[focusedCandidateIndex];
      button?.focus();
      button?.scrollIntoView({ block: "nearest" });
    });
  });

  function handleKeydown(event: KeyboardEvent, candidate: ArrivalCardRecord) {
    if (event.key === "Enter") {
      event.preventDefault();
      onChoose(candidate);
    }
  }
</script>

<div class="flex h-full flex-col justify-between gap-6">
  <div>
    <div class="font-display text-lg font-semibold text-[#10211f]">Select patient</div>
    <div class="text-sm text-slate-500">Use arrow keys, then Enter.</div>
  </div>
  <div class="space-y-3">
    {#each candidates as candidate, index (candidate.queue_entry)}
      <button
        bind:this={rowButtons[index]}
        class="flex w-full cursor-pointer items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
        class:border-[#0d6f69]={index === focusedCandidateIndex}
        class:border-[#d9ddd8]={index !== focusedCandidateIndex}
        aria-label={`Select ${candidate.display_token} ${candidate.patient_name}`}
        tabindex={index === focusedCandidateIndex ? 0 : -1}
        onkeydown={(event) => handleKeydown(event, candidate)}
        onclick={() => onChoose(candidate)}>
        <div class="min-w-0">
          <div class="font-display font-semibold text-[#10211f]">{candidate.display_token}</div>
          <div class="truncate text-sm text-slate-700" title={candidate.patient_name}>{candidate.patient_name}</div>
          <div class="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
            <span>{candidate.queue_session}</span>
            <span>{candidate.visit_label}</span>
            <span>{candidate.status}</span>
          </div>
        </div>
      </button>
    {/each}
  </div>
</div>
