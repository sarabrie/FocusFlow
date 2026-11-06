import { describe, expect, it } from 'vitest';
import { blinksPerMinute, concentrationScore, gazeSpread, headMotion, mouthCycles, yawnedRecently } from './concentration';

const frame = (overrides = {}) => ({ face: true, head: 1, gaze: 1, closed: false, yaw: 0, pitch: 0, irisX: 0.5, irisY: 0.5, jaw: 0, mouth: 0.005, ...overrides });
// Mouth opening and closing every `period` frames, like syllables.
const speaking = (period) => (i) => frame({ mouth: i % period < period / 2 ? 0.05 : 0.005 });
// Gaze that wanders around the screen, like following a video.
const moving = (i) => frame({ irisX: 0.5 + 0.04 * Math.sin(i / 3), irisY: 0.5 + 0.03 * Math.cos(i / 4) });
const series = (n, make) => Array.from({ length: n }, (_, i) => make(i));

describe('gazeSpread', () => {
  it('is near zero for a frozen stare and larger when the eyes move', () => {
    expect(gazeSpread(series(80, () => frame()))).toBe(0);
    expect(gazeSpread(series(80, moving))).toBeGreaterThan(0.02);
  });

  it('needs enough open-eye frames', () => {
    expect(gazeSpread(series(20, moving))).toBeNull();
  });
});

describe('blinksPerMinute', () => {
  it('counts short closures as blinks, not long ones', () => {
    // 60s: a 2-frame blink every 5s (12/min) plus one 2s closure that is not a blink.
    const frames = series(600, (i) => frame({ closed: i % 50 < 2 || (i >= 310 && i < 330) }));
    expect(blinksPerMinute(frames)).toBe(12);
  });

  it('waits for 20 seconds of data', () => {
    expect(blinksPerMinute(series(100, () => frame()))).toBeNull();
  });
});

describe('yawnedRecently', () => {
  it('detects a wide-open mouth held for a second', () => {
    expect(yawnedRecently(series(100, (i) => frame({ jaw: i > 50 && i < 65 ? 0.8 : 0 })))).toBe(true);
  });

  it('ignores talking-length mouth openings', () => {
    expect(yawnedRecently(series(100, (i) => frame({ jaw: i % 10 < 3 ? 0.8 : 0 })))).toBe(false);
  });
});

describe('mouthCycles', () => {
  it('counts repeated open/close cycles as talking', () => {
    // 50 frames (5s), a syllable every 4 frames → 12 cycles.
    expect(mouthCycles(series(50, speaking(4)))).toBe(12);
  });

  it('does not count a closed mouth, a short "yes" or a yawn as talking', () => {
    expect(mouthCycles(series(50, () => frame()))).toBe(0);
    expect(mouthCycles(series(50, (i) => frame({ mouth: i >= 20 && i < 24 ? 0.05 : 0.005 })))).toBe(1);
    expect(mouthCycles(series(50, (i) => frame({ mouth: i >= 10 && i < 35 ? 0.2 : 0.005 })))).toBe(1);
  });

  it('does not count laughing (mouth cycles while smiling) as talking', () => {
    const laughing = (i) => ({ ...speaking(4)(i), smile: 0.9 });
    expect(mouthCycles(series(50, laughing))).toBe(0);
  });

  it('ignores jitter that never crosses both thresholds', () => {
    expect(mouthCycles(series(50, (i) => frame({ mouth: i % 2 ? 0.032 : 0.02 })))).toBe(0);
  });

  it('needs enough frames with a face', () => {
    expect(mouthCycles(series(10, speaking(4)))).toBeNull();
  });
});

describe('headMotion', () => {
  it('measures average rotation change per frame', () => {
    expect(headMotion(series(50, () => frame()))).toBe(0);
    expect(headMotion(series(50, (i) => frame({ yaw: i % 2 ? 5 : 0 })))).toBe(5);
  });
});

describe('concentrationScore', () => {
  it('is high when looking at the screen with a moving gaze', () => {
    expect(concentrationScore(series(300, moving)).score).toBeCloseTo(1);
  });

  it('drops for a frozen stare even while looking at the screen', () => {
    const result = concentrationScore(series(300, () => frame()));
    expect(result.visual).toBe(1);
    expect(result.parts.stare).toBe(0);
    expect(result.score).toBeCloseTo(0.7);
  });

  it('lowers concentration somewhat (not to zero) while talking', () => {
    const talking = (i) => ({ ...moving(i), mouth: speaking(4)(i).mouth });
    const result = concentrationScore(series(300, talking));
    expect(result.raw.talking).toBe(true);
    expect(result.parts.talking).toBe(0);
    expect(result.score).toBeCloseTo(0.8);
  });

  it('is zero when away from the tab', () => {
    const result = concentrationScore(series(30, () => ({ face: false, head: 0, gaze: 0, closed: false, away: true })));
    expect(result.score).toBe(0);
    expect(result.away).toBe(true);
  });
});
