<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
	type Size = 'sm' | 'md' | 'lg';

	type Props = HTMLButtonAttributes & {
		variant?: Variant;
		size?: Size;
		children?: Snippet;
	};

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const base =
		'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)] focus:ring-offset-2 focus:ring-offset-[var(--color-bg-base)] disabled:cursor-not-allowed disabled:opacity-50';

	const variants: Record<Variant, string> = {
		primary:
			'btn-glow bg-[var(--color-primary)] text-[#0E100F] hover:bg-[var(--color-primary-hover)]',
		secondary:
			'border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface-overlay)] hover:border-[var(--color-border-hover)]',
		danger: 'bg-[var(--color-danger)] text-white hover:opacity-90',
		ghost:
			'bg-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-overlay)] hover:text-[var(--color-text-primary)]'
	};

	const sizes: Record<Size, string> = {
		sm: 'px-3 py-1.5 text-sm',
		md: 'px-4 py-2 text-sm',
		lg: 'px-6 py-3 text-base'
	};
</script>

<button class={[base, variants[variant], sizes[size], className].join(' ')} {type} {...rest}>
	{@render children?.()}
</button>
