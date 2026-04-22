<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { ExecutionRowVM } from '$lib/client/viewModels/executions';

	type Props = {
		open?: boolean;
		execution: ExecutionRowVM | null;
	};

	let { open = $bindable(false), execution }: Props = $props();
	const today = new Date().toISOString().slice(0, 10);
</script>

<Modal bind:open title="Record sale">
	{#if execution}
		<form method="POST" action="?/recordSale" class="space-y-4">
			<input type="hidden" name="id" value={execution.id} />
			<p class="text-sm text-[var(--color-text-secondary)]">{execution.resultMarketHashName}</p>
			<Input name="salePrice" type="number" step="0.01" min="0" label="Sale price" value={execution.salePrice ?? ''} required />
			<Input name="saleFees" type="number" step="0.01" min="0" label="Fees" value={execution.saleFees ?? ''} />
			<Input name="saleDate" type="date" label="Sale date" value={execution.saleDate ? new Date(execution.saleDate).toISOString().slice(0, 10) : today} required />
			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save sale</Button>
			</div>
		</form>
	{/if}
</Modal>
