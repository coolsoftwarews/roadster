import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {Run, ROAD_WIDTH, RECHARGE_TIME} from '../dist/game-logic.js';
import {TRACKS, getTrack} from '../dist/tracks.js';

const STEP = 1 / 120;
function geometry(track) {
  const curve = new THREE.CatmullRomCurve3(track.controls.map(point => new THREE.Vector3(...point)), false, 'centripetal');
  curve.arcLengthDivisions = 2500;
  return {curve, length: curve.getLength()};
}

test('six distinct selectable tracks have usable road geometry', () => {
  assert.equal(TRACKS.length, 6);
  assert.equal(new Set(TRACKS.map(track => track.id)).size, 6);
  assert.equal(getTrack('missing'), TRACKS[0]);
  const signatures = new Set();
  for (const track of TRACKS) {
    assert.equal(getTrack(track.id), track);
    const {curve, length} = geometry(track);
    assert.ok(length > 2500 && length < 6000, `${track.id}: usable course length ${length}`);
    const points = Array.from({length: 401}, (_, index) => curve.getPointAt(index / 400));
    for (let index = 0; index < points.length; index++) {
      assert.ok(points[index].toArray().every(Number.isFinite), `${track.id}: finite road point`);
      assert.ok(points[index].x > -800 && points[index].x < 1400 && points[index].z > -600 && points[index].z < 1900, `${track.id}: road stays on the terrain`);
      const tangent = curve.getTangentAt(index / 400);
      assert.ok(tangent.toArray().every(Number.isFinite), `${track.id}: finite road direction`);
      assert.ok(Math.hypot(tangent.x, tangent.z) > .9, `${track.id}: driveable road grade`);
      if (index) assert.ok(points[index].distanceTo(points[index - 1]) < length / 400 * 1.05, `${track.id}: continuous road`);
    }
    signatures.add(points.filter((_, i) => i % 40 === 0).map(point => point.toArray().map(value => value.toFixed(1)).join(',')).join(';'));
    // Exclude neighboring samples along the same road. Separate sections at road
    // height must leave room for both road surfaces and their shoulders.
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        if ((j - i) * length / 400 < 70 || Math.abs(points[i].y - points[j].y) >= 8) continue;
        const separation = Math.hypot(points[i].x - points[j].x, points[i].z - points[j].z);
        assert.ok(separation > ROAD_WIDTH + 4, `${track.id}: overlapping road sections at ${i / 400} and ${j / 400} (${separation.toFixed(1)}m)`);
      }
    }
  }
  assert.equal(signatures.size, 6, 'each track has a different physical route');
});

for (const track of TRACKS) {
  test(`${track.id}: hazards and ramps are ordered, in bounds, and used by the run`, () => {
    const {length} = geometry(track);
    const run = new Run(length, track);
    assert.equal(run.obstacles.length, track.obstacles.length);
    assert.equal(run.ramps.length, track.ramps.length);
    for (const [items, definitions] of [[run.obstacles, track.obstacles], [run.ramps, track.ramps]]) {
      for (let index = 0; index < items.length; index++) {
        const item = items[index];
        assert.equal(item.s, definitions[index][0] * length);
        assert.ok(item.s - item.length > 20 && item.s + item.length < length - 12, 'feature stays inside the playable track');
        assert.ok(Math.abs(item.offset) + item.width / 2 < ROAD_WIDTH / 2, 'feature fits on the road');
        if (index) assert.ok(item.s > items[index - 1].s, 'features are sorted for next-feature guidance');
        if (item.type) {
          assert.equal(item.type, definitions[index][1]);
          assert.equal(item.offset, definitions[index][2]);
        } else assert.equal(item.offset, definitions[index][1]);
      }
    }
  });

  test(`${track.id}: recovery retains this course and earned points; reset starts the same course cleanly`, () => {
    const {length} = geometry(track);
    const run = new Run(length, track);
    const layout = () => [run.obstacles.map(({s,type,offset}) => [s,type,offset]), run.ramps.map(({s,offset}) => [s,offset])];
    const initialLayout = layout();
    run.start(); run.checkpoint = 400; run.s = 520; run.score = 250; run.time = 24;
    run.obstacles[0].cleared = true; run.ramps[0].cleared = true; run.cleared = 1;
    run.state = 'crashed';
    assert.equal(run.recover(), true);
    assert.deepEqual(layout(), initialLayout);
    assert.equal(run.s, 400); assert.equal(run.score, 250); assert.equal(run.time, 24);
    assert.equal(run.obstacles[0].cleared, true); assert.equal(run.ramps[0].cleared, true);
    run.reset();
    assert.deepEqual(layout(), initialLayout);
    assert.equal(run.length, length); assert.equal(run.state, 'ready');
    assert.equal(run.score, 0); assert.equal(run.time, 0); assert.equal(run.cleared, 0);
    assert.ok(run.obstacles.every(obstacle => !obstacle.hit && !obstacle.cleared));
    assert.ok(run.ramps.every(ramp => !ramp.cleared));
    // A replay's mutable flags must not leak into a newly created run.
    const another = new Run(length, track);
    run.obstacles[0].cleared = true;
    assert.equal(another.obstacles[0].cleared, false);
  });
}

function driveCourse(track) {
  const {length} = geometry(track);
  const run = new Run(length, track);
  run.start();
  const events = [];
  let jumpTarget = null;
  for (let step = 0; step < 180 / STEP && run.state === 'running'; step++) {
    if (run.landingWindow && run.flightProgress > .85) assert.equal(run.jump(), true, 'landing control is available');
    const obstacle = run.obstacles.find(item => !item.cleared && item.s + item.length / 2 + 4 > run.s);
    const ramp = run.ramps.find(item => !item.cleared && item.s > run.s);
    let target = 0;
    if (run.jumpTime >= 0 && jumpTarget !== null && run.s < jumpTarget.until) target = jumpTarget.offset;
    else {
      jumpTarget = null;
      if (ramp && (!obstacle || ramp.s < obstacle.s)) target = ramp.offset;
      else if (obstacle) {
        const distance = obstacle.s - run.s;
        const willRecharge = distance > 29 + Math.max(0, 1 - run.charge) * RECHARGE_TIME * 41;
        if (distance > 20 && (run.charge >= .999 || willRecharge)) {
          target = obstacle.offset;
          if (distance < 29 && distance > 20 && Math.abs(run.offset - target) < .7 && run.charge >= .999) {
            if (run.jump()) jumpTarget = {offset: target, until: obstacle.s + obstacle.length / 2 + 4};
          }
        } else target = obstacle.offset <= 0 ? 7.6 : -7.6;
      }
    }
    const error = target - run.offset;
    const predictedError = error - run.lateralVelocity * .15;
    run.update(STEP, {gas: run.speed < 40, brake: run.speed > 41, left: predictedError > .18, right: predictedError < -.18});
    events.push(...run.drainEvents().map(event => ({...event, at: run.s / length, offset: run.offset, height: run.height})));
    assert.ok([run.s, run.offset, run.speed, run.height].every(Number.isFinite), 'simulation remains finite');
  }
  return {run, events};
}

for (const track of TRACKS.slice(1)) {
  test(`${track.id}: a full run can finish with every ramp safely landed`, () => {
    const {run, events} = driveCourse(track);
    assert.equal(run.state, 'finished', `${track.id}: completed before simulation limit`);
    assert.equal(events.filter(event => event.type === 'explode').length, 0);
    assert.equal(events.filter(event => event.type === 'recover').length, 0);
    assert.equal(events.filter(event => event.type === 'hit').length, 0, `${track.id}: controlled route avoids collisions ${JSON.stringify(events.filter(event => event.type === 'hit'))}`);
    assert.equal(events.filter(event => event.type === 'finish').length, 1);
    assert.equal(run.ramps.filter(ramp => ramp.cleared).length, track.ramps.length, `${track.id}: ramp flags ${run.ramps.map(r => r.cleared)}`);
    assert.ok(run.cleared >= 10, `${track.id}: substantial obstacle clearances (${run.cleared})`);
    assert.equal(run.score, run.cleared * 100 + track.ramps.length * 150);
    assert.equal(run.jumpTime, -1);
  });
}
