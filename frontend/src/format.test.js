import { describe, expect, it } from 'vitest';
import { formatClock, formatPercent, formatPosition } from './format';

describe('formatPercent', () => {
  it('shows a 0–1 score as a whole percent', () => {
    expect(formatPercent(0.8)).toBe('80%');
    expect(formatPercent(0.456)).toBe('46%');
    expect(formatPercent(null)).toBe('—');
  });
});

describe('formatClock', () => {
  it('formats seconds as m:ss and h:mm:ss', () => {
    expect(formatClock(12.5)).toBe('0:12');
    expect(formatClock(200)).toBe('3:20');
    expect(formatClock(3725)).toBe('1:02:05');
  });
});

describe('formatPosition', () => {
  it('shows video positions as time and text positions as scroll percent', () => {
    expect(formatPosition(200, 'link')).toBe('3:20');
    expect(formatPosition(42.4, 'text')).toBe('42%');
  });
});
