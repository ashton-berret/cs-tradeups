<script lang="ts">
	import { RARITY_COLORS, type ItemRarity } from '$lib/types/enums';

	type Size = 'sm' | 'md';

	type Props = {
		rarity: ItemRarity;
		size?: Size;
		title?: string;
	};

	let { rarity, size = 'sm', title }: Props = $props();

	const dimension = $derived(size === 'md' ? 'h-2.5 w-2.5' : 'h-2 w-2');
	const color = $derived(RARITY_COLORS[rarity]);
</script>

<span
	class={`inline-block shrink-0 rounded-full ring-1 ring-black/20 ${dimension}`}
	style:background-color={color}
	style:box-shadow={`0 0 6px ${color}66`}
	title={title ?? rarity.replaceAll('_', ' ')}
	aria-hidden="true"
></span>
