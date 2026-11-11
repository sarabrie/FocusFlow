import { describe, expect, it } from 'vitest';
import { TALK_MIN_FACTOR, blinksPerMinute, concentrationScore, gazeSpread, headMotion, looksLikePhoto, mouthCycles, yawnedRecently } from './concentration';

const frame = (overrides = {}) => ({ face: true, head: 1, gaze: 1, closed: false, yaw: 0, pitch: 0, irisX: 0.5, irisY: 0.5, jaw: 0, mouth: 0.005, ...overrides });
// Mouth opening and closing every `period` frames, like syllables.
const speaking = (period) => (i) => frame({ mouth: i % period < period / 2 ? 0.05 : 0.005 });
// A real person blinks: a 2-frame closure every 5 seconds (12/min).
const blinking = (i) => i % 50 < 2;
// Gaze that wanders around the screen, like following a video.
const moving = (i) => frame({ irisX: 0.5 + 0.04 * Math.sin(i / 3), irisY: 0.5 + 0.03 * Math.cos(i / 4), closed: blinking(i) });
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

  it('counts speech where the lips never fully close between syllables', () => {
    // Mouth moving between half-open (0.02) and open (0.045), as in real continuous speech.
    const halfClosing = (i) => frame({ mouth: i % 4 < 2 ? 0.045 : 0.02 });
    expect(mouthCycles(series(50, halfClosing))).toBe(12);
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

describe('looksLikePhoto', () => {
  it('is true for a face in view for 30 seconds without a single blink', () => {
    expect(looksLikePhoto(series(300, () => frame()))).toBe(true);
  });

  it('is false once the eyes close even once in the last 30 seconds', () => {
    expect(looksLikePhoto(series(300, (i) => frame({ closed: i === 280 })))).toBe(false);
  });

  it('only looks at the last 30 seconds', () => {
    // Blinked 40s ago, then nothing for the last 30s.
    expect(looksLikePhoto(series(400, (i) => frame({ closed: i === 10 })))).toBe(true);
  });

  it('needs 30 seconds of data', () => {
    expect(looksLikePhoto(series(299, () => frame()))).toBe(false);
  });

  it('needs the face in view most of the time', () => {
    expect(looksLikePhoto(series(300, (i) => frame({ face: i % 5 !== 0 })))).toBe(false);
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
    const result = concentrationScore(series(300, (i) => frame({ closed: blinking(i) })));
    expect(result.visual).toBe(1);
    expect(result.parts.stare).toBe(0);
    expect(result.score).toBeCloseTo(0.65);
  });

  it('drops below the low-attention threshold while talking continuously, even when looking at the screen', () => {
    const talking = (i) => ({ ...moving(i), mouth: speaking(4)(i).mouth });
    const result = concentrationScore(series(300, talking));
    expect(result.visual).toBe(1);
    expect(result.raw.talking).toBe(true);
    expect(result.parts.talking).toBe(0);
    expect(result.talkFactor).toBeCloseTo(TALK_MIN_FACTOR);
    expect(result.score).toBeCloseTo(TALK_MIN_FACTOR);
    expect(result.score).toBeLessThan(0.4);
  });

  it('does not lower concentration for a short word', () => {
    // A single "yes" (one open/close) in the last 5 seconds.
    const shortWord = (i) => ({ ...moving(i), mouth: i >= 270 && i < 274 ? 0.05 : 0.005 });
    const result = concentrationScore(series(300, shortWord));
    expect(result.talkFactor).toBe(1);
    expect(result.score).toBeCloseTo(1);
  });

  it('lowers concentration partly for occasional talking', () => {
    // ~6 syllables in 5 seconds: between a short word (3) and continuous speech (8).
    const someTalking = (i) => ({ ...moving(i), mouth: i % 8 < 4 ? 0.05 : 0.005 });
    const result = concentrationScore(series(300, someTalking));
    expect(result.talkFactor).toBeGreaterThan(TALK_MIN_FACTOR);
    expect(result.talkFactor).toBeLessThan(1);
  });

  it('does not treat laughing at the video as talking', () => {
    const laughing = (i) => ({ ...moving(i), mouth: speaking(4)(i).mouth, smile: 0.9 });
    const result = concentrationScore(series(300, laughing));
    expect(result.talkFactor).toBe(1);
    expect(result.score).toBeCloseTo(1);
  });

  it('is zero for a face that never blinks (a photo), even if everything else looks attentive', () => {
    const photo = (i) => ({ ...moving(i), closed: false });
    const result = concentrationScore(series(300, photo));
    expect(result.photo).toBe(true);
    expect(result.visual).toBe(1);
    expect(result.score).toBe(0);
  });

  it('is not a photo while the person blinks', () => {
    const result = concentrationScore(series(300, moving));
    expect(result.photo).toBe(false);
  });

  it('is zero when away from the tab', () => {
    const result = concentrationScore(series(30, () => ({ face: false, head: 0, gaze: 0, closed: false, away: true })));
    expect(result.score).toBe(0);
    expect(result.away).toBe(true);
  });
});
