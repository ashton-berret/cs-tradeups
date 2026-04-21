<script lang="ts">
	import type { Snippet } from 'svelte';

	type Props = {
		open?: boolean;
		title?: string;
		children?: Snippet;
		footer?: Snippet;
		onclose?: () => void;
	};

	let { open = $bindable(false), title, children, footer, onclose }: Props = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape' && open) {
			close();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<button
			type="button"
			class="absolute inset-0 bg-black/70"
			aria-label="Close modal"
			onclick={close}
		></button>
		<div
			class="relative w-full max-w-lg rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface-elevated)] shadow-xl"
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? 'modal-title' : undefined}
		>
			{#if title}
				<header class="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4">
					<h2 id="modal-title" class="text-lg font-semibold text-[var(--color-text-primary)]">
						{title}
					</h2>
					<button
						type="button"
						class="rounded-md p-1 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface-overlay)] hover:text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
						aria-label="Close modal"
						onclick={close}
					>
						X
					</button>
				</header>
			{/if}

			<div class="p-6">
				{@render children?.()}
			</div>

			{#if footer}
				<footer class="flex justify-end gap-3 border-t border-[var(--color-border)] px-6 py-4">
					{@render footer()}
				</footer>
			{/if}
		</div>
	</div>
{/if}
