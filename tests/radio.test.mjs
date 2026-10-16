import test from 'node:test';
import assert from 'node:assert/strict';
import {RADIO_STORAGE_KEY,STATIONS,RoadTripRadio,loadRadioSettings} from '../dist/radio.js';

function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}
class FakeAudio {
  constructor(){
    this.listeners=new Map();this.volume=1;this.src='';this.paused=true;this.loads=0;
    this.promise=new Promise((resolve,reject)=>{this.resolvePlay=resolve;this.rejectPlay=reject;});
  }
  addEventListener(name,listener){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(listener);}
  removeEventListener(name,listener){this.listeners.get(name)?.delete(listener);}
  emit(name){for(const listener of [...(this.listeners.get(name)||[])])listener();}
  play(){this.paused=false;return this.promise;}
  pause(){this.paused=true;}
  removeAttribute(name){if(name==='src')this.src='';}
  load(){this.loads++;}
  start(){this.emit('playing');this.resolvePlay();}
}
function setup(storage=memoryStorage()){
  const audios=[],changes=[];
  const radio=new RoadTripRadio({storage,audioFactory:()=>{const audio=new FakeAudio();audios.push(audio);return audio;},onChange:state=>changes.push(state)});
  return {radio,audios,changes,storage};
}

test('radio restores valid preferences without creating audio or autoplaying',()=>{
  const storage=memoryStorage();
  assert.deepEqual(loadRadioSettings(storage),{stationId:'rock',volume:.3,enabled:false});
  storage.setItem(RADIO_STORAGE_KEY,JSON.stringify({stationId:'country',volume:.45,enabled:true}));
  const {radio,audios,changes}=setup(storage);
  assert.equal(audios.length,0);assert.equal(changes.length,0);
  assert.deepEqual(radio.state,{stationId:'country',volume:.45,enabled:true,status:'suspended',error:'',stationName:'181.FM Highway 181'});
  for(const value of ['bad json','null','[]','{"stationId":"unknown","volume":"1","enabled":"true"}']){
    storage.setItem(RADIO_STORAGE_KEY,value);
    assert.deepEqual(loadRadioSettings(storage),{stationId:'rock',volume:.3,enabled:false});
  }
  const blocked={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  const blockedRadio=setup(blocked).radio;
  assert.doesNotThrow(()=>{blockedRadio.setVolume(.6);blockedRadio.stop();});
  assert.equal(blockedRadio.state.volume,.6);
});

test('volume and station persist while off; volume clamps without affecting enabled',async()=>{
  const {radio,audios,storage}=setup();
  await radio.selectStation('love');radio.setVolume(.72);
  assert.deepEqual(loadRadioSettings(storage),{stationId:'love',volume:.72,enabled:false});
  assert.equal(audios.length,0);
  await radio.selectStation('invalid');assert.equal(radio.state.stationId,'love');
  radio.setVolume(Infinity);radio.setVolume('0.2');assert.equal(radio.state.volume,.72);
  radio.setVolume(2);assert.equal(radio.state.volume,1);
  radio.setVolume(-1);assert.equal(radio.state.volume,0);
  const playing=radio.play(),audio=audios[0];
  assert.equal(audio.preload,'none');assert.equal(audio.src,STATIONS.find(s=>s.id==='love').src);
  assert.equal(audio.volume,0);assert.equal(radio.state.status,'connecting');
  audio.start();assert.equal(await playing,true);
  radio.setVolume(.4);assert.equal(audio.volume,.4);assert.equal(radio.state.enabled,true);
  assert.equal(radio.state.status,'playing');
});

test('off unloads the live stream, preserves selection and volume, and cannot be undone by a late promise',async()=>{
  const {radio,audios,storage}=setup();
  await radio.selectStation('rap');radio.setVolume(.22);
  const playing=radio.play(),old=audios[0];
  radio.stop();old.emit('playing');old.resolvePlay();
  assert.equal(await playing,false);
  assert.equal(old.paused,true);assert.equal(old.src,'');assert.equal(old.loads,1);
  assert.equal([...old.listeners.values()].reduce((sum,set)=>sum+set.size,0),0);
  assert.equal(radio.state.status,'off');assert.equal(radio.state.enabled,false);
  assert.deepEqual(loadRadioSettings(storage),{stationId:'rap',volume:.22,enabled:false});
  assert.equal(await radio.resume(),false);assert.equal(audios.length,1);
});

test('switching stations ignores old playback events and rejected promises',async()=>{
  const {radio,audios}=setup();
  const first=radio.play(),old=audios[0];
  const second=radio.selectStation('country'),current=audios[1];
  assert.equal(old.src,'');assert.equal(old.paused,true);
  old.emit('playing');old.rejectPlay(Error('old request aborted'));
  assert.equal(await first,false);assert.equal(radio.state.status,'connecting');
  current.start();assert.equal(await second,true);
  old.emit('error');old.emit('waiting');
  assert.equal(radio.state.status,'playing');assert.equal(radio.state.stationId,'country');
  assert.equal(current.src,STATIONS.find(s=>s.id==='country').src);
});

test('late fulfilled play promise cannot replace the current station status',async()=>{
  const {radio,audios}=setup();
  const first=radio.play(),old=audios[0];
  const second=radio.selectStation('love'),current=audios[1];
  current.emit('waiting');old.start();
  assert.equal(await first,false);assert.equal(radio.state.status,'buffering');
  current.start();assert.equal(await second,true);assert.equal(radio.state.status,'playing');
});

test('play rejection reports an actionable error and explicit retry uses a fresh stream',async()=>{
  const {radio,audios}=setup();
  const denied=radio.play(),first=audios[0];
  first.rejectPlay(Object.assign(new Error('gesture required'),{name:'NotAllowedError'}));
  assert.equal(await denied,false);assert.equal(radio.state.status,'error');
  assert.match(radio.state.error,/Press Play/);assert.equal(first.src,'');assert.equal(first.paused,true);
  const retried=radio.play(),second=audios[1];
  assert.equal(radio.state.error,'');assert.equal(radio.state.status,'connecting');
  second.resolvePlay();await retried;
  assert.equal(radio.state.status,'connecting','promise resolution alone is not proof of playing audio');
  second.emit('playing');assert.equal(radio.state.status,'playing');
});

test('stream buffering and failures are visible without automatic retry loops',async()=>{
  const {radio,audios}=setup();
  const playing=radio.play(),audio=audios[0];audio.start();await playing;
  audio.emit('waiting');assert.equal(radio.state.status,'buffering');
  audio.emit('stalled');assert.match(radio.state.error,/reconnect/);
  audio.emit('playing');assert.equal(radio.state.status,'playing');assert.equal(radio.state.error,'');
  audio.emit('error');assert.equal(radio.state.status,'error');assert.match(radio.state.error,/retry/);
  assert.equal(audio.src,'');assert.equal(audios.length,1);
  audio.emit('playing');assert.equal(radio.state.status,'error');
});

test('hide stops the download but preserves enabled preference; resume never turns an off radio on',async()=>{
  const {radio,audios,storage}=setup();
  const first=radio.play(),old=audios[0];radio.suspend();old.start();
  assert.equal(await first,false);assert.equal(old.src,'');assert.equal(old.paused,true);
  assert.equal(radio.state.status,'suspended');assert.equal(loadRadioSettings(storage).enabled,true);
  await radio.selectStation('country');assert.equal(audios.length,1,'changing preference while hidden must not start a stream');
  const resumed=radio.resume(),current=audios[1];current.start();assert.equal(await resumed,true);
  assert.equal(current.src,STATIONS.find(s=>s.id==='country').src);
  await radio.resume();assert.equal(audios.length,2,'resume must not duplicate a playing connection');
  radio.stop();radio.suspend();assert.equal(await radio.resume(),false);assert.equal(audios.length,2);
});

test('destroy cancels playback and pending callbacks without erasing saved preferences',async()=>{
  const {radio,audios,storage,changes}=setup();
  const first=radio.play(),audio=audios[0];radio.destroy();
  const count=changes.length;
  audio.start();assert.equal(await first,false);
  assert.equal(audio.src,'');assert.equal(audio.paused,true);assert.equal(loadRadioSettings(storage).enabled,true);
  assert.equal(await radio.play(),false);assert.equal(await radio.selectStation('rap'),false);
  radio.setVolume(.9);radio.stop();radio.suspend();radio.destroy();
  assert.equal(changes.length,count);assert.equal(audios.length,1);
});

test('audio construction failure is contained and exposes a retry message',async()=>{
  const radio=new RoadTripRadio({storage:memoryStorage(),audioFactory(){throw Error('unsupported');}});
  assert.equal(await radio.play(),false);assert.equal(radio.state.status,'error');
  assert.match(radio.state.error,/retry/);assert.doesNotThrow(()=>radio.destroy());
});
