import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {DIFFICULTIES,getDifficulty} from '../dist/difficulty.js';
import {Run,MAX_SPEED,RECHARGE_TIME,LANDING_WINDOW_START,ROAD_WIDTH,JUMP_DURATION,makeObstacles,rampSurfaceHeight} from '../dist/game-logic.js';
import {TRACKS} from '../dist/tracks.js';

const STEP=1/120;
function lengthOf(track){
  const curve=new THREE.CatmullRomCurve3(track.controls.map(point=>new THREE.Vector3(...point)),false,'centripetal');
  curve.arcLengthDivisions=2500;
  return curve.getLength();
}
function advance(run,seconds,input={}){for(let step=0;step<Math.round(seconds/STEP);step++)run.update(STEP,input);}
function until(run,predicate,input={gas:true},seconds=10){
  for(let step=0;step<seconds/STEP&&!predicate();step++)run.update(STEP,input);
  assert.ok(predicate(),'simulation reached the expected state');
}
function clearRun(difficulty){const run=new Run(10000,{obstacles:[],ramps:[]},difficulty);run.obstacles=[];run.start();return run;}

test('difficulty defaults to Easy and preserves all original settings and layouts',()=>{
  assert.deepEqual(DIFFICULTIES.map(item=>item.id),['easy','medium','hard']);
  assert.equal(getDifficulty('unknown').id,'easy');assert.equal(getDifficulty().id,'easy');
  const easy=getDifficulty('easy');
  assert.equal(easy.maxSpeed,MAX_SPEED);assert.equal(easy.rechargeTime,RECHARGE_TIME);
  assert.equal(easy.landingWindowStart,LANDING_WINDOW_START);assert.equal(easy.checkpointSpacing,400);
  assert.equal(new Run(3000,{},'missing').difficulty.id,'easy');
  assert.deepEqual(new Run(3000).obstacles,makeObstacles(3000));
  for(const track of TRACKS){
    const length=lengthOf(track),run=new Run(length,track,'easy');
    assert.deepEqual(run.obstacles,makeObstacles(length,track.obstacles));
    assert.deepEqual(run.ramps.map(ramp=>[ramp.s,ramp.offset]),track.ramps.map(([fraction,offset])=>[fraction*length,offset]));
  }
});

test('difficulty changes speed and checkpoints while thrust timing stays responsive in every mode',()=>{
  const observations=[];
  for(const difficulty of DIFFICULTIES){
    const speed=clearRun(difficulty.id);advance(speed,20,{gas:true});
    assert.equal(speed.speed,difficulty.maxSpeed);
    const charging=clearRun(difficulty.id);charging.charge=0;advance(charging,1);
    assert.ok(Math.abs(charging.charge-1/difficulty.rechargeTime)<1e-10);
    const checkpoint=clearRun(difficulty.id);checkpoint.s=650;checkpoint.update(STEP);
    assert.equal(checkpoint.checkpoint,difficulty.id==='easy'?400:difficulty.id==='medium'?600:7);
    checkpoint.s=850;checkpoint.update(STEP);assert.equal(checkpoint.checkpoint,difficulty.id==='medium'?600:800);
    const flight=clearRun(difficulty.id);flight.speed=40;assert.equal(flight.jump(),true);
    until(flight,()=>flight.landingWindow);
    assert.ok(flight.flightProgress>=difficulty.landingWindowStart);
    assert.ok(flight.flightProgress<difficulty.landingWindowStart+STEP/JUMP_DURATION+.001);
    observations.push({speed:speed.speed,charge:charging.charge,cue:flight.jumpTime});
    assert.equal(flight.jump(),true);until(flight,()=>flight.jumpTime<0);assert.equal(flight.state,'running');
  }
  for(let i=1;i<observations.length;i++){
    assert.ok(observations[i].speed>observations[i-1].speed);
    assert.equal(observations[i].charge,observations[0].charge);
    assert.equal(observations[i].cue,observations[0].cue);
  }
});

for(const track of TRACKS){
  test(`${track.id}: added traffic is deterministic, separated, and outside ramp safety zones`,()=>{
    const original=JSON.stringify(track),length=lengthOf(track);
    const runs=DIFFICULTIES.map(difficulty=>new Run(length,track,difficulty.id));
    assert.deepEqual(runs.map(run=>run.obstacles.length),[18,24,30]);
    const basePositions=new Set(runs[0].obstacles.map(obstacle=>obstacle.s));
    const signature=obstacle=>[obstacle.s,obstacle.type,obstacle.offset].join(':');
    for(const run of runs){
      assert.deepEqual(run.obstacles,new Run(length,track,run.difficulty.id).obstacles);
      for(let index=0;index<run.obstacles.length;index++){
        const item=run.obstacles[index];assert.equal(item.id,index);
        assert.ok([item.s,item.offset,item.width,item.height,item.length].every(Number.isFinite));
        assert.ok(item.s>30&&item.s<length-30);
        assert.ok(Math.abs(item.offset)+item.width/2<ROAD_WIDTH/2);
        if(index)assert.ok(item.s>run.obstacles[index-1].s);
        if(basePositions.has(item.s))continue;
        for(const ramp of run.ramps)assert.ok(item.s+item.length/2<ramp.s-60||item.s-item.length/2>ramp.s+170,'entire extra obstacle stays clear of ramp approach and landing');
        for(const other of run.obstacles)if(item!==other)assert.ok(Math.abs(item.s-other.s)-(item.length+other.length)/2>=48-1e-8,'extra traffic leaves reaction and steering distance');
      }
      run.obstacles[0].cleared=true;run.reset();assert.ok(run.obstacles.every(item=>!item.cleared));
    }
    const hardSignatures=new Set(runs[2].obstacles.map(signature));
    assert.ok(runs[1].obstacles.every(item=>hardSignatures.has(signature(item))));
    assert.equal(JSON.stringify(track),original,'track definitions stay unmodified');
  });
}

for(const difficulty of DIFFICULTIES){
  test(`${difficulty.name}: missing a landing still explodes; side drops retain an immediate rescue window`,()=>{
    const missed=clearRun(difficulty.id);missed.speed=40;missed.jump();advance(missed,2,{gas:true});
    assert.equal(missed.state,'crashed');assert.equal(missed.score,0);
    assert.equal(missed.drainEvents().filter(event=>event.type==='explode').length,1);
    const side=new Run(3000,{},difficulty.id),ramp=side.ramps[0];side.obstacles=[];side.start();
    side.s=ramp.s-ramp.length*.65;side.offset=ramp.offset+ramp.width/2-.005;
    side.speed=20;side.height=rampSurfaceHeight(ramp,side.s);side.lateralVelocity=7;
    side.update(.04,{gas:true,left:true});assert.equal(side.landingWindow,true);
    advance(side,.3,{gas:true});assert.equal(side.jump(),true);
    until(side,()=>side.jumpTime<0);assert.equal(side.state,'running');assert.equal(side.score,0);
  });
}

function driveCourse(track,difficulty){
  const run=new Run(lengthOf(track),track,difficulty.id);run.start();
  const events=[];let jumpTarget=null;
  for(let step=0;step<200/STEP&&run.state==='running';step++){
    if(run.landingWindow&&run.flightProgress>.88)run.jump();
    const obstacle=run.obstacles.find(item=>!item.cleared&&item.s+item.length/2+4>run.s);
    const ramp=run.ramps.find(item=>!item.cleared&&item.s>run.s);
    let target=0;
    if(run.jumpTime>=0&&jumpTarget!==null&&run.s<jumpTarget.until)target=jumpTarget.offset;
    else{
      jumpTarget=null;
      if(ramp&&(!obstacle||ramp.s<obstacle.s))target=ramp.offset;
      else if(obstacle){
        const distance=obstacle.s-run.s;
        const willRecharge=distance>29+Math.max(0,1-run.charge)*difficulty.rechargeTime*41;
        if(distance>20&&(run.charge>=.999||willRecharge)){
          target=obstacle.offset;
          if(distance<29&&distance>20&&Math.abs(run.offset-target)<.7&&run.charge>=.999&&run.jump())jumpTarget={offset:target,until:obstacle.s+obstacle.length/2+4};
        }else target=obstacle.offset<=0?7.6:-7.6;
      }
    }
    const predictedError=target-run.offset-run.lateralVelocity*.15;
    run.update(STEP,{gas:run.speed<40,brake:run.speed>41,left:predictedError>.18,right:predictedError<-.18});
    events.push(...run.drainEvents());
    assert.ok([run.s,run.offset,run.speed,run.height].every(Number.isFinite));
  }
  return {run,events};
}

for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
  test(`${track.id} / ${difficulty.name}: a controlled full course can finish with landing burns`,()=>{
    const {run,events}=driveCourse(track,difficulty);
    assert.equal(run.state,'finished',`ended at ${run.s.toFixed(1)}m after ${run.time.toFixed(1)}s`);
    assert.equal(events.filter(event=>event.type==='explode').length,0);
    assert.equal(events.filter(event=>event.type==='recover').length,0);
    assert.equal(events.filter(event=>event.type==='finish').length,1);
    assert.ok(run.successfulJumps>=5,'route exercises repeated landing timing');
    assert.equal(run.score,run.cleared*100+run.ramps.filter(ramp=>ramp.cleared).length*150,'point values stay unchanged');
    assert.equal(run.jumpTime,-1);
  });
}

for(const difficulty of DIFFICULTIES){
  test(difficulty.name+': launch and descending thrust respond immediately without buffered input',()=>{
    const run=clearRun(difficulty.id);run.speed=40;run.charge=0;
    assert.equal(run.jump(),false);advance(run,RECHARGE_TIME,{gas:true});
    assert.equal(run.jumpTime,-1,'a rejected press must not queue a later launch');
    assert.ok(Math.abs(run.charge-1)<1e-12);assert.equal(run.jump(),true);
    assert.equal(run.jumpTime,0);assert.ok(run.verticalVelocity>0);
    assert.deepEqual(run.drainEvents().map(event=>event.type),['jump']);
    advance(run,JUMP_DURATION*.60,{gas:true});assert.equal(run.jump(),false);
    assert.equal(run.landingArmed,false);until(run,()=>run.landingWindow);
    assert.ok(run.flightProgress<.63,'all modes accept the same early descent burn');
    run.charge=0;assert.equal(run.jump(),true);assert.equal(run.landingArmed,true);
    assert.equal(run.landingWindow,false);assert.equal(run.jump(),false);
    assert.deepEqual(run.drainEvents().map(event=>event.type),['landingThrust']);
    until(run,()=>run.jumpTime<0);assert.equal(run.state,'running');
    assert.equal(run.drainEvents().filter(event=>event.type==='land').length,1);
  });
}

test('every circuit checkpoint recovers clear of solid obstacles, including previously scored hazards',()=>{
  let shifted=0;
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
    const run=new Run(lengthOf(track),track,difficulty.id);run.start();
    for(const obstacle of run.obstacles)obstacle.cleared=true;
    for(let checkpoint=difficulty.checkpointSpacing;checkpoint<run.length;checkpoint+=difficulty.checkpointSpacing){
      run.checkpoint=checkpoint;run.state='crashed';run.score=700;run.time=25;
      assert.equal(run.recover(),true);
      if(run.s<checkpoint)shifted++;
      for(const obstacle of run.obstacles){
        assert.ok(Math.abs(run.s-obstacle.s)>=obstacle.length/2+2.5||Math.abs(obstacle.offset)>=obstacle.width/2+1.1,'recovery never intersects a hazard');
      }
      advance(run,.5,{gas:true});assert.equal(run.state,'running',track.id+' / '+difficulty.id+' checkpoint '+checkpoint);
      assert.equal(run.score,700);assert.ok(run.time>25);
    }
  }
  assert.ok(shifted>0,'real circuit checkpoints exercise the recovery placement correction');
});
