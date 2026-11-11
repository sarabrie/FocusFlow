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
// While speaking, the lips rarely close fully between syllables (only on b/p/m), so a syllable is
// counted as a peak: the mouth opens and then closes again by at least this much (fraction of face
// height, ~3mm on a typical face), wherever it starts. Landmark jitter is smaller, so it isn't counted.
const MOUTH_MOVE = 0.015;
// Cycles per 5s: up to 3 (a short "yes") doesn't count; 8+ (continuous speech) is full talking.
const TALK_CYCLES_NONE = 3;
const TALK_CYCLES_FULL = 8;
export const TALKING_CYCLES = 4;
// Talking is a separate multiplier, not one more engagement weight: someone looking at the screen
// while talking (e.g. on the phone) is not concentrating, so continuous speech must be able to push
// the score below the low-attention threshold (0.4). 0.35 takes a fully attentive 1.0 down to 0.35.
export const TALK_MIN_FACTOR = 0.35;
// Laughing at the video also opens and closes the mouth, but it means engagement, not distraction.
// A broad smile measures ~0.95 (MediaPipe sample portrait) vs ~0 for a neutral face.
const SMILE_ABOVE = 0.5;
// A real person blinks every few seconds; even while staring at a screen, 30s without a single
// blink is very rare. A face that never blinks for that long is most likely a photo held up to the camera.
const NO_BLINK_WINDOW = 30 * FPS;
// The face must be in view for most of the window, otherwise there is nothing to judge.
const NO_BLINK_MIN_FACE = 0.9;

const WEIGHTS = { stare: 0.35, blinks: 0.25, yawn: 0.2, restless: 0.2 };

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
  // Zigzag peak counting: follow the mouth up to its highest point; once it drops by MOUTH_MOVE from
  // there, that was one syllable. Then follow it down to its lowest point until it rises by MOUTH_MOVE.
  let rising = true;
  let extreme = recent[0].mouth;
  let laughing = false;
  let cycles = 0;
  recent.forEach((frame) => {
    const { mouth } = frame;
    if (rising) {
      if ((frame.smile ?? 0) > SMILE_ABOVE) laughing = true;
      if (mouth > extreme) {
        extreme = mouth;
      } else if (extreme - mouth >= MOUTH_MOVE) {
        if (!laughing) cycles += 1;
        rising = false;
        extreme = mouth;
      }
    } else if (mouth < extreme) {
      extreme = mouth;
    } else if (mouth - extreme >= MOUTH_MOVE) {
      rising = true;
      extreme = mouth;
      laughing = (frame.smile ?? 0) > SMILE_ABOVE;
    }
  });
  return cycles;
}

// True when a face was in view for the last 30 seconds and the eyes never closed, not even once.
export function looksLikePhoto(frames) {
  const recent = frames.slice(-NO_BLINK_WINDOW);
  if (recent.length < NO_BLINK_WINDOW) return false;
  const withFace = recent.filter((f) => f.face);
  if (withFace.length < NO_BLINK_WINDOW * NO_BLINK_MIN_FACE) return false;
  return !withFace.some((f) => f.closed);
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
  const photo = looksLikePhoto(frames);

  // Signals without enough data yet count as neutral (1) so they don't punish the first seconds.
  const parts = {
    stare: spread === null ? 1 : rampUp(spread, 0.008, 0.02),
    blinks: bpm === null ? 1 : rampDown(bpm, 25, 45),
    yawn: yawn ? 0.3 : 1,
    restless: motion === null ? 1 : rampDown(motion, 1.5, 4),
    talking: cycles === null ? 1 : rampDown(cycles, TALK_CYCLES_NONE, TALK_CYCLES_FULL),
  };
  const engagement = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * parts[key], 0);
  // 1 while silent or saying a short word, down to TALK_MIN_FACTOR during continuous speech.
  const talkFactor = TALK_MIN_FACTOR + (1 - TALK_MIN_FACTOR) * parts.talking;

  return {
    // A photo is not a person watching, so it gets no concentration at all.
    score: photo ? 0 : visual.score * engagement * talkFactor,
    visual: visual.score,
    engagement,
    talkFactor,
    photo,
    parts,
    raw: { spread, bpm, yawn, motion, mouthCycles: cycles, talking: cycles !== null && cycles >= TALKING_CYCLES },
    head: visual.head,
    gaze: visual.gaze,
    eyes: visual.eyes,
    face: visual.face,
    away: frames.slice(-VISUAL_WINDOW).some((f) => f.away),
  };
}
