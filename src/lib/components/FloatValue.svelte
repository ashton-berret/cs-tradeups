<script lang="ts">
	type Props = {
		value?: number | null;
	};

	let { value }: Props = $props();
</script>

<span>{value == null ? '—' : value.toFixed(6)}</span>
