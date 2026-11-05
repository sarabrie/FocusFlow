// Geometric attention score from MediaPipe FaceLandmarker output (head pose + blendshapes).
// Each frame gets head/gaze/eyes components in [0, 1]; a window averages them.

const RAD_TO_DEG = 180 / Math.PI;
// A blink lasts ~1–2 frames at 10fps; only closures at least this long count as "eyes closed".
export const MIN_CLOSED_FRAMES = 3;

// 1 below `full`, 0 above `zero`, linear in between.
export function rampDown(value, full, zero) {
  if (value <= full) return 1;
  if (value >= zero) return 0;
  return 1 - (value - full) / (zero - full);
}

// MediaPipe matrices are column-major 4x4: element (row r, col c) = data[c * 4 + r].
// The face's forward axis is the rotated +Z column; facing the camera gives (0, 0, 1).
export function headPose(matrixData) {
  if (!matrixData || matrixData.length < 16) return null;
  const [fx, fy, fz] = [matrixData[8], matrixData[9], matrixData[10]];
  return {
    yaw: Math.atan2(fx, fz) * RAD_TO_DEG,
    pitch: Math.atan2(-fy, Math.hypot(fx, fz)) * RAD_TO_DEG,
  };
}

function blendshapeMap(categories) {
  const map = {};
  (categories ?? []).forEach(({ categoryName, score }) => {
    map[categoryName] = score;
  });
  return map;
}

export function frameFeatures(result) {
  const landmarks = result?.faceLandmarks?.[0];
  if (!landmarks) return { face: false, head: 0, gaze: 0, closed: false };

  const pose = headPose(result.facialTransformationMatrixes?.[0]?.data);
  const head = pose ? rampDown(Math.abs(pose.yaw), 20, 45) * rampDown(Math.abs(pose.pitch), 25, 45) : 1;

  const b = blendshapeMap(result.faceBlendshapes?.[0]?.categories);
  const sideways = Math.max(b.eyeLookOutLeft ?? 0, b.eyeLookOutRight ?? 0, b.eyeLookInLeft ?? 0, b.eyeLookInRight ?? 0);
  const up = Math.max(b.eyeLookUpLeft ?? 0, b.eyeLookUpRight ?? 0);
  const down = Math.max(b.eyeLookDownLeft ?? 0, b.eyeLookDownRight ?? 0);
  // Reading the lower part of the screen looks down a bit, so "down" gets a looser threshold.
  const gaze = Math.min(rampDown(sideways, 0.45, 0.8), rampDown(up, 0.45, 0.8), rampDown(down, 0.6, 0.9));
  const closed = ((b.eyeBlinkLeft ?? 0) + (b.eyeBlinkRight ?? 0)) / 2 > 0.5;

  return { face: true, head, gaze, closed, yaw: pose?.yaw, pitch: pose?.pitch };
}

// Marks a frame as eyes-closed only when it belongs to a closure of MIN_CLOSED_FRAMES or more.
function sustainedClosures(frames) {
  const sustained = new Array(frames.length).fill(false);
  let start = 0;
  for (let i = 0; i <= frames.length; i += 1) {
    if (i < frames.length && frames[i].closed) continue;
    if (i - start >= MIN_CLOSED_FRAMES) sustained.fill(true, start, i);
    start = i + 1;
  }
  return sustained;
}

export function windowScore(frames) {
  if (!frames.length) return null;
  const closed = sustainedClosures(frames);
  const totals = { score: 0, face: 0, head: 0, gaze: 0, eyes: 0 };

  frames.forEach((frame, index) => {
    const eyes = closed[index] ? 0 : 1;
    totals.score += frame.face ? frame.head * frame.gaze * eyes : 0;
    totals.face += frame.face ? 1 : 0;
    totals.head += frame.head;
    totals.gaze += frame.gaze;
    totals.eyes += frame.face ? eyes : 0;
  });

  const n = frames.length;
  const faceN = totals.face || 1;
  return {
    score: totals.score / n,
    face: totals.face / n,
    head: totals.face ? totals.head / faceN : 0,
    gaze: totals.face ? totals.gaze / faceN : 0,
    eyes: totals.face ? totals.eyes / faceN : 0,
  };
}

export function combineScores(geometric, model, modelWeight) {
  if (geometric === null) return null;
  if (model === null || !Number.isFinite(model)) return geometric;
  return (1 - modelWeight) * geometric + modelWeight * model;
}
