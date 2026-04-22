<script lang="ts">
	type Props = {
		value?: number | null;
	};

	let { value }: Props = $props();
	const formatted = $derived(value == null ? '—' : `${value.toFixed(2)}%`);
</script>

<span class={value == null ? '' : value >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}>
	{formatted}
</span>
