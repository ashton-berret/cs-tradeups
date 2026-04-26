<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { theme } from '$lib/stores/theme.svelte';
	import { onMount } from 'svelte';
	import '../app.css';

	let { children } = $props();

	const navItems = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/candidates', label: 'Candidates' },
		{ href: '/inventory', label: 'Inventory' },
		{ href: '/tradeups/plans', label: 'Plans' },
		{ href: '/tradeups/baskets', label: 'Baskets' },
		{ href: '/tradeups/executions', label: 'Executions' },
		{ href: '/buy-queue', label: 'Buy Queue' },
		{ href: '/calculator', label: 'Calculator' },
		{ href: '/market-prices', label: 'Market Prices' }
	];

	onMount(() => {
		theme.initialize();
	});

	function isActive(href: string) {
		const pathname = page.url.pathname;
		return pathname === href || pathname.startsWith(`${href}/`);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen bg-[var(--color-bg-base)] text-[var(--color-text-primary)]">
	<aside
		class="fixed left-0 top-0 z-40 flex h-screen w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-bg-surface)]"
	>
		<div class="flex h-16 items-center border-b border-[var(--color-border)] px-6">
			<a href="/dashboard" class="text-lg font-semibold text-[var(--color-text-primary)]">
				CS Tradeups
			</a>
		</div>

		<nav class="flex-1 space-y-1 px-3 py-4" aria-label="Primary navigation">
			{#each navItems as item}
				<a
					href={item.href}
					aria-current={isActive(item.href) ? 'page' : undefined}
					class={[
						'flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
						isActive(item.href)
							? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] shadow-[0_0_10px_var(--color-primary-glow)]'
							: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-overlay)] hover:text-[var(--color-text-primary)]'
					].join(' ')}
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="border-t border-[var(--color-border)] p-4">
			<div class="flex items-center justify-between gap-3">
				<span class="text-sm font-medium text-[var(--color-text-secondary)]">Theme</span>
				<button
					type="button"
					class="relative h-6 w-12 rounded-full bg-[var(--color-border)] transition-colors data-[active=true]:bg-[var(--color-primary)]"
					data-active={theme.current === 'light'}
					aria-label="Toggle theme"
					aria-pressed={theme.current === 'light'}
					onclick={() => theme.toggle()}
				>
					<span
						class={[
							'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--color-text-primary)] transition-transform',
							theme.current === 'light' ? 'translate-x-6 bg-[#0E100F]' : ''
						].join(' ')}
					></span>
				</button>
			</div>
		</div>
	</aside>

	<main class="ml-64 min-h-screen bg-[var(--color-bg-base)] p-8">
		{@render children()}
	</main>
</div>
