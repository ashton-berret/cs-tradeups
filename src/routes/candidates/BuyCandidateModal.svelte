<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import type { CandidateRowVM } from '$lib/client/viewModels/candidates';

	type Props = {
		open?: boolean;
		candidate: CandidateRowVM | null;
	};

	let { open = $bindable(false), candidate }: Props = $props();
	const today = new Date().toISOString().slice(0, 10);
</script>

<Modal bind:open title="Mark candidate bought">
	{#if candidate}
		<form method="POST" action="?/buy" class="space-y-4">
			<input type="hidden" name="id" value={candidate.id} />
			<p class="text-sm text-[var(--color-text-secondary)]">{candidate.marketHashName}</p>
			<Input
				id="purchasePrice"
				name="purchasePrice"
				type="number"
				step="0.01"
				min="0"
				label="Purchase price"
				value={candidate.listPrice}
				required
			/>
			<Input id="purchaseFees" name="purchaseFees" type="number" step="0.01" min="0" label="Fees" />
			<Input id="purchaseDate" name="purchaseDate" type="date" label="Purchase date" value={today} />
			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Convert to inventory</Button>
			</div>
		</form>
	{/if}
</Modal>
