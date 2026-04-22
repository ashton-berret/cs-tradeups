<script lang="ts">
	import Badge from './Badge.svelte';
	import type {
		CandidateDecisionStatus,
		InventoryStatus,
		TradeupBasketStatus
	} from '$lib/types/enums';

	type Status = CandidateDecisionStatus | InventoryStatus | TradeupBasketStatus | string | null | undefined;
	type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted';

	type Props = {
		status: Status;
	};

	let { status }: Props = $props();

	const tone = $derived.by<Tone>(() => {
		switch (status) {
			case 'GOOD_BUY':
			case 'HELD':
			case 'READY':
				return 'success';
			case 'WATCHING':
			case 'RESERVED_FOR_BASKET':
			case 'BUILDING':
				return 'primary';
			case 'PASSED':
			case 'ARCHIVED':
			case 'CANCELLED':
				return 'muted';
			case 'BOUGHT':
			case 'USED_IN_CONTRACT':
			case 'EXECUTED':
				return 'warning';
			case 'DUPLICATE':
			case 'INVALID':
			case 'SOLD':
				return 'danger';
			default:
				return 'muted';
		}
	});

	const label = $derived((status ?? 'UNKNOWN').toString().replaceAll('_', ' '));
</script>

<Badge {tone}>{label}</Badge>
