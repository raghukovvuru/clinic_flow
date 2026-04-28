<script lang="ts">
  let { message = "" }: { message?: string } = $props();
</script>

{#if message}
  <div class="rounded-xl border border-[#eadfca] bg-[#f8f4ec] px-4 py-3 text-sm text-[#6e5a3c]" role="alert">
    {message}
  </div>
{/if}
