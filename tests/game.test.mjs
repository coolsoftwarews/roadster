import test from 'node:test';
import assert from 'node:assert/strict';
import {Run,JUMP_DURATION,makeRamps,rampSurfaceHeight,formatTime} from '../dist/game-logic.js';
import * as THREE from '../dist/vendor/three.module.min.js';
import {chaseCameraPosition} from '../dist/driving-view.js';
const gas={gas:true};
const STEP=1/120;
function advance(run,seconds,input={}){for(let t=0;t<seconds;t+=STEP)run.update(STEP,input);}
function until(run,predicate,input=gas,limit=8){
  for(let i=0;i<limit/STEP&&!predicate();i++)run.update(STEP,input);
  assert.ok(predicate(),'simulation did not reach the expected state');
}
function landSafely(run,input=gas){
  until(run,()=>run.landingWindow,input);
  assert.equal(run.jump(),true,'descending thrust must be available');
  until(run,()=>run.jumpTime<0,input);
  assert.equal(run.state,'running');
}
function manualRun(){const r=new Run(3000);r.ramps=[];r.start();return r;}

test('coasting at the start has no deadline and does not move the car',()=>{
  const r=new Run(3000);r.start();advance(r,120);
  assert.equal(r.s,7);assert.equal(r.state,'running');assert.ok(r.time>=120);
});
test('manual thrust requires speed, rolls, and a second descending thrust lands softly',()=>{
  const r=manualRun();r.obstacles=[];assert.equal(r.jump(),false);r.speed=55;r.s=10;
  assert.equal(r.jump(),true);assert.equal(r.jump(),false);
  advance(r,JUMP_DURATION/2,gas);
  assert.ok(r.height>6);assert.ok(r.roll>2.9&&r.roll<3.5);assert.equal(r.landingWindow,false);
  landSafely(r);
  assert.equal(r.height,0);assert.equal(r.roll,0);assert.equal(r.verticalVelocity,0);
  assert.equal(r.jumpTime,-1);assert.equal(r.successfulJumps,1);
});
test('landing thrust rejects ascent, ignores launch charge, and can fire only once per flight',()=>{
  const r=manualRun();r.speed=55;r.jump();advance(r,.3,gas);
  assert.equal(r.jump(),false);assert.equal(r.landingArmed,false);
  until(r,()=>r.landingWindow);
  const velocity=r.verticalVelocity,height=r.height;r.charge=0;
  assert.ok(velocity<0);assert.equal(r.jump(),true);assert.equal(r.landingArmed,true);
  assert.equal(r.landingWindow,false);assert.equal(r.jump(),false);
  advance(r,.2,gas);
  assert.ok(r.height<height);assert.ok(r.verticalVelocity>velocity,'landing thrust slows descent');
  assert.equal(r.drainEvents().filter(e=>e.type==='landingThrust').length,1);
});
test('clearing an obstacle scores after safe landing and cannot be farmed',()=>{
  const r=manualRun(),o=r.obstacles[0];r.s=o.s-39;r.speed=55;r.jump();
  advance(r,.8,gas);assert.equal(r.score,0);landSafely(r);
  assert.equal(r.score,100);assert.equal(r.cleared,1);
  r.charge=1;r.s=o.s-39;r.speed=55;r.jump();landSafely(r);
  assert.equal(r.score,100);
});
test('a bus can be cleared with a well timed jump and landing thrust',()=>{
  const r=manualRun(),o=r.obstacles.find(o=>o.type==='bus');
  r.offset=o.offset;r.s=o.s-41;r.speed=55;r.jump();
  until(r,()=>r.landingWindow&&r.flightProgress>.85);assert.equal(r.jump(),true);
  until(r,()=>r.jumpTime<0);assert.equal(r.state,'running');
  assert.equal(o.cleared,true);assert.equal(r.score,100);
});
test('an unjumped bus explodes and awards no points',()=>{
  const r=manualRun(),o=r.obstacles.find(o=>o.type==='bus');
  r.offset=o.offset;r.s=o.s-9;r.speed=55;advance(r,.25,gas);
  assert.equal(o.hit,true);assert.equal(r.score,0);assert.equal(r.speed,0);assert.equal(r.state,'crashed');
  assert.deepEqual(r.drainEvents().filter(event=>event.type!=='checkpoint'),[{type:'explode',reason:'collision',obstacle:'bus',flightKind:null}]);
});
test('a missed landing explodes, loses pending points, and waits for recovery',()=>{
  const r=manualRun(),o=r.obstacles[0];r.s=o.s-39;r.speed=55;r.jump();
  advance(r,.8,gas);assert.ok(r.pending.has(o.id));
  advance(r,1,gas);
  assert.equal(r.state,'crashed');assert.equal(r.score,0);assert.equal(o.cleared,false);
  assert.equal(r.pending.size,0);assert.equal(r.speed,0);
  const frozen=[r.time,r.s,r.height,r.charge];advance(r,10,gas);
  assert.deepEqual([r.time,r.s,r.height,r.charge],frozen);
  assert.deepEqual(r.drainEvents().filter(e=>e.type==='explode'),[{type:'explode',reason:'landing',flightKind:'manual'}]);
  assert.equal(r.jump(),false);r.start();assert.equal(r.state,'crashed');
});
test('ramp geometry and grounded climbing agree on a curved surface',()=>{
  const r=new Run(3000),ramp=r.ramps[0];r.start();r.s=ramp.s-ramp.length/2;
  r.update(STEP,{});
  assert.equal(r.height,ramp.height/4);assert.equal(r.height,rampSurfaceHeight(ramp,r.s));
  assert.equal(r.jumpTime,-1);assert.equal(rampSurfaceHeight(ramp,ramp.s),ramp.height);
  assert.equal(rampSurfaceHeight(ramp,ramp.s-ramp.length-5),0);
  assert.deepEqual(makeRamps(1000).map(r=>r.s),[105,315,525,735,875]);
});
test('crossing a ramp lip launches automatically even at low speed without charge',()=>{
  const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
  r.s=ramp.s-.002;r.speed=2;r.charge=0;r.update(STEP,{});
  assert.equal(r.flightKind,'ramp');assert.ok(r.height>=ramp.height);
  assert.ok(r.verticalVelocity>0);assert.ok(r.jumpTime>=0);
  assert.equal(r.drainEvents().filter(e=>e.type==='ramp').length,1);
  landSafely(r);
  assert.equal(r.score,150);assert.equal(ramp.cleared,true);
});
test('ramp crossings are detected at fast speed and large frame gaps are clamped',()=>{
  const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
  r.s=ramp.s-1;r.speed=73;r.update(4,gas);
  assert.equal(r.flightKind,'ramp');assert.equal(r.time,.04);
  assert.ok(Number.isFinite(r.height));assert.ok(r.s<ramp.s+2);
});
test('driving beside a ramp or flying over it does not create a phantom ramp launch',()=>{
  const beside=new Run(3000),ramp=beside.ramps[0];beside.obstacles=[];beside.start();
  beside.s=ramp.s-2;beside.offset=ramp.offset+ramp.width/2+1;beside.speed=50;
  advance(beside,.1,gas);assert.equal(beside.jumpTime,-1);assert.equal(beside.height,0);
  const flying=new Run(3000);flying.obstacles=[];flying.start();flying.s=ramp.s-8;flying.speed=60;flying.jump();
  advance(flying,.3,gas);assert.ok(flying.s>ramp.s);assert.equal(flying.flightKind,'manual');
  assert.equal(flying.drainEvents().filter(e=>e.type==='ramp').length,0);
});
test('missing the landing thrust after a ramp explodes and grants no ramp bonus',()=>{
  const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
  r.s=ramp.s-1;r.speed=55;until(r,()=>r.flightKind==='ramp');until(r,()=>r.state==='crashed');
  assert.equal(r.score,0);assert.equal(ramp.cleared,false);
  assert.equal(r.drainEvents().filter(e=>e.type==='explode').length,1);
});
test('recovery retains score and time, resets flight, and protects previously earned points',()=>{
  const r=new Run(3000);r.start();r.checkpoint=400;r.s=500;r.score=250;r.time=25;
  r.obstacles[0].cleared=true;r.ramps[0].cleared=true;r.state='crashed';r.landingArmed=true;r.flightKind='ramp';
  assert.equal(r.recover(),true);
  assert.equal(r.state,'running');assert.equal(r.s,400);assert.equal(r.score,250);assert.equal(r.time,25);
  assert.equal(r.jumpTime,-1);assert.equal(r.landingArmed,false);assert.equal(r.flightKind,null);
  assert.equal(r.obstacles[0].cleared,true);assert.equal(r.ramps[0].cleared,true);
});
test('replaying a safely landed ramp cannot farm its bonus',()=>{
  const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
  for(let attempt=0;attempt<2;attempt++){
    r.s=ramp.s-1;r.offset=ramp.offset;r.speed=55;until(r,()=>r.flightKind==='ramp');landSafely(r);
  }
  assert.equal(r.score,150);assert.equal(r.successfulJumps,2);
});
test('airborne steering changes the landing line to camera right',()=>{
  const r=manualRun();r.speed=50;r.jump();advance(r,.7,{gas:true,right:true});
  assert.ok(r.offset< -2);assert.ok(r.height>5);
});
test('pause freezes time, motion, thruster recharge and the landing window',()=>{
  const r=manualRun();r.speed=40;r.jump();until(r,()=>r.landingWindow);r.state='paused';
  const before=[r.time,r.s,r.charge,r.jumpTime,r.landingWindow,r.height];advance(r,10,gas);
  assert.deepEqual([r.time,r.s,r.charge,r.jumpTime,r.landingWindow,r.height],before);
});
test('leaving the road restores the latest checkpoint without erasing score',()=>{
  const r=new Run(3000);r.start();r.checkpoint=400;r.s=450;r.offset=20;r.score=100;advance(r,.1,gas);
  assert.ok(r.s>=400&&r.s<401);assert.equal(r.offset,0);assert.equal(r.score,100);
});
test('the finish waits for a safe landing and an airborne impact cannot finish the run',()=>{
  const safe=manualRun();safe.s=2980;safe.speed=60;safe.jump();advance(safe,.3,gas);
  assert.ok(safe.s>=safe.length-12);assert.equal(safe.state,'running');
  until(safe,()=>safe.landingWindow);safe.jump();until(safe,()=>safe.state==='finished');
  assert.equal(safe.jumpTime,-1);assert.equal(safe.drainEvents().filter(e=>e.type==='finish').length,1);
  const missed=manualRun();missed.s=2980;missed.speed=60;missed.jump();advance(missed,2,gas);
  assert.equal(missed.state,'crashed');assert.equal(missed.drainEvents().filter(e=>e.type==='finish').length,0);
});
test('finishing produces one finish event and restart resets ramps and flight state',()=>{
  const r=new Run(3000);r.start();r.s=2987;r.speed=60;advance(r,.2,gas);
  assert.equal(r.state,'finished');assert.equal(r.drainEvents().filter(e=>e.type==='finish').length,1);
  r.ramps[0].cleared=true;r.landingArmed=true;r.reset();
  assert.equal(r.score,0);assert.equal(r.time,0);assert.equal(r.state,'ready');assert.equal(r.cleared,0);
  assert.equal(r.ramps[0].cleared,false);assert.equal(r.landingArmed,false);assert.equal(r.nextRamp(),r.ramps[0]);
});
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


test('leaving either ramp side creates a rescuable falling flight instead of teleporting',()=>{
  for(const direction of [-1,1]){
    const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
    r.s=ramp.s-ramp.length*.65;r.offset=ramp.offset+direction*(ramp.width/2-.005);
    r.speed=20;r.height=rampSurfaceHeight(ramp,r.s);const priorHeight=r.height;
    r.lateralVelocity=direction*7;r.update(.04,{gas:true,[direction===1?'left':'right']:true});
    assert.equal(r.flightKind,'ramp');assert.ok(r.jumpTime>=0);assert.ok(r.height>priorHeight*.9);
    assert.equal(r.landingWindow,true);assert.equal(r.rampId,null);
    advance(r,.3,gas);assert.equal(r.state,'running');assert.equal(r.landingWindow,true);
    assert.equal(r.jump(),true);until(r,()=>r.jumpTime<0);
    assert.equal(r.state,'running');assert.equal(r.score,0);assert.equal(ramp.cleared,false);
  }
});
test('missing a side-fall landing burns no ramp bonus and tiny curb-height drops stay grounded',()=>{
  for(const height of [.05,.25,2]){
    const r=new Run(3000),ramp=r.ramps[0];r.obstacles=[];r.start();
    r.s=ramp.s-ramp.length+ramp.length*Math.sqrt(height/ramp.height);
    r.offset=ramp.offset+ramp.width/2-.005;r.speed=20;r.height=height;r.lateralVelocity=7;
    r.update(.04,{gas:true,left:true});
    if(height<=.2){assert.equal(r.jumpTime,-1);assert.equal(r.height,0);assert.equal(r.state,'running');}
    else{until(r,()=>r.state==='crashed');assert.equal(r.score,0);assert.equal(ramp.cleared,false);}
  }
});
test('each of all five ramp bonuses is awarded once across repeated successful attempts',()=>{
  const r=new Run(3000);r.obstacles=[];r.start();
  for(const ramp of r.ramps){
    for(let attempt=0;attempt<2;attempt++){
      r.s=ramp.s-1;r.offset=ramp.offset;r.speed=55;r.lateralVelocity=0;
      until(r,()=>r.flightKind==='ramp');landSafely(r);
    }
  }
  assert.equal(r.score,5*150);assert.ok(r.ramps.every(ramp=>ramp.cleared));
});

for(const type of ['car','bus','barrier','pothole']){
  test(type+': ground and low airborne impacts explode once, including previously cleared hazards',()=>{
    for(const cleared of [false,true])for(const airborne of [false,true]){
      const run=new Run(1000,{obstacles:[[.5,type,0]],ramps:[]});run.start();
      const obstacle=run.obstacles[0];obstacle.cleared=cleared;
      run.s=obstacle.s;run.speed=30;run.score=350;run.cleared=cleared?1:0;run.time=20;
      run.pending.add(obstacle.id);if(airborne)run.jump();
      run.update(STEP,{gas:true});
      assert.equal(run.state,'crashed');assert.equal(run.speed,0);assert.equal(run.lateralVelocity,0);
      assert.equal(run.pending.size,0);assert.equal(run.score,350);assert.equal(obstacle.cleared,cleared);
      assert.equal(run.successfulJumps,0);assert.equal(run.landingWindow,false);assert.equal(run.landingArmed,false);
      const frozen=[run.s,run.height,run.time,run.charge];advance(run,3,{gas:true});
      assert.deepEqual([run.s,run.height,run.time,run.charge],frozen);
      assert.deepEqual(run.drainEvents().filter(event=>event.type!=='jump'),[{type:'explode',reason:'collision',obstacle:type,flightKind:airborne?'manual':null}]);
      assert.equal(run.recover(),true);assert.equal(run.state,'running');assert.equal(run.score,350);
      assert.equal(run.time,frozen[2]);assert.equal(run.jumpTime,-1);assert.equal(obstacle.hit,false);
      run.update(STEP,{gas:true});assert.equal(run.state,'running');
    }
  });
}

test('a collision on the landing frame cancels awards and cannot also land or finish',()=>{
  const run=new Run(1000,{obstacles:[[.992,'car',0],[.992,'barrier',0]],ramps:[]});run.start();
  run.speed=0;run.s=992;run.score=250;run.cleared=2;
  run._launch('manual',0,1);run._flightDuration=STEP;
  run.pending.add(run.obstacles[0].id);run.landingArmed=true;
  run._landingHeight=.001;run._landingVelocity=-1;run._landingDuration=STEP;run._landingProgress=.99;
  run.update(STEP);
  assert.equal(run.state,'crashed');assert.equal(run.score,250);assert.equal(run.cleared,2);
  assert.equal(run.pending.size,0);assert.equal(run.successfulJumps,0);
  assert.deepEqual(run.drainEvents().filter(event=>event.type!=='jump'),[{type:'explode',reason:'collision',obstacle:'car',flightKind:'manual'}]);
});
