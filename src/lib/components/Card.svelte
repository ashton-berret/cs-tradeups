<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Padding = 'none' | 'sm' | 'md' | 'lg';

	type Props = HTMLAttributes<HTMLDivElement> & {
		padding?: Padding;
		glow?: boolean;
		/** Accent variant — tinted surface + faint primary edge. Use sparingly
		 *  for the page's focal cards so the layout has a focal point instead
		 *  of reading as a uniform stack. */
		accent?: boolean;
		children?: Snippet;
	};

	let {
		padding = 'md',
		glow = false,
		accent = false,
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const paddingClasses: Record<Padding, string> = {
		none: '',
		sm: 'p-4',
		md: 'p-6',
		lg: 'p-8'
	};
</script>

<div
	class={[
		'rounded-xl border shadow-sm transition-all duration-200',
		accent
			? 'card-accent'
			: 'border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)]',
		paddingClasses[padding],
		glow ? 'card-glow' : '',
		className
	].join(' ')}
	{...rest}
>
	{@render children?.()}
</div>
