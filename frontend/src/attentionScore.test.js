import { describe, expect, it } from 'vitest';
import { combineScores, frameFeatures, headPose, mouthOpening, rampDown, windowScore } from './attentionScore';

// Column-major rotation about Y (yaw) by `deg`, as MediaPipe returns it.
function yawMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), 0, -Math.sin(r), 0, 0, 1, 0, 0, Math.sin(r), 0, Math.cos(r), 0, 0, 0, -40, 1];
}

function pitchMatrix(deg) {
  const r = (deg * Math.PI) / 180;
  return [1, 0, 0, 0, 0, Math.cos(r), Math.sin(r), 0, 0, -Math.sin(r), Math.cos(r), 0, 0, 0, -40, 1];
}

function result({ matrix = yawMatrix(0), shapes = {} } = {}) {
  return {
    faceLandmarks: [[{ x: 0.5, y: 0.5, z: 0 }]],
    facialTransformationMatrixes: [{ rows: 4, columns: 4, data: matrix }],
    faceBlendshapes: [{ categories: Object.entries(shapes).map(([categoryName, score]) => ({ categoryName, score })) }],
  };
}

const focused = { face: true, head: 1, gaze: 1, closed: false };
const closedFrame = { face: true, head: 1, gaze: 1, closed: true };
const noFace = { face: false, head: 0, gaze: 0, closed: false };

describe('rampDown', () => {
  it('is 1 below full, 0 above zero, linear between', () => {
    expect(rampDown(10, 20, 40)).toBe(1);
    expect(rampDown(30, 20, 40)).toBeCloseTo(0.5);
    expect(rampDown(50, 20, 40)).toBe(0);
  });
});

describe('headPose', () => {
  it('reads yaw and pitch magnitude from a column-major matrix', () => {
    expect(Math.abs(headPose(yawMatrix(30)).yaw)).toBeCloseTo(30);
    expect(Math.abs(headPose(yawMatrix(30)).pitch)).toBeCloseTo(0);
    expect(Math.abs(headPose(pitchMatrix(20)).pitch)).toBeCloseTo(20);
    expect(Math.abs(headPose(pitchMatrix(20)).yaw)).toBeCloseTo(0);
  });
});

describe('mouthOpening', () => {
  // Face 0.4 tall (forehead 10 at y=0.3, chin 152 at y=0.7), lips 13/14 given gap apart.
  const face = (gap, scale = 1) => {
    const points = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    points[10] = { x: 0.5, y: 0.5 - 0.2 * scale, z: 0 };
    points[152] = { x: 0.5, y: 0.5 + 0.2 * scale, z: 0 };
    points[13] = { x: 0.5, y: 0.55, z: 0 };
    points[14] = { x: 0.5, y: 0.55 + gap * scale, z: 0 };
    return points;
  };

  it('is the lip gap relative to face height', () => {
    expect(mouthOpening(face(0.02))).toBeCloseTo(0.05);
  });

  it('does not change when the face is closer to the camera (bigger)', () => {
    expect(mouthOpening(face(0.02, 1.5))).toBeCloseTo(mouthOpening(face(0.02)));
  });

  it('is null without full landmarks', () => {
    expect(mouthOpening([{ x: 0.5, y: 0.5, z: 0 }])).toBeNull();
  });
});

describe('frameFeatures', () => {
  it('scores a face looking straight at the screen as fully attentive', () => {
    expect(frameFeatures(result())).toMatchObject({ face: true, head: 1, gaze: 1, closed: false });
  });

  it('drops head score when the head turns away', () => {
    expect(frameFeatures(result({ matrix: yawMatrix(32.5) })).head).toBeCloseTo(0.5);
    expect(frameFeatures(result({ matrix: yawMatrix(60) })).head).toBe(0);
  });

  it('drops gaze score when the eyes look sideways', () => {
    expect(frameFeatures(result({ shapes: { eyeLookOutLeft: 0.9, eyeLookInRight: 0.85 } })).gaze).toBe(0);
  });

  it('tolerates looking slightly down at the screen', () => {
    expect(frameFeatures(result({ shapes: { eyeLookDownLeft: 0.5, eyeLookDownRight: 0.5 } })).gaze).toBe(1);
  });

  it('marks closed eyes', () => {
    expect(frameFeatures(result({ shapes: { eyeBlinkLeft: 0.8, eyeBlinkRight: 0.7 } })).closed).toBe(true);
  });

  it('treats a missing face as not attentive', () => {
    expect(frameFeatures({ faceLandmarks: [] })).toMatchObject({ face: false, head: 0, gaze: 0 });
  });
});

describe('windowScore', () => {
  it('is 1 for a focused window', () => {
    expect(windowScore(Array(30).fill(focused)).score).toBe(1);
  });

  it('ignores short blinks', () => {
    const frames = [...Array(10).fill(focused), closedFrame, closedFrame, ...Array(18).fill(focused)];
    expect(windowScore(frames).score).toBe(1);
  });

  it('counts sustained eye closure', () => {
    const frames = [...Array(15).fill(focused), ...Array(15).fill(closedFrame)];
    expect(windowScore(frames).score).toBeCloseTo(0.5);
  });

  it('counts frames without a face as distracted', () => {
    const frames = [...Array(20).fill(focused), ...Array(10).fill(noFace)];
    expect(windowScore(frames).score).toBeCloseTo(2 / 3);
    expect(windowScore(frames).face).toBeCloseTo(2 / 3);
  });

  it('returns null for an empty window', () => {
    expect(windowScore([])).toBeNull();
  });
});

describe('combineScores', () => {
  it('uses the geometric score alone until the model has a score', () => {
    expect(combineScores(0.8, null, 0.1)).toBe(0.8);
  });

  it('blends in the model with a small weight', () => {
    expect(combineScores(0.8, 0.2, 0.1)).toBeCloseTo(0.74);
  });
});
