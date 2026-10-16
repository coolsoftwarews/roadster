import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingAudio} from '../dist/audio.js';
import {DEFAULT_SOUND_SETTINGS,SOUND_STORAGE_KEY,loadSoundSettings} from '../dist/sound-settings.js';

function memoryStorage(){
  const data=new Map();
  return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,String(value))};
}

class Param {
  constructor(value=0){this.value=value;}
  setValueAtTime(value){this.value=value;}
  setTargetAtTime(value,time,constant){this.value=value;this.target={value,time,constant};}
  exponentialRampToValueAtTime(value){this.value=value;}
}
class AudioNode {
  constructor(kind){
    this.kind=kind;this.outputs=[];this.gain=new Param(1);this.frequency=new Param();this.Q=new Param();
  }
  connect(node){this.outputs.push(node);return node;}
  disconnect(){this.outputs=[];}
  start(){this.started=true;}
  stop(){}
}
class FakeAudioContext {
  constructor(){
    this.sampleRate=128;this.currentTime=12;this.state='suspended';this.resumes=0;
    this.destination=new AudioNode('destination');this.sources=[];
  }
  createGain(){return new AudioNode('gain');}
  createBiquadFilter(){return new AudioNode('filter');}
  createDynamicsCompressor(){
    const node=new AudioNode('compressor');
    for(const name of ['threshold','knee','ratio','attack','release'])node[name]=new Param();
    return node;
  }
  createBuffer(channels,length){return {getChannelData:()=>new Float32Array(length)};}
  createOscillator(){const node=new AudioNode('tone');this.sources.push(node);return node;}
  createBufferSource(){const node=new AudioNode('noise');this.sources.push(node);return node;}
  async resume(){this.state='running';this.resumes++;}
}
// Evaluate the connected signal path: category and master gains must both affect it.
function outputGain(node){
  if(node.kind==='destination')return 1;
  return (node.kind==='gain'?node.gain.value:1)*node.outputs.reduce((sum,out)=>sum+outputGain(out),0);
}
function installAudio(t){
  const original=globalThis.AudioContext;
  globalThis.AudioContext=FakeAudioContext;
  t.after(()=>{if(original===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=original;});
}

test('sound preferences survive reloads, including muted and zero, without starting audio',()=>{
  const storage=memoryStorage();
  const audio=new DrivingAudio({storage});
  assert.equal(audio.ctx,null);assert.deepEqual(audio.settings,DEFAULT_SOUND_SETTINGS);
  audio.setVolume('engine',0);audio.setVolume('thrust',.4);audio.setEnabled(false);
  const restored=new DrivingAudio({storage});
  assert.equal(restored.ctx,null);assert.equal(restored.muted,true);
  assert.deepEqual(restored.settings,{enabled:false,engine:0,tires:.75,thrust:.4,effects:.75});
  const snapshot=restored.settings;snapshot.engine=1;
  assert.equal(restored.settings.engine,0,'settings snapshots cannot change the live mixer');
  assert.equal(restored.toggle(),false);
  assert.equal(loadSoundSettings(storage).enabled,true);
});

test('malformed or blocked storage cannot break the game, and volume input stays valid',()=>{
  const storage=memoryStorage();
  for(const value of ['invalid','null','[]','{"enabled":"false","engine":"0","tires":null}']){
    storage.setItem(SOUND_STORAGE_KEY,value);
    assert.deepEqual(loadSoundSettings(storage),DEFAULT_SOUND_SETTINGS);
  }
  storage.setItem(SOUND_STORAGE_KEY,'{"engine":-1,"tires":2,"enabled":false}');
  assert.deepEqual(loadSoundSettings(storage),{...DEFAULT_SOUND_SETTINGS,engine:0,tires:1,enabled:false});
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('full');}};
  const audio=new DrivingAudio({storage:blocked});
  assert.doesNotThrow(()=>{audio.setVolume('engine',.2);audio.setEnabled(false);});
  for(const invalid of [NaN,Infinity,'0.9',null])audio.setVolume('engine',invalid);
  audio.setEnabled('true');audio.setVolume('__proto__',1);
  assert.equal(audio.settings.engine,.2);assert.equal(audio.muted,true);
  audio.setVolume('effects',-2);assert.equal(audio.settings.effects,0);
  audio.setVolume('effects',3);assert.equal(audio.settings.effects,1);
});

test('saved mute and volumes apply on the first frame, and resume preserves them',async t=>{
  installAudio(t);
  const storage=memoryStorage();
  storage.setItem(SOUND_STORAGE_KEY,JSON.stringify({enabled:false,engine:0,tires:.3,thrust:.4,effects:.5}));
  const audio=new DrivingAudio({storage});await audio.start();
  audio.update(60,true,1,false,true);audio.thrust();
  assert.equal(audio.ctx.resumes,1);
  assert.ok(audio.ctx.sources.every(source=>outputGain(source)===0));
  audio.setEnabled(true);
  assert.ok(audio.ctx.sources.some(source=>outputGain(source)>0));
  audio.ctx.state='suspended';await audio.start();
  assert.equal(audio.ctx.resumes,2);
  assert.deepEqual(audio.settings,{enabled:true,engine:0,tires:.3,thrust:.4,effects:.5});
  audio.muted=true;
  assert.ok(audio.ctx.sources.every(source=>outputGain(source)===0));
  assert.equal(loadSoundSettings(storage).enabled,false);
});

test('engine and tire controls independently affect running continuous sounds',async t=>{
  installAudio(t);const audio=new DrivingAudio({storage:memoryStorage()});await audio.start();
  audio.update(73,true,1,false,true);
  const sources=[...audio.ctx.sources];
  assert.ok(sources.every(source=>outputGain(source)>0));
  audio.setVolume('engine',0);
  assert.ok(sources.some(source=>outputGain(source)>0),'tires stay audible with the engine off');
  assert.ok(sources.some(source=>outputGain(source)===0));
  audio.setVolume('tires',0);
  assert.ok(sources.every(source=>outputGain(source)===0),'motor, road, wind and tires all respect their mixer');
  audio.setVolume('engine',1);
  assert.ok(sources.some(source=>outputGain(source)>0));
  assert.ok(sources.some(source=>outputGain(source)===0),'turning up the engine leaves tires muted');
});

test('thrust control adjusts launch, ramp and landing sounds already playing',async t=>{
  installAudio(t);
  for(const effect of ['thrust','ramp','landingThrust']){
    const audio=new DrivingAudio({storage:memoryStorage()});await audio.start();
    const first=audio.ctx.sources.length;audio[effect]();
    const sources=audio.ctx.sources.slice(first),before=sources.map(outputGain);
    assert.ok(sources.length>0);assert.ok(before.every(gain=>gain>0));
    audio.setVolume('effects',0);audio.setVolume('engine',0);audio.setVolume('tires',0);
    assert.deepEqual(sources.map(outputGain),before,`${effect} is independent of other controls`);
    audio.setVolume('thrust',.425);
    sources.forEach((source,i)=>assert.ok(Math.abs(outputGain(source)-before[i]/2)<1e-12));
    audio.setVolume('thrust',0);
    assert.ok(sources.every(source=>outputGain(source)===0),`${effect} stops audibly during playback`);
    audio.setVolume('thrust',.85);
    assert.deepEqual(sources.map(outputGain),before);
  }
});

test('impact, landing, warning and reward effects use the independent effects control',async t=>{
  installAudio(t);
  for(const effect of ['collision','explosion','land','warning','reward']){
    const audio=new DrivingAudio({storage:memoryStorage()});await audio.start();
    audio.setVolume('engine',0);audio.setVolume('tires',0);audio.setVolume('thrust',0);
    const first=audio.ctx.sources.length;audio[effect]();const sources=audio.ctx.sources.slice(first);
    assert.ok(sources.length>0);assert.ok(sources.every(source=>outputGain(source)>0),effect);
    audio.setVolume('effects',0);
    assert.ok(sources.every(source=>outputGain(source)===0),effect);
  }
});
