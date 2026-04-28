<script lang="ts">
  import type { ArrivalCardRecord } from "$arrival/types";

  let {
    candidates = [] as ArrivalCardRecord[],
    focusedCandidateIndex = 0,
    onChoose = (_: ArrivalCardRecord) => {},
    onMoveFocus = (_: number) => {},
  } = $props();

  function handleKeydown(event: KeyboardEvent, candidate: ArrivalCardRecord) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveFocus(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveFocus(-1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      onChoose(candidate);
    }
  }
</script>

<div class="flex h-full flex-col gap-4">
  <div>
    <div class="font-display text-lg font-semibold text-[#10211f]">Select patient</div>
    <div class="text-sm text-slate-500">Use arrow keys, then Enter.</div>
  </div>
  <div class="space-y-3">
    {#each candidates as candidate, index (candidate.queue_entry)}
      <button
        class="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
        class:border-[#0d6f69]={index === focusedCandidateIndex}
        class:border-[#d9ddd8]={index !== focusedCandidateIndex}
        aria-label={`Select ${candidate.display_token} ${candidate.patient_name}`}
        tabindex={index === focusedCandidateIndex ? 0 : -1}
        onkeydown={(event) => handleKeydown(event, candidate)}
        onclick={() => onChoose(candidate)}
      >
        <div>
          <div class="font-display font-semibold text-[#10211f]">{candidate.display_token}</div>
          <div class="text-sm text-slate-600">{candidate.patient_name}</div>
        </div>
        <div class="text-sm text-slate-500">{candidate.visit_label}</div>
      </button>
    {/each}
  </div>
</div>
