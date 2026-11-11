// Decides when to nudge (lower volume + chime) or pause the video, from the per-second concentration score.
// Pure: step(state, input) → { state, actions }, so the timing rules can be tested without real time.

export const REMIND_BELOW = 0.5;
export const PAUSE_BELOW = 0.25;
export const RECOVER_ABOVE = 0.6;
export const REMIND_AFTER_MS = 5000;
export const PAUSE_AFTER_MS = 15000;
// Leaving the tab/window while the video plays is the clearest sign, so it pauses sooner.
export const AWAY_PAUSE_AFTER_MS = 5000;
// A face with no blinks (see looksLikePhoto) is likely a photo; if it persists, the video pauses.
export const PHOTO_PAUSE_AFTER_MS = 5000;
export const RECOVER_AFTER_MS = 2000;
export const REMIND_COOLDOWN_MS = 20000;

export const initialInterventionState = {
  lowSince: null,
  veryLowSince: null,
  awaySince: null,
  photoSince: null,
  recoveredSince: null,
  ducked: false,
  lastReminderAt: -Infinity,
};

function reset(state) {
  return { ...state, lowSince: null, veryLowSince: null, awaySince: null, photoSince: null, recoveredSince: null };
}

export function step(state, { now, score, away, photo = false, playing }) {
  const actions = [];

  if (!playing || score === null) {
    if (state.ducked) actions.push('restore');
    return { state: { ...reset(state), ducked: false }, actions };
  }

  const next = {
    ...state,
    awaySince: away ? state.awaySince ?? now : null,
    photoSince: photo ? state.photoSince ?? now : null,
    veryLowSince: score < PAUSE_BELOW ? state.veryLowSince ?? now : null,
    lowSince: score < REMIND_BELOW ? state.lowSince ?? now : null,
    recoveredSince: score >= RECOVER_ABOVE ? state.recoveredSince ?? now : null,
  };

  const awayTooLong = next.awaySince !== null && now - next.awaySince >= AWAY_PAUSE_AFTER_MS;
  const photoTooLong = next.photoSince !== null && now - next.photoSince >= PHOTO_PAUSE_AFTER_MS;
  const lowTooLong = next.veryLowSince !== null && now - next.veryLowSince >= PAUSE_AFTER_MS;
  if (awayTooLong || photoTooLong || lowTooLong) {
    if (next.ducked) actions.push('restore');
    actions.push('pause');
    return { state: { ...reset(next), ducked: false }, actions };
  }

  if (next.ducked && next.recoveredSince !== null && now - next.recoveredSince >= RECOVER_AFTER_MS) {
    actions.push('restore');
    return { state: { ...next, ducked: false }, actions };
  }

  const needsReminder = next.lowSince !== null && now - next.lowSince >= REMIND_AFTER_MS;
  if (needsReminder && !next.ducked && now - next.lastReminderAt >= REMIND_COOLDOWN_MS) {
    actions.push('remind');
    return { state: { ...next, ducked: true, lastReminderAt: now }, actions };
  }

  return { state: next, actions };
}
