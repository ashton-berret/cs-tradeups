import type { EChartsOption } from 'echarts';

// ECharts uses the canvas renderer, which writes color values directly to
// `canvas.fillStyle` / `strokeStyle`. The canvas API does NOT resolve CSS
// custom properties — `var(--color-primary)` falls through to black. So we
// build the chart theme by reading computed CSS variable values at the time
// the chart mounts.
//
// Charts only mount client-side (LineChart/BarChart import echarts in
// onMount), so document is always defined when this runs. SSR-rendered
// pages still call `baseChartOption()` during the page load synchronously,
// but the option object isn't applied until the chart mounts on the client,
// at which point the colors get re-evaluated.

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback;
  }
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function resolveChartPalette() {
  return {
    primary: readVar('--color-primary', '#22d3ee'),
    secondary: readVar('--color-secondary', '#818cf8'),
    success: readVar('--color-success', '#10b981'),
    warning: readVar('--color-warning', '#f59e0b'),
    danger: readVar('--color-danger', '#ef4444'),
    text: readVar('--color-text-secondary', '#9ba6b3'),
    textPrimary: readVar('--color-text-primary', '#e6edf3'),
    muted: readVar('--color-text-muted', '#6b7684'),
    border: readVar('--color-border', '#2d3441'),
    borderHover: readVar('--color-border-hover', '#3e4859'),
    surfaceElevated: readVar('--color-bg-surface-elevated', '#1c232c'),
  };
}

// Backwards-compatible export. Many call sites still reference these by
// `chartPalette.expected` / `.realized` / `.text` etc.; they're now
// evaluated lazily via a getter so the values stay correct after the
// theme tokens shift.
export const chartPalette = {
  get expected() {
    return resolveChartPalette().secondary;
  },
  get realized() {
    return resolveChartPalette().primary;
  },
  get muted() {
    return resolveChartPalette().muted;
  },
  get text() {
    return resolveChartPalette().text;
  },
  get border() {
    return resolveChartPalette().border;
  },
  get borderHover() {
    return resolveChartPalette().borderHover;
  },
  get barExpected() {
    return resolveChartPalette().secondary;
  },
  get barRealized() {
    return resolveChartPalette().primary;
  },
};

export function resolveChartSeriesColors(): string[] {
  const p = resolveChartPalette();
  // Primary cyan first, then a softer indigo companion, then neutral hues.
  // Semantic colors (success/warning/danger) are deliberately excluded —
  // those tokens are reserved for charts where the data carries that
  // meaning, not as decorative rotation.
  return [p.primary, p.secondary, '#67e8f9', '#a5b4fc', '#a7f3d0'];
}

// Legacy export name. Kept as a synchronous-evaluating array snapshot for
// any caller that destructures it; charts that build their option lazily
// should call `resolveChartSeriesColors()` instead.
export const chartSeriesColors = resolveChartSeriesColors();

export function baseChartOption(): EChartsOption {
  const p = resolveChartPalette();
  return {
    color: resolveChartSeriesColors(),
    textStyle: {
      color: p.text,
      fontFamily: 'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    },
    grid: {
      left: 12,
      right: 16,
      top: 32,
      bottom: 12,
      containLabel: true,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: p.surfaceElevated,
      borderColor: p.borderHover,
      borderWidth: 1,
      textStyle: { color: p.textPrimary },
    },
    xAxis: {
      axisLine: { lineStyle: { color: p.borderHover } },
      axisLabel: { color: p.text },
      splitLine: { show: false },
    },
    yAxis: {
      axisLine: { show: false },
      axisLabel: { color: p.text },
      splitLine: { lineStyle: { color: p.border, opacity: 0.5 } },
    },
    legend: {
      textStyle: { color: p.text },
      icon: 'roundRect',
    },
  };
}
