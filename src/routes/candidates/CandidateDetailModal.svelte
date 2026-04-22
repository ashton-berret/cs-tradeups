<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Money from '$lib/components/Money.svelte';
	import FloatValue from '$lib/components/FloatValue.svelte';
	import type { CandidateRowVM } from '$lib/client/viewModels/candidates';
	const editableStatuses = ['WATCHING', 'GOOD_BUY', 'PASSED'] as const;

	type Props = {
		open?: boolean;
		candidate: CandidateRowVM | null;
	};

	let { open = $bindable(false), candidate }: Props = $props();
</script>

<Modal bind:open title="Candidate details">
	{#if candidate}
		<div class="space-y-4 text-sm">
			<div>
				<h3 class="font-semibold text-[var(--color-text-primary)]">{candidate.marketHashName}</h3>
				<p class="mt-1 text-[var(--color-text-secondary)]">
					{candidate.collection ?? 'No collection'} · <FloatValue value={candidate.floatValue} /> ·
					<Money value={candidate.listPrice} currency={candidate.currency} />
				</p>
			</div>
			<form method="POST" action="?/setStatus" class="space-y-3">
				<input type="hidden" name="id" value={candidate.id} />
				<label class="block text-sm font-medium text-[var(--color-text-secondary)]" for="detail-status">
					Status
				</label>
				<select
					id="detail-status"
					name="status"
					value={candidate.status}
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>
					{#each editableStatuses as status}
						<option value={status}>{status.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<label class="block text-sm font-medium text-[var(--color-text-secondary)]" for="detail-notes">
					Notes
				</label>
				<textarea
					id="detail-notes"
					name="notes"
					rows="4"
					class="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm"
				>{candidate.notes ?? ''}</textarea>
				<div class="flex justify-end gap-2">
					<Button variant="secondary" onclick={() => (open = false)}>Close</Button>
					<Button type="submit">Save</Button>
				</div>
			</form>
		</div>
	{/if}
</Modal>
