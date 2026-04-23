import type { EChartsOption } from 'echarts';

export const chartPalette = {
  expected: 'var(--color-secondary)',
  realized: 'var(--color-primary)',
  muted: 'var(--color-text-muted)',
  text: 'var(--color-text-secondary)',
  border: 'var(--color-border)',
  barExpected: 'var(--color-secondary)',
  barRealized: 'var(--color-primary)',
};

export function baseChartOption(): EChartsOption {
  return {
    color: [chartPalette.expected, chartPalette.realized],
    textStyle: {
      color: chartPalette.text,
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    grid: {
      left: 8,
      right: 16,
      top: 28,
      bottom: 8,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'var(--color-bg-surface-elevated)',
      borderColor: chartPalette.border,
      textStyle: { color: 'var(--color-text-primary)' },
    },
  };
}
