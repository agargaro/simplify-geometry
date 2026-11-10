export function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '∞';
  if (value === 0) return '0';
  if (value >= 1) return String(Number(value.toFixed(2)));

  const digits = Math.min(Math.ceil(-Math.log10(value)) + 1, 8);

  return value.toFixed(digits);
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '∞';

  const percent = value * 100;

  if (percent === 0) return '0%';
  if (percent < 1) return `${percent.toFixed(2)}%`;

  return `${percent < 10 ? percent.toFixed(1) : percent.toFixed(0)}%`;
}

export function formatDistance(value: number): string {
  if (!Number.isFinite(value)) return '∞';

  return value < 10 ? value.toFixed(2) : value < 100 ? value.toFixed(1) : value.toFixed(0);
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatTime(milliseconds: number): string {
  return milliseconds < 10 ? `${milliseconds.toFixed(1)} ms` : `${milliseconds.toFixed(0)} ms`;
}
