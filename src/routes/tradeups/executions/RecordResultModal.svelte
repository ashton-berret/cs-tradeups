<script lang="ts">
	import Modal from '$lib/components/Modal.svelte';
	import Button from '$lib/components/Button.svelte';
	import Input from '$lib/components/Input.svelte';
	import { ITEM_EXTERIORS } from '$lib/types/enums';
	import type { ExecutionRowVM } from '$lib/client/viewModels/executions';

	type Props = {
		open?: boolean;
		execution: ExecutionRowVM | null;
	};

	let { open = $bindable(false), execution }: Props = $props();
</script>

<Modal bind:open title="Record result">
	{#if execution}
		<form method="POST" action="?/recordResult" class="space-y-4">
			<input type="hidden" name="id" value={execution.id} />
			<Input name="resultMarketHashName" label="Market hash name" value={execution.resultMarketHashName ?? ''} required />
			<div class="grid grid-cols-2 gap-3">
				<Input name="resultWeaponName" label="Weapon" value={execution.resultWeaponName ?? ''} />
				<Input name="resultSkinName" label="Skin" value={execution.resultSkinName ?? ''} />
				<Input name="resultCollection" label="Collection" value={execution.resultCollection ?? ''} />
				<select name="resultExterior" value={execution.resultExterior ?? ''} class="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] px-3 py-2 text-sm">
					<option value="">Exterior</option>
					{#each ITEM_EXTERIORS as exterior}
						<option value={exterior}>{exterior.replaceAll('_', ' ')}</option>
					{/each}
				</select>
				<Input name="resultFloatValue" type="number" step="0.000001" min="0" max="1" label="Float" value={execution.resultFloatValue ?? ''} />
				<Input name="estimatedResultValue" type="number" step="0.01" min="0" label="Estimated value" value={execution.estimatedResultValue ?? ''} />
			</div>
			<div class="flex justify-end gap-2">
				<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
				<Button type="submit">Save result</Button>
			</div>
		</form>
	{/if}
</Modal>
