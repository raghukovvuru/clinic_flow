<script lang="ts">
  let { message = "" }: { message?: string } = $props();
</script>

{#if message}
  <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
    {message}
  </div>
{/if}
