<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Padding = 'none' | 'sm' | 'md' | 'lg';

	type Props = HTMLAttributes<HTMLDivElement> & {
		padding?: Padding;
		glow?: boolean;
		children?: Snippet;
	};

	let { padding = 'md', glow = false, class: className = '', children, ...rest }: Props = $props();

	const paddingClasses: Record<Padding, string> = {
		none: '',
		sm: 'p-4',
		md: 'p-6',
		lg: 'p-8'
	};
</script>

<div
	class={[
		'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] shadow transition-colors',
		paddingClasses[padding],
		glow ? 'card-glow' : '',
		className
	].join(' ')}
	{...rest}
>
	{@render children?.()}
</div>
