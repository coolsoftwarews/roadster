import test from 'node:test';
import assert from 'node:assert/strict';
import {Run,JUMP_DURATION,formatTime} from '../dist/game-logic.js';
import * as THREE from '../dist/vendor/three.module.min.js';
import {chaseCameraPosition} from '../dist/driving-view.js';
const gas={gas:true};
function advance(run,seconds,input={}){for(let t=0;t<seconds;t+=1/120)run.update(1/120,input);}
test('coasting at the start has no deadline and does not move the car',()=>{const r=new Run(3000);r.start();advance(r,120);assert.equal(r.s,7);assert.equal(r.state,'running');assert.ok(r.time>=120);});
test('thrust requires speed, rolls once, and returns to road level',()=>{const r=new Run(3000);r.start();assert.equal(r.jump(),false);r.speed=55;r.s=10;assert.equal(r.jump(),true);assert.equal(r.jump(),false);advance(r,JUMP_DURATION/2,gas);assert.ok(r.height>6);assert.ok(r.roll>2.9&&r.roll<3.5);advance(r,JUMP_DURATION/2+.05,gas);assert.equal(r.height,0);assert.equal(r.roll,0);assert.equal(r.jumpTime,-1);});
test('clearing an obstacle scores after landing and cannot be farmed',()=>{const r=new Run(3000);r.start();const o=r.obstacles[0];r.s=o.s-39;r.speed=55;r.jump();advance(r,.8,gas);assert.equal(r.score,0);advance(r,1,gas);assert.equal(r.score,100);assert.equal(r.cleared,1);r.charge=1;r.s=o.s-39;r.speed=55;r.jump();advance(r,1.8,gas);assert.equal(r.score,100);});
test('a bus can be cleared with a well timed jump',()=>{const r=new Run(3000);r.start();const o=r.obstacles.find(o=>o.type==='bus');r.offset=o.offset;r.s=o.s-41;r.speed=55;r.jump();advance(r,1.8,gas);assert.equal(o.cleared,true);assert.equal(r.score,100);});
test('an unjumped bus causes collision and awards no points',()=>{const r=new Run(3000);r.start();const o=r.obstacles.find(o=>o.type==='bus');r.offset=o.offset;r.s=o.s-9;r.speed=55;advance(r,.25,gas);assert.equal(o.hit,true);assert.equal(r.score,0);assert.ok(r.speed<25);});
test('airborne steering changes the landing line to camera right',()=>{const r=new Run(3000);r.start();r.speed=50;r.jump();advance(r,.7,{gas:true,right:true});assert.ok(r.offset< -2);assert.ok(r.height>5);});
test('pause freezes time, motion and thruster recharge',()=>{const r=new Run(3000);r.start();r.speed=40;r.jump();r.state='paused';const before=[r.time,r.s,r.charge,r.jumpTime];advance(r,10,gas);assert.deepEqual([r.time,r.s,r.charge,r.jumpTime],before);});
test('leaving the road restores the latest checkpoint without erasing score',()=>{const r=new Run(3000);r.start();r.checkpoint=400;r.s=450;r.offset=20;r.score=100;advance(r,.1,gas);assert.ok(r.s>=400&&r.s<401);assert.equal(r.offset,0);assert.equal(r.score,100);});
test('finishing produces one finish event and restart resets the run',()=>{const r=new Run(3000);r.start();r.s=2987;r.speed=60;advance(r,.2,gas);assert.equal(r.state,'finished');assert.equal(r.drainEvents().filter(e=>e.type==='finish').length,1);r.reset();assert.equal(r.score,0);assert.equal(r.time,0);assert.equal(r.state,'ready');assert.equal(r.cleared,0);});
test('clock formatting handles minute transitions',()=>{assert.equal(formatTime(0),'00:00.0');assert.equal(formatTime(65.4),'01:05.4');});

for (const direction of ['left', 'right']) {
  test(direction + ' steering stays visibly ' + direction + ' around corners and in flight', () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      for (const airborne of [false, true]) {
        const r = new Run(3000); r.start(); r.speed = 50;
        if (airborne) r.jump();
        advance(r, .55, {gas: true, [direction]: true});
        const center = new THREE.Vector3(30, 10, 50);
        const forward = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
        const lateral = new THREE.Vector3(forward.z, 0, -forward.x);
        const car = center.clone().addScaledVector(lateral, r.offset);
        car.y += r.height + .04;
        const target = car.clone().addScaledVector(forward, 9);
        target.y = center.y + 1.5;
        const camera = new THREE.PerspectiveCamera(58, 16 / 9, .2, 2200);
        camera.position.copy(chaseCameraPosition(center, forward, lateral, r.offset, r.height, r.speed));
        camera.lookAt(target); camera.updateMatrixWorld();
        const screenX = car.clone().project(camera).x;
        assert.ok(direction === 'left' ? screenX < -.01 : screenX > .01,
          direction + ' must appear on the correct side of the screen, got ' + screenX);
      }
    }
  });
}
