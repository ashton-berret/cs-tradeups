<script lang="ts">
	type Props = {
		value?: number | null;
		currency?: string;
	};

	let { value, currency = 'USD' }: Props = $props();

	const formatted = $derived(
		value == null
			? '—'
			: new Intl.NumberFormat('en-US', {
					style: 'currency',
					currency,
					maximumFractionDigits: 2
				}).format(value)
	);
</script>

<span>{formatted}</span>
