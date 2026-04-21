<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	type Props = Omit<HTMLInputAttributes, 'value'> & {
		label?: string;
		error?: string;
		value?: string | number;
	};

	let {
		label,
		error,
		id,
		type = 'text',
		value = $bindable(''),
		class: className = '',
		...rest
	}: Props = $props();
</script>

<div class={className}>
	{#if label}
		<label for={id} class="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]">
			{label}
		</label>
	{/if}

	<input
		{id}
		{type}
		bind:value
		aria-invalid={error ? 'true' : undefined}
		aria-describedby={error && id ? `${id}-error` : undefined}
		class={[
			'w-full rounded-md border bg-[var(--color-bg-surface-overlay)] px-4 py-2 text-sm text-[var(--color-text-primary)] transition-colors placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-offset-0',
			error
				? 'border-[var(--color-danger)] focus:border-[var(--color-danger)] focus:ring-[var(--color-danger)]/20'
				: 'border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-[var(--color-primary)]/20'
		].join(' ')}
		{...rest}
	/>

	{#if error}
		<p id={id ? `${id}-error` : undefined} class="mt-2 text-sm text-[var(--color-danger)]">
			{error}
		</p>
	{/if}
</div>
