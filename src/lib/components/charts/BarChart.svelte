<script lang="ts">
	import { onMount } from 'svelte';
	import type { EChartsOption } from 'echarts';
	import type { EChartsType } from 'echarts/core';

	type Props = {
		option: EChartsOption;
		height?: string;
	};

	let { option, height = '320px' }: Props = $props();
	let container: HTMLDivElement;
	let chart: EChartsType | null = null;
	let observer: ResizeObserver | null = null;

	$effect(() => {
		chart?.setOption(option, true);
	});

	onMount(() => {
		let cancelled = false;

		async function mountChart() {
			const [{ init, use }, { BarChart: EChartsBarChart }, { GridComponent, LegendComponent, TooltipComponent }, { CanvasRenderer }] =
				await Promise.all([
					import('echarts/core'),
					import('echarts/charts'),
					import('echarts/components'),
					import('echarts/renderers')
				]);
			if (cancelled || !container) return;

			use([EChartsBarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);
			const mountedChart = init(container, undefined, { renderer: 'canvas' });
			chart = mountedChart;
			mountedChart.setOption(option, true);
			observer = new ResizeObserver(() => mountedChart.resize());
			observer.observe(container);
		}

		void mountChart();

		return () => {
			cancelled = true;
			observer?.disconnect();
			chart?.dispose();
			chart = null;
		};
	});
</script>

<div bind:this={container} class="w-full" style={`height: ${height};`} role="img"></div>
