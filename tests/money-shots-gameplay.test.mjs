import test from 'node:test';
import assert from 'node:assert/strict';
import { Run } from '../dist/game-logic.js';
import { MoneyShotDirector } from '../dist/money-shots.js';

const GAS = Object.freeze({ gas:true });

function launch(kind, difficulty = 'easy', enabled = true) {
  const run = new Run(3000, {}, difficulty);
  const director = new MoneyShotDirector({ random:() => 0, enabled });
  run.obstacles = [];
  run.start();
  run.speed = 55;
  if (kind === 'manual') {
    run.ramps = [];
    assert.equal(run.jump(), true);
  } else {
    const ramp = run.ramps[0];
    run.s = ramp.s - .01;
    run.offset = ramp.offset;
    run.update(1 / 120, GAS);
    assert.equal(run.flightKind, 'ramp');
  }
  for (const event of run.drainEvents()) {
    if (event.type === 'jump' || event.type === 'ramp') director.beginFlight(event.type);
  }
  return { run, director };
}

function completeFlight({ kind, difficulty = 'easy', fps = 60, enabled = true, endTime = 6 }) {
  const { run, director } = launch(kind, difficulty, enabled);
  let realTime = 0;
  let starts = 0;
  let endAt = null;
  let shotStartedAt = null;
  let shotEndedAt = null;
  let landingAt = null;
  let landed = false;
  let shot = { timeScale:1 };
  for (let frame = 0; run.time < endTime - 1e-9 && frame < fps * 20; frame++) {
    const realDt = 1 / fps;
    const scale = director.active ? shot.timeScale : 1;
    // Match the game loop: simulate, consume launch events, update the camera,
    // then render. Only simulation time is clamped for a slow display.
    const fullStep = Math.min(realDt, .035) * scale;
    const dt = Math.min(fullStep, endTime - run.time);
    run.update(dt, GAS);
    realTime += realDt * dt / fullStep;
    for (const event of run.drainEvents()) {
      if (event.type === 'jump' || event.type === 'ramp') director.beginFlight(event.type);
      if (event.type === 'land') landed = true;
    }
    shot = director.update(realDt, run);
    if (shot.started) { starts++; shotStartedAt = realTime; }
    if (shot.ended) { endAt = run.time; shotEndedAt = realTime; }
    if (run.landingWindow) {
      assert.equal(shot.active, false, 'the camera must be restored before the landing cue');
      assert.equal(shot.timeScale, 1, 'landing timing runs at normal speed');
      assert.ok(run.flightProgress >= run.difficulty.landingWindowStart);
      assert.ok(run.flightProgress < run.difficulty.landingWindowStart + .025, 'the cue still opens at its configured threshold');
      landingAt = run.time;
      assert.equal(run.jump(), true, 'the original landing-thrust action remains available');
    }
    assert.equal(run.state, 'running', 'an on-time landing must not become a crash');
  }
  assert.ok(landed);
  assert.ok(landingAt !== null);
  assert.ok(Math.abs(run.time - endTime) < 1e-9);
  assert.equal(run.jumpTime, -1);
  assert.equal(run.height, 0);
  assert.equal(run.roll, 0);
  assert.equal(run.successfulJumps, 1);
  assert.equal(run.score, kind === 'ramp' ? 150 : 0);
  assert.equal(director.update(0, run).timeScale, 1);
  if (enabled) {
    assert.equal(starts, 1);
    assert.ok(endAt !== null && endAt < landingAt);
    assert.ok(shotEndedAt - shotStartedAt >= 6.5 - 1e-8, 'an uninterrupted shot supplies more than three times the original two-second footage');
    assert.ok(shotEndedAt - shotStartedAt <= 6.5 + 1 / fps + 1e-8, 'shots end within 6.5 real seconds plus one frame');
  } else assert.equal(starts, 0);
  return { run, realTime };
}

test('selected manual and ramp shots return control before the real landing window on every difficulty', () => {
  for (const kind of ['manual', 'ramp']) {
    for (const difficulty of ['easy', 'medium', 'hard']) completeFlight({ kind, difficulty });
  }
});

test('30, 60 and 120 Hz preserve the same game-time landing outcome while the shot adds real time', () => {
  for (const kind of ['manual', 'ramp']) {
    const normal = completeFlight({ kind, fps:120, enabled:false });
    for (const fps of [30, 60, 120]) {
      const slow = completeFlight({ kind, fps });
      assert.equal(slow.run.time, normal.run.time);
      assert.equal(slow.run.score, normal.run.score);
      assert.equal(slow.run.successfulJumps, normal.run.successfulJumps);
      assert.ok(Math.abs(slow.run.s - normal.run.s) < 1, 'frame-rate integration stays within one metre');
      assert.ok(Math.abs(slow.run.speed - normal.run.speed) < .1);
      assert.ok(slow.realTime > normal.realTime + 5.9, 'only the real-time presentation is extended');
    }
  }
});

test('a 15 Hz display still ends the camera shot after 6.5 real seconds', () => {
  for (const kind of ['manual', 'ramp']) completeFlight({ kind, fps:15 });
});

test('a real collision or pause cancels a shot, restores normal scale, and freezes gameplay', () => {
  for (const reason of ['pause', 'collision']) {
    const { run, director } = launch('manual');
    let shot;
    for (let frame = 0; frame < 120 && !shot?.active; frame++) {
      shot = director.update(1 / 60, run);
      if (!shot.active) run.update(1 / 60, GAS);
    }
    assert.equal(shot.active, true);
    if (reason === 'pause') run.state = 'paused';
    else {
      run.obstacles = [{ id:1, s:run.s, offset:run.offset, width:10, length:10, height:100, type:'barrier' }];
      run.update(1 / 60 * shot.timeScale, GAS);
      assert.equal(run.state, 'crashed');
      assert.ok(run.drainEvents().some(event => event.type === 'explode' && event.reason === 'collision'));
    }
    const frozen = [run.time, run.s, run.height];
    const ended = director.update(1 / 60, run);
    assert.equal(ended.active, false);
    assert.equal(ended.ended, true);
    assert.equal(ended.timeScale, 1);
    run.update(1 / 60 * ended.timeScale, GAS);
    assert.deepEqual([run.time, run.s, run.height], frozen);
    if (reason === 'pause') {
      run.start();
      assert.equal(director.update(1 / 60, run).active, false, 'resuming must not restart the interrupted shot');
    }
  }
});

test('steering and gas remain responsive during a shot and releasing steering still decays lateral motion', () => {
  const { run, director } = launch('manual');
  let shot;
  for (let frame = 0; frame < 120 && !shot?.active; frame++) {
    shot = director.update(1 / 120, run);
    if (!shot.active) run.update(1 / 120, GAS);
  }
  assert.equal(shot.active, true);
  const initialSpeed = run.speed;
  for (let frame = 0; frame < 50; frame++) {
    shot = director.update(1 / 120, run);
    run.update(1 / 120 * shot.timeScale, { gas:true, right:true });
  }
  assert.ok(run.offset < 0);
  assert.ok(run.speed > initialSpeed);
  const steered = Math.abs(run.lateralVelocity);
  for (let frame = 0; frame < 50; frame++) {
    shot = director.update(1 / 120, run);
    run.update(1 / 120 * shot.timeScale, GAS);
  }
  assert.equal(shot.active, true);
  assert.ok(Math.abs(run.lateralVelocity) < steered, 'the cinematic does not retain a released steering command');
});
