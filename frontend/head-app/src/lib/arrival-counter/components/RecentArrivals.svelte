<script lang="ts">
  import type { ArrivalSessionContext } from "$arrival/types";
  let { context = null as ArrivalSessionContext | null }: { context?: ArrivalSessionContext | null } = $props();
</script>

<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white/78 p-5">
  <div class="mb-4 font-display text-lg font-semibold text-[#10211f]">Recent Arrivals</div>

  {#if !context?.recent_arrivals.length}
    <p class="text-sm text-slate-500">No arrivals captured yet for the current session.</p>
  {:else}
    <div class="space-y-2.5">
      {#each context.recent_arrivals as row (row.queue_entry)}
        <div class="flex items-center justify-between rounded-2xl border border-[#e4e7e3] bg-[#f6f5f1] px-4 py-3">
          <div class="min-w-0">
            <div class="font-display text-base font-semibold text-[#10211f]">{row.display_token}</div>
            <div class="truncate text-sm text-slate-600" title={row.patient_name}>{row.patient_name}</div>
          </div>
          <div class="ml-4 text-right text-sm text-slate-500">
            <div>{row.status}</div>
            <div>{row.arrived_at}</div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</section>
