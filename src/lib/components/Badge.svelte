<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'muted' | 'rarity';

	type Props = HTMLAttributes<HTMLSpanElement> & {
		tone?: Tone;
		color?: string;
		children?: Snippet;
	};

	let { tone = 'muted', color, class: className = '', children, ...rest }: Props = $props();

	const tones: Record<Tone, string> = {
		primary: 'border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 text-[var(--color-primary)]',
		success: 'border-[var(--color-success)]/40 bg-[var(--color-success)]/10 text-[var(--color-success)]',
		warning: 'border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
		danger: 'border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
		muted: 'border-[var(--color-border)] bg-[var(--color-bg-surface-overlay)] text-[var(--color-text-secondary)]',
		rarity: 'border-current bg-[color-mix(in_srgb,currentColor_12%,transparent)]'
	};
</script>

<span
	class={[
		'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
		tones[tone],
		className
	].join(' ')}
	style:color={color}
	{...rest}
>
	{@render children?.()}
</span>
