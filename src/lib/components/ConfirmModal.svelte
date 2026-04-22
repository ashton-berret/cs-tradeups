<script lang="ts">
	import Modal from './Modal.svelte';
	import Button from './Button.svelte';

	type Props = {
		open?: boolean;
		title: string;
		message: string;
		action: string;
		fields?: Record<string, string | number | boolean | null | undefined>;
		confirmLabel?: string;
		onclose?: () => void;
	};

	let {
		open = $bindable(false),
		title,
		message,
		action,
		fields = {},
		confirmLabel = 'Confirm',
		onclose
	}: Props = $props();
</script>

<Modal bind:open {title} {onclose}>
	<p class="text-sm text-[var(--color-text-secondary)]">{message}</p>

	{#snippet footer()}
		<Button variant="secondary" onclick={() => (open = false)}>Cancel</Button>
		<form method="POST" {action}>
			{#each Object.entries(fields) as [name, value]}
				{#if value != null}
					<input type="hidden" {name} value={String(value)} />
				{/if}
			{/each}
			<Button type="submit" variant="danger">{confirmLabel}</Button>
		</form>
	{/snippet}
</Modal>
