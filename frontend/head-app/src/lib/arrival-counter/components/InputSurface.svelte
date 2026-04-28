<script lang="ts">
  import { tick } from "svelte";

  let { value = $bindable(), disabled = false, focusSignal = 0, onSubmit }: { value?: string; disabled?: boolean; focusSignal?: number; onSubmit: (raw: string) => void } = $props();
  let inputEl: HTMLInputElement;

  $effect(() => {
    focusSignal;
    tick().then(() => inputEl?.focus());
  });

  function submit() {
    if (value) onSubmit(value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") submit();
  }
</script>

<section class="rounded-[1.5rem] border border-[#d9ddd8] bg-white/92 p-6 shadow-panel">
  <label for="arrival-scan-input" class="mb-3 block font-display text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Scan or Search</label>
  <div class="flex items-center gap-3 rounded-[1.25rem] border border-[#d9ddd8] bg-[#f6f5f1] px-5 py-4 focus-within:border-[#0d6f69] focus-within:ring-2 focus-within:ring-[#0d6f69]/20">
    <input
      id="arrival-scan-input"
      bind:this={inputEl}
      bind:value
      class="w-full border-0 bg-transparent p-0 text-xl text-[#10211f] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2"
      placeholder="Scan barcode or enter patient ID"
      {disabled}
      onkeydown={handleKeydown}
    />
    <button class="rounded-xl bg-[#0d6f69] px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#0d6f69] focus:ring-offset-2" onclick={submit} {disabled}>Go</button>
  </div>
</section>
