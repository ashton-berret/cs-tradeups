<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { BasketDTO } from '$lib/types/services';

	type Props = {
		open?: boolean;
		readyBaskets: BasketDTO[];
	};

	let { open = $bindable(false), readyBaskets }: Props = $props();
	const now = new Date().toISOString().slice(0, 16);
</script>

<Modal bind:open title="Record execution">
	<form method="POST" action="?/create" class="space-y-4">
		<select name="basketId" required class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
			<option value="">Choose READY basket</option>
			{#each readyBaskets as basket}
				<option value={basket.id}>{basket.name ?? basket.id} · {basket.itemCount}/10</option>
			{/each}
		</select>
		<Input name="executedAt" type="datetime-local" label="Executed at" value={now} required />
		<textarea name="notes" rows="3" placeholder="Notes" class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"></textarea>
		<div class="flex justify-end gap-2">
			<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
			<Button type="submit" disabled={readyBaskets.length === 0}>Record</Button>
		</div>
	</form>
</Modal>
