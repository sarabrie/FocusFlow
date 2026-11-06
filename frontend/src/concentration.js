// Concentration = visual attention (looking at the screen) × engagement signals.
// All thresholds are starting points, not calibrated per user. Frames are sampled at 10 fps.
import { rampDown, windowScore } from './attentionScore';

export const FPS = 10;
const VISUAL_WINDOW = 3 * FPS;
// Fixed gaze for 8s while a video plays is typical of "zoning out"; engaged viewers follow the action.
const STARE_WINDOW = 8 * FPS;
// Blink rate needs a longer window to be meaningful.
const BLINK_WINDOW = 60 * FPS;
const MIN_BLINK_FRAMES = 20 * FPS;
const YAWN_WINDOW = 30 * FPS;
const YAWN_MIN_FRAMES = 1 * FPS;
const RESTLESS_WINDOW = 5 * FPS;
// A blink is a closure of 1–4 frames (≤0.4s); longer closures are handled as "eyes closed".
const MAX_BLINK_FRAMES = 4;
// Talking = the mouth opening and closing again and again; a yawn is one long opening.
const TALK_WINDOW = 5 * FPS;
// Two thresholds (hysteresis) so jitter around a single threshold isn't counted as many cycles.
const MOUTH_OPEN_ABOVE = 0.03;
const MOUTH_CLOSED_BELOW = 0.015;
// Cycles per 5s: up to 3 (a short "yes") doesn't count; 8+ (continuous speech) is full talking.
const TALK_CYCLES_NONE = 3;
const TALK_CYCLES_FULL = 8;
export const TALKING_CYCLES = 4;
// Laughing at the video also opens and closes the mouth, but it means engagement, not distraction.
// A broad smile measures ~0.95 (MediaPipe sample portrait) vs ~0 for a neutral face.
const SMILE_ABOVE = 0.5;

const WEIGHTS = { stare: 0.3, blinks: 0.2, yawn: 0.15, restless: 0.15, talking: 0.2 };

// 0 below `zero`, 1 above `full`, linear in between.
export function rampUp(value, zero, full) {
  return 1 - rampDown(value, zero, full);
}

function std(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length);
}

// How much the iris moves around over the last 8 seconds (eyes open, face present).
export function gazeSpread(frames) {
  const open = frames.slice(-STARE_WINDOW).filter((f) => f.face && !f.closed && Number.isFinite(f.irisX));
  if (open.length < STARE_WINDOW / 2) return null;
  return Math.hypot(std(open.map((f) => f.irisX)), std(open.map((f) => f.irisY)));
}

export function blinksPerMinute(frames) {
  const recent = frames.slice(-BLINK_WINDOW);
  if (recent.length < MIN_BLINK_FRAMES) return null;
  let blinks = 0;
  let run = 0;
  recent.forEach((frame) => {
    if (frame.face && frame.closed) {
      run += 1;
      return;
    }
    if (run >= 1 && run <= MAX_BLINK_FRAMES) blinks += 1;
    run = 0;
  });
  return blinks / (recent.length / FPS / 60);
}

export function yawnedRecently(frames) {
  let run = 0;
  for (const frame of frames.slice(-YAWN_WINDOW)) {
    run = frame.face && frame.jaw > 0.5 ? run + 1 : 0;
    if (run >= YAWN_MIN_FRAMES) return true;
  }
  return false;
}

// Open→closed mouth cycles in the last 5 seconds (face present), or null without enough data.
// An opening during which the person smiles is laughter and isn't counted.
export function mouthCycles(frames) {
  const recent = frames.slice(-TALK_WINDOW).filter((f) => f.face && Number.isFinite(f.mouth));
  if (recent.length < TALK_WINDOW / 2) return null;
  let open = false;
  let laughing = false;
  let cycles = 0;
  recent.forEach((frame) => {
    if (!open && frame.mouth > MOUTH_OPEN_ABOVE) {
      open = true;
      laughing = false;
    }
    if (open && (frame.smile ?? 0) > SMILE_ABOVE) laughing = true;
    if (open && frame.mouth < MOUTH_CLOSED_BELOW) {
      open = false;
      if (!laughing) cycles += 1;
    }
  });
  return cycles;
}

// Mean head rotation change per frame, in degrees.
export function headMotion(frames) {
  const posed = frames.slice(-RESTLESS_WINDOW).filter((f) => f.face && Number.isFinite(f.yaw));
  if (posed.length < 2) return null;
  let total = 0;
  for (let i = 1; i < posed.length; i += 1) {
    total += Math.abs(posed[i].yaw - posed[i - 1].yaw) + Math.abs(posed[i].pitch - posed[i - 1].pitch);
  }
  return total / (posed.length - 1);
}

export function concentrationScore(frames) {
  const visual = windowScore(frames.slice(-VISUAL_WINDOW));
  if (!visual) return null;

  const spread = gazeSpread(frames);
  const bpm = blinksPerMinute(frames);
  const yawn = yawnedRecently(frames);
  const motion = headMotion(frames);
  const cycles = mouthCycles(frames);

  // Signals without enough data yet count as neutral (1) so they don't punish the first seconds.
  const parts = {
    stare: spread === null ? 1 : rampUp(spread, 0.008, 0.02),
    blinks: bpm === null ? 1 : rampDown(bpm, 25, 45),
    yawn: yawn ? 0.3 : 1,
    restless: motion === null ? 1 : rampDown(motion, 1.5, 4),
    talking: cycles === null ? 1 : rampDown(cycles, TALK_CYCLES_NONE, TALK_CYCLES_FULL),
  };
  const engagement = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * parts[key], 0);

  return {
    score: visual.score * engagement,
    visual: visual.score,
    engagement,
    parts,
    raw: { spread, bpm, yawn, motion, mouthCycles: cycles, talking: cycles !== null && cycles >= TALKING_CYCLES },
    head: visual.head,
    gaze: visual.gaze,
    eyes: visual.eyes,
    face: visual.face,
    away: frames.slice(-VISUAL_WINDOW).some((f) => f.away),
  };
}
