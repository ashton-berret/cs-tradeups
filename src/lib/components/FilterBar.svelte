<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';
	import Card from './Card.svelte';

	type Props = {
		resetHref: string;
		children?: Snippet;
	};

	let { resetHref, children }: Props = $props();
</script>

<Card padding="sm">
	<form method="GET" class="flex flex-wrap items-end gap-3">
		{@render children?.()}
		<Button type="submit" variant="secondary" size="sm">Apply</Button>
		<a href={resetHref}>
			<Button type="button" variant="ghost" size="sm">Clear</Button>
		</a>
	</form>
</Card>
