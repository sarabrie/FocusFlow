import { describe, expect, it } from 'vitest';
import { attentionLevel, dayLabel, groupByDay, lowSegments, parseServerDate, sessionDurationSeconds, summarizeSessions } from './historyStats';

describe('parseServerDate', () => {
  it('treats zone-less server datetimes as UTC', () => {
    expect(parseServerDate('2026-11-05T18:29:30.168000').toISOString()).toBe('2026-11-05T18:29:30.168Z');
    expect(parseServerDate('2026-11-05T18:29:30Z').toISOString()).toBe('2026-11-05T18:29:30.000Z');
    expect(parseServerDate('2026-11-05T18:29:30+02:00').toISOString()).toBe('2026-11-05T16:29:30.000Z');
    expect(parseServerDate(null)).toBeNull();
  });
});

describe('sessionDurationSeconds', () => {
  it('is the time between start and end, or null while open', () => {
    expect(sessionDurationSeconds({ started_at: '2026-11-05T18:00:00', ended_at: '2026-11-05T18:03:20' })).toBe(200);
    expect(sessionDurationSeconds({ started_at: '2026-11-05T18:00:00', ended_at: null })).toBeNull();
  });
});

describe('summarizeSessions', () => {
  const sessions = [
    { id: 'a', started_at: '2026-11-05T18:00:00', ended_at: '2026-11-05T18:10:00', reading_count: 30, average_score: 0.8 },
    { id: 'b', started_at: '2026-11-04T18:00:00', ended_at: '2026-11-04T18:05:00', reading_count: 10, average_score: 0.4 },
    { id: 'c', started_at: '2026-11-03T18:00:00', ended_at: null, reading_count: 0, average_score: null },
  ];

  it('weights the average by readings and finds the best session', () => {
    const summary = summarizeSessions(sessions);
    expect(summary.count).toBe(3);
    expect(summary.totalSeconds).toBe(900);
    expect(summary.average).toBeCloseTo(0.7);
    expect(summary.best.id).toBe('a');
  });

  it('has no average without readings', () => {
    expect(summarizeSessions([sessions[2]]).average).toBeNull();
  });
});

describe('attentionLevel', () => {
  it('matches the gauge zones', () => {
    expect(attentionLevel(0.2).tone).toBe('low');
    expect(attentionLevel(0.55).tone).toBe('mid');
    expect(attentionLevel(0.9).tone).toBe('high');
    expect(attentionLevel(null).tone).toBe('idle');
  });
});

describe('dayLabel / groupByDay', () => {
  const now = new Date(2026, 10, 5, 21, 0);

  it('names today and yesterday', () => {
    expect(dayLabel(new Date(2026, 10, 5, 8, 0), now)).toBe('היום');
    expect(dayLabel(new Date(2026, 10, 4, 23, 0), now)).toBe('אתמול');
  });

  it('groups consecutive sessions of the same day', () => {
    const at = (d, h) => new Date(2026, 10, d, h).toISOString();
    const groups = groupByDay([{ started_at: at(5, 20) }, { started_at: at(5, 9) }, { started_at: at(4, 9) }], now);
    expect(groups.map((g) => [g.label, g.sessions.length])).toEqual([['היום', 2], ['אתמול', 1]]);
  });
});

describe('lowSegments', () => {
  const readings = [0.8, 0.3, 0.2, 0.7, 0.35, 0.9].map((score, i) => ({ position: i * 3, score }));

  it('finds stretches of 2+ low readings, in position order, ignoring single-reading blips', () => {
    expect(lowSegments([...readings].reverse())).toEqual([{ from: 3, to: 6, min: 0.2, count: 2 }]);
  });

  it('can include single readings', () => {
    expect(lowSegments(readings, { minReadings: 1 }).map((s) => s.from)).toEqual([3, 12]);
  });
});
