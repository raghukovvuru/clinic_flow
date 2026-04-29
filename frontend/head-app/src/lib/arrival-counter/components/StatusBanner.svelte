<script lang="ts">
  let { message = "", tone = "warning" }: { message?: string; tone?: "warning" | "status" } = $props();
</script>

{#if message}
  <div
    class="rounded-xl border px-4 py-3 text-sm"
    class:border-[#eadfca]={tone === "warning"}
    class:bg-[#f8f4ec]={tone === "warning"}
    class:text-[#6e5a3c]={tone === "warning"}
    class:border-[#d9ddd8]={tone === "status"}
    class:bg-white={tone === "status"}
    class:text-slate-500={tone === "status"}
    role={tone === "warning" ? "alert" : "status"}>
    {message}
  </div>
{/if}
