<script lang="ts">
  import type { ArrivalSessionContext } from "$arrival/types";
  let { context = null }: { context?: ArrivalSessionContext | null } = $props();
</script>

<header class="grid gap-4 rounded-[1.5rem] border border-[#d9ddd8] bg-white/90 p-6 shadow-panel lg:grid-cols-[1.6fr_1fr]">
  <div>
    <div class="font-display text-3xl font-bold text-[#10211f]">Arrival Counter</div>
    <div class="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
      <span class="rounded-full bg-[#f1ece5] px-3 py-1">Active: {context?.current_session?.session_name ?? "No active session"}</span>
      <span class="rounded-full bg-white px-3 py-1 border border-[#d9ddd8]">Next: {context?.next_session?.session_name ?? "No next session"}</span>
    </div>
  </div>

  <div class="grid grid-cols-2 gap-3">
    <div class="rounded-2xl bg-[#dcebe6] p-4">
      <div class="font-display text-3xl font-bold text-[#10211f]">{context?.stats.arrived ?? 0}</div>
      <div class="text-sm text-slate-600">Arrived</div>
    </div>
    <div class="rounded-2xl bg-[#f1ece5] p-4">
      <div class="font-display text-3xl font-bold text-[#10211f]">{context?.stats.awaiting_arrival ?? 0}</div>
      <div class="text-sm text-slate-600">Awaiting Arrival</div>
    </div>
  </div>
</header>
