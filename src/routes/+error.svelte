<script lang="ts">
	import { page } from '$app/state';
	import Card from '$lib/components/Card.svelte';
	import Button from '$lib/components/Button.svelte';
</script>

<div class="flex min-h-[70vh] items-center justify-center">
	<Card class="max-w-xl" glow>
		<p class="text-sm font-medium text-[var(--color-text-muted)]">{page.status}</p>
		<h1 class="mt-2 text-2xl font-semibold text-[var(--color-text-primary)]">
			{page.status === 404 ? 'Page not found' : 'Something went wrong'}
		</h1>
		<p class="mt-3 text-sm text-[var(--color-text-secondary)]">
			{page.error?.message ?? 'The request could not be completed.'}
		</p>
		<a class="mt-6 inline-flex" href="/dashboard">
			<Button variant="secondary">Back to dashboard</Button>
		</a>
	</Card>
</div>
