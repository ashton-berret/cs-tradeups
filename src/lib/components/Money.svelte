<script lang="ts">
	type Props = {
		value?: number | null;
		currency?: string;
	};

	let { value, currency = 'USD' }: Props = $props();

	const formatted = $derived(value == null ? '—' : formatMoney(value, currency));

	function formatMoney(value: number, currency: string): string {
		const normalized = currency.trim().toUpperCase();

		if (!/^[A-Z]{3}$/.test(normalized)) {
			return formatUsd(value);
		}

		try {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: normalized,
				maximumFractionDigits: 2
			}).format(value);
		} catch {
			return formatUsd(value);
		}
	}

	function formatUsd(value: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			maximumFractionDigits: 2
		}).format(value);
	}
</script>

<span>{formatted}</span>
