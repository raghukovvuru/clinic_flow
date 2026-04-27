<script lang="ts">
  import type { ResultState } from "$arrival/types";

  let { state = "idle" as ResultState, message = "" }: { state?: ResultState; message?: string } = $props();
</script>

{#if state === "error" && message}
  <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
    {message}
  </div>
{/if}
