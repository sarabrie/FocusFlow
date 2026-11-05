// Pure helpers for the history page: dates, session summaries and low-concentration stretches.

export const LOW_THRESHOLD = 0.4;
const DAY_MS = 24 * 60 * 60 * 1000;

// The server stores UTC but returns some datetimes without a zone ("2026-11-05T18:29:30");
// without the "Z" the browser would read them as local time and shift them by the UTC offset.
export function parseServerDate(value) {
  if (!value) return null;
  const hasZone = /([zZ]|[+-]\d\d:?\d\d)$/.test(value);
  const date = new Date(hasZone ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function sessionDurationSeconds(session) {
  const start = parseServerDate(session.started_at);
  const end = parseServerDate(session.ended_at);
  if (!start || !end) return null;
  return Math.max(0, (end - start) / 1000);
}

export function attentionLevel(score) {
  if (score === null || score === undefined) return { tone: 'idle', label: 'אין מדידות' };
  if (score < LOW_THRESHOLD) return { tone: 'low', label: 'נמוך' };
  if (score < 0.7) return { tone: 'mid', label: 'בינוני' };
  return { tone: 'high', label: 'גבוה' };
}

// Average weighted by reading count, so a 1-reading session doesn't count like a 60-reading one.
export function summarizeSessions(sessions) {
  let weighted = 0;
  let readings = 0;
  let totalSeconds = 0;
  let best = null;
  sessions.forEach((session) => {
    if (session.average_score !== null && session.reading_count > 0) {
      weighted += session.average_score * session.reading_count;
      readings += session.reading_count;
      if (!best || session.average_score > best.average_score) best = session;
    }
    totalSeconds += sessionDurationSeconds(session) ?? 0;
  });
  return { count: sessions.length, totalSeconds, average: readings ? weighted / readings : null, best };
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function dayLabel(date, now = new Date()) {
  const diff = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
  if (diff === 0) return 'היום';
  if (diff === 1) return 'אתמול';
  return new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
}

// Sessions arrive newest first; keeps that order and groups consecutive ones by local day.
export function groupByDay(sessions, now = new Date()) {
  const groups = [];
  sessions.forEach((session) => {
    const date = parseServerDate(session.started_at);
    const label = date ? dayLabel(date, now) : 'ללא תאריך';
    const last = groups.at(-1);
    if (last && last.label === label) last.sessions.push(session);
    else groups.push({ label, sessions: [session] });
  });
  return groups;
}

// Contiguous stretches (by position) where the score stayed below the threshold for at least
// `minReadings` readings in a row; a single low reading (~3s) is usually noise, not a lapse.
export function lowSegments(readings, { threshold = LOW_THRESHOLD, minReadings = 2 } = {}) {
  const sorted = [...readings].sort((a, b) => a.position - b.position);
  const segments = [];
  let current = null;
  const close = () => {
    if (current && current.count >= minReadings) segments.push(current);
    current = null;
  };
  sorted.forEach((reading) => {
    if (reading.score < threshold) {
      if (!current) current = { from: reading.position, to: reading.position, min: reading.score, count: 0 };
      current.to = reading.position;
      current.min = Math.min(current.min, reading.score);
      current.count += 1;
    } else {
      close();
    }
  });
  close();
  return segments;
}
