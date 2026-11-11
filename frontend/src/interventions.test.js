import { describe, expect, it } from 'vitest';
import { initialInterventionState, step } from './interventions';

// Feeds one input per second and collects actions with their time.
function run(inputs) {
  let state = initialInterventionState;
  const log = [];
  inputs.forEach((input, second) => {
    const result = step(state, { now: second * 1000, playing: true, away: false, ...input });
    state = result.state;
    result.actions.forEach((action) => log.push(`${second}s:${action}`));
  });
  return log;
}

const repeat = (n, input) => Array(n).fill(input);

describe('interventions', () => {
  it('does nothing while concentrated', () => {
    expect(run(repeat(60, { score: 0.9 }))).toEqual([]);
  });

  it('reminds after 5s of low concentration, then restores when it recovers', () => {
    expect(run([...repeat(8, { score: 0.4 }), ...repeat(4, { score: 0.8 })])).toEqual(['5s:remind', '10s:restore']);
  });

  it('pauses after 15s of very low concentration', () => {
    expect(run(repeat(16, { score: 0.1 }))).toEqual(['5s:remind', '15s:restore', '15s:pause']);
  });

  it('pauses after 5s away from the tab', () => {
    // Pausing wins over reminding when both become due at the same second.
    expect(run(repeat(6, { score: 0, away: true }))).toEqual(['5s:pause']);
  });

  it('pauses after 5s of a face that looks like a photo', () => {
    expect(run(repeat(6, { score: 0, photo: true }))).toEqual(['5s:pause']);
  });

  it('does not repeat the reminder within the cooldown', () => {
    const inputs = [...repeat(6, { score: 0.4 }), ...repeat(3, { score: 0.8 }), ...repeat(8, { score: 0.4 })];
    expect(run(inputs)).toEqual(['5s:remind', '8s:restore']);
  });

  it('does nothing while the video is paused, and restores volume if it was lowered', () => {
    const inputs = [...repeat(6, { score: 0.4 }), ...repeat(20, { score: 0.1, playing: false })];
    expect(run(inputs)).toEqual(['5s:remind', '6s:restore']);
  });
});
