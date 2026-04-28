<script lang="ts">
  import type { ArrivalSessionContext } from "$arrival/types";
  let { context = null }: { context?: ArrivalSessionContext | null } = $props();
</script>

<header class="grid gap-4 rounded-[1.5rem] border border-[#d9ddd8] bg-white/88 p-5 shadow-panel lg:grid-cols-[1.8fr_auto] lg:items-start">
  <div class="min-w-0">
    <div class="font-display text-[1.75rem] font-bold text-[#10211f]">Arrival Counter</div>
    <div class="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
      <span class="rounded-full border border-[#d9ddd8] bg-[#f1ece5] px-3 py-1.5">Active: {context?.current_session?.session_name ?? "No active session"}</span>
      <span class="rounded-full border border-[#d9ddd8] bg-white px-3 py-1.5">Next: {context?.next_session?.session_name ?? "No next session"}</span>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-2 sm:min-w-[15rem]">
    <div class="rounded-2xl border border-[#d9ddd8] bg-[#ddebe7] px-4 py-3">
      <div class="font-display text-2xl font-bold text-[#10211f]">{context?.stats.arrived ?? 0}</div>
      <div class="text-sm text-slate-600">Arrived</div>
    </div>
    <div class="rounded-2xl border border-[#d9ddd8] bg-[#f1ece5] px-4 py-3">
      <div class="font-display text-2xl font-bold text-[#10211f]">{context?.stats.awaiting_arrival ?? 0}</div>
      <div class="text-sm text-slate-600">Awaiting Arrival</div>
    </div>
  </div>
</header>
