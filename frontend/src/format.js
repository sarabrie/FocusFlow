// Shared display formats for scores and times (session summary + history).

export function formatPercent(score) {
  if (score === null || score === undefined || !Number.isFinite(Number(score))) return '—';
  return `${Math.round(Number(score) * 100)}%`;
}

// Seconds → "m:ss" or "h:mm:ss".
export function formatClock(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Videos store the second in the video; text stores the scroll percentage.
export function formatPosition(position, contentType) {
  if (contentType === 'link') return formatClock(position);
  return `${Math.round(Number(position) || 0)}%`;
}
