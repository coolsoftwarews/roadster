import test from 'node:test';
import assert from 'node:assert/strict';
import { MoneyShotDirector, MONEY_SHOT_ANGLES, shotCameraPose } from '../dist/money-shots.js';

const flight = (patch = {}) => ({
  state: 'running', jumpTime: .2, flightProgress: .12,
  height: 3, landingWindow: false, landingArmed: false, ...patch
});
const grounded = () => flight({ jumpTime: -1, flightProgress: 0, height: 0 });
const startShot = director => {
  assert.equal(director.beginFlight('ramp'), true);
  const state = director.update(1 / 60, flight());
  assert.equal(state.started, true);
  assert.equal(state.active, true);
  return state;
};

test('a selected shot waits for enough altitude and progress before slowing time', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  assert.equal(director.beginFlight(), true);
  for (const run of [flight({ height: 1.5 }), flight({ flightProgress: .079 })]) {
    const state = director.update(.1, run);
    assert.equal(state.active, false);
    assert.equal(state.timeScale, 1);
  }
  const begun = director.update(.1, flight({ height: 1.51, flightProgress: .08 }));
  assert.equal(begun.started, true);
  assert.equal(begun.progress, 0);
  assert.equal(begun.timeScale, .22 * 2 / 6.5);
  assert.equal(director.update(.1, flight()).started, false);
});

test('shots last 6.5 real seconds while preserving the original airborne simulation interval', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  startShot(director);
  const middle = director.update(3.25, flight());
  assert.equal(middle.active, true);
  assert.equal(middle.progress, .5);
  assert.equal(middle.timeScale * 6.5, .22 * 2);
  const end = director.update(3.25, flight());
  assert.equal(end.active, false);
  assert.equal(end.ended, true);
  assert.equal(end.progress, 1);
  assert.equal(end.timeScale, 1);
  assert.equal(director.cooldown, 12);
  assert.equal(director.update(.1, flight()).ended, false);
});

test('landing timing, landing, crashes, and leaving the race immediately restore normal speed', () => {
  for (const patch of [
    { flightProgress: .52 }, { landingWindow: true }, { landingArmed: true },
    { jumpTime: -1 }, { height: 1.5 }, { state: 'crashed' }, { state: 'finished' }, { state: 'ready' }
  ]) {
    const director = new MoneyShotDirector({ random: () => 0 });
    startShot(director);
    const end = director.update(.1, flight(patch));
    assert.equal(end.active, false, JSON.stringify(patch));
    assert.equal(end.ended, true);
    assert.equal(end.timeScale, 1);
  }
});

test('pause ends a shot before advancing its timer or its fresh cooldown', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  startShot(director);
  director.update(.5, flight());
  const paused = director.update(100, flight({ state: 'paused' }));
  assert.equal(paused.ended, true);
  assert.equal(director.elapsed, .5);
  assert.equal(director.cooldown, 12);
  director.update(100, flight({ state: 'paused' }));
  assert.equal(director.cooldown, 12);
  assert.equal(director.update(.1, flight()).active, false);
});

test('a late candidate is discarded instead of taking over near the landing cue', () => {
  for (const patch of [{ flightProgress: .50 }, { landingWindow: true }, { state: 'paused' }]) {
    const director = new MoneyShotDirector({ random: () => 0 });
    director.beginFlight();
    assert.equal(director.update(.1, flight(patch)).active, false);
    assert.equal(director.update(.1, flight()).active, false);
  }
});

test('random selection ramps after misses and guarantees the fourth eligible flight', () => {
  const director = new MoneyShotDirector({ random: () => .99 });
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal(director.beginFlight(), false);
    // Repeated event handling cannot roll again during the same flight.
    assert.equal(director.beginFlight(), false);
    director.update(.1, flight());
    director.update(.1, grounded());
  }
  assert.equal(director.beginFlight(), true);
  assert.equal(director.update(.1, flight()).active, true);
  assert.equal(director.misses, 0);
});

test('cooldown uses real running time and blocks intermediate flights', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  startShot(director);
  director.stop();
  assert.equal(director.update(0, flight()).ended, true);
  director.update(5, grounded());
  assert.equal(director.cooldown, 7);
  assert.equal(director.beginFlight(), false);
  director.update(7, flight());
  assert.equal(director.update(.1, flight()).active, false);
  director.update(0, grounded());
  assert.equal(director.beginFlight(), true);
});

test('manual skip and disabling shots cancel pending or active shots', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  director.beginFlight();
  director.stop();
  assert.equal(director.cooldown, 12);
  assert.equal(director.update(.1, flight()).active, false);
  director.reset();
  startShot(director);
  director.setEnabled(false);
  assert.equal(director.update(.1, flight()).ended, true);
  director.reset();
  assert.equal(director.beginFlight(), false);
  director.setEnabled(true);
  director.update(0, grounded());
  assert.equal(director.beginFlight(), true);
});

test('consecutive shots choose different camera angles', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  const first = startShot(director).angle;
  director.stop();
  director.update(18, grounded());
  const second = startShot(director).angle;
  assert.notEqual(first, second);
  assert.ok(first in MONEY_SHOT_ANGLES);
  assert.ok(second in MONEY_SHOT_ANGLES);
});

test('bad frame times do not corrupt clocks and large frames never extend a shot', () => {
  const director = new MoneyShotDirector({ random: () => 0 });
  startShot(director);
  for (const dt of [NaN, Infinity, -1, undefined]) {
    const state = director.update(dt, flight());
    assert.equal(state.progress, 0);
    assert.equal(state.active, true);
  }
  assert.equal(director.update(10, flight()).ended, true);
});

test('all camera poses frame the car at a distance and pull back for portrait screens', () => {
  for (const angle of Object.keys(MONEY_SHOT_ANGLES)) {
    for (const progress of [0, .5, 1]) {
      const wide = shotCameraPose(angle, progress);
      const narrow = shotCameraPose(angle, progress, 9 / 16);
      assert.ok(Object.values(wide).every(Number.isFinite));
      assert.ok(Math.hypot(wide.forward, wide.right, wide.height) >= 9);
      assert.ok(Math.hypot(narrow.forward, narrow.right, narrow.height) > Math.hypot(wide.forward, wide.right, wide.height));
      if (angle === 'low') assert.equal(narrow.height, -.9);
    }
    const first = shotCameraPose(angle, 0), last = shotCameraPose(angle, 1);
    assert.notEqual(first.forward, last.forward);
    assert.ok(Math.abs(Math.hypot(first.forward, first.right) - Math.hypot(last.forward, last.right)) < 1e-10);
  }
  assert.ok(Object.values(shotCameraPose('unknown', NaN, 0)).every(Number.isFinite));
});
