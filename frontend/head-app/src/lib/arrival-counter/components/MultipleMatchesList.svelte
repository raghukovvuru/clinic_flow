<script lang="ts">
  import type { ArrivalCardRecord } from "$arrival/types";

  let { candidates = [] as ArrivalCardRecord[], onChoose = (_: ArrivalCardRecord) => {} }: {
    candidates?: ArrivalCardRecord[];
    onChoose?: (card: ArrivalCardRecord) => void;
  } = $props();
</script>

<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white p-4 shadow-panel">
  <div class="mb-3 font-display text-lg font-semibold text-[#10211f]">Select patient</div>
  <div class="space-y-3">
    {#each candidates as candidate (candidate.queue_entry)}
      <button class="flex w-full items-center justify-between rounded-2xl border border-[#d9ddd8] px-4 py-3 text-left hover:border-[#0d6f69]" onclick={() => onChoose(candidate)}>
        <div>
          <div class="font-display font-semibold text-[#10211f]">{candidate.display_token}</div>
          <div class="text-sm text-slate-600">{candidate.patient_name}</div>
        </div>
        <div class="text-sm text-slate-500">{candidate.visit_label}</div>
      </button>
    {/each}
  </div>
</section>
