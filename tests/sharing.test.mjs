import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_STORAGE_KEY,RESULT_STORAGE_KEY,BEST_STORAGE_PREFIX,GAME_URL,normalizeDriver,displayDriver,
  loadDriver,saveDriver,loadBest,saveBest,normalizeResult,loadResult,saveResult,
  buildShareText,buildXIntent,shareTextWeight
} from '../dist/result-sharing.js';
import {TRACKS} from '../dist/tracks.js';
import {DIFFICULTIES} from '../dist/difficulty.js';
import {renderResultCard} from '../dist/result-card.js';

const result={trackId:'canyon',difficultyId:'easy',driver:'Ada',score:750,time:98.25,cleared:6,total:18,ramps:1,totalRamps:5,successfulJumps:7};
function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value))};
}

test('driver limit matches maxlength and never retains half a surrogate pair',()=>{
  assert.equal(normalizeDriver('x'.repeat(300)).length,255);
  assert.equal(normalizeDriver('x'.repeat(254)+'🚗'),'x'.repeat(254));
  assert.equal(normalizeDriver('x'.repeat(253)+'🚗').length,255);
  assert.equal(normalizeDriver('A\ud800B\udc00C'),'ABC');
  assert.equal(normalizeDriver('A\nB\r\tC\u0000\u2028D'),'ABCD');
  assert.equal(normalizeDriver('  Ada  '),'  Ada  ');
  assert.equal(displayDriver('  Ada  '),'Ada');
  assert.equal(displayDriver(' \n '),'Roadster driver');
});

test('identity is persisted as literal text and reloads independently of a result',()=>{
  const storage=memoryStorage();
  const name='<img src=x onerror=alert(1)> https://example.com/?a=1&b=#tag';
  assert.equal(saveDriver(name,storage),true);
  assert.equal(storage.getItem(DRIVER_STORAGE_KEY),name);
  assert.equal(loadDriver(storage),name);
  assert.equal(loadResult(storage),null);
  assert.equal(saveResult({...result,driver:name},storage),true);
  assert.deepEqual(loadResult(storage),{...result,driver:name});
  assert.equal(saveDriver('Next driver',storage),true);
  assert.equal(loadResult(storage).driver,name,'editing the next driver must not rewrite the last result');
});

test('unavailable storage does not stop a race or throw during save',()=>{
  const storage={getItem(){throw new Error('blocked');},setItem(){throw new Error('full');}};
  assert.equal(loadDriver(storage),'');
  assert.equal(saveDriver('Ada',storage),false);
  assert.equal(loadResult(storage),null);
  assert.equal(saveResult(result,storage),false);
  assert.deepEqual(loadBest('canyon','easy',storage),{time:Infinity,score:0});
  assert.equal(saveBest('canyon',{time:98,score:700},'easy',storage),false);
});

test('stored results validate every stat and ignore corrupted or impossible snapshots',()=>{
  const storage=memoryStorage();
  for(const value of ['{broken','null','[]','"text"']){
    storage.setItem(RESULT_STORAGE_KEY,value);assert.equal(loadResult(storage),null);
  }
  for(const key of ['score','cleared','total','ramps','totalRamps','successfulJumps']){
    for(const bad of [NaN,Infinity,-1,1.5,'1',undefined,Number.MAX_SAFE_INTEGER+1]){
      assert.equal(normalizeResult({...result,[key]:bad}),null,`${key}: ${String(bad)}`);
    }
  }
  for(const bad of [NaN,Infinity,-1,'98',null,undefined])assert.equal(normalizeResult({...result,time:bad}),null);
  assert.equal(normalizeResult({...result,driver:null}),null);
  assert.equal(normalizeResult({...result,cleared:19}),null);
  assert.equal(normalizeResult({...result,ramps:6}),null);
  assert.equal(saveResult({...result,time:NaN},storage),false);
  assert.throws(()=>buildShareText({...result,time:NaN}),TypeError);
  assert.deepEqual(normalizeResult({...result,ignored:'not stored'}),result);
});

test('legacy results belong to Canyon and unknown track IDs are rejected',()=>{
  const {trackId,difficultyId,...legacy}=result;
  assert.deepEqual(normalizeResult(legacy),result);
  const storage=memoryStorage();
  storage.setItem(RESULT_STORAGE_KEY,JSON.stringify(legacy));
  assert.deepEqual(loadResult(storage),result);
  for(const trackId of ['unknown','../austin','Austin','',null,0,{}]){
    assert.equal(normalizeResult({...result,trackId}),null);
    assert.equal(saveResult({...result,trackId},storage),false);
  }
  for(const track of TRACKS){
    assert.equal(saveResult({...result,trackId:track.id},storage),true);
    assert.equal(loadResult(storage).trackId,track.id);
  }
});

test('records stay isolated by track and preserve the best score and time independently',()=>{
  const storage=memoryStorage();
  assert.equal(saveBest('austin',{time:130.5,score:1600},'easy',storage),true);
  assert.equal(saveBest('miami',{time:160.2,score:2400},'easy',storage),true);
  assert.equal(saveBest('austin',{time:125.2,score:1200},'easy',storage),true);
  assert.equal(saveBest('austin',{time:145.6,score:1700},'easy',storage),true);
  assert.deepEqual(loadBest('austin','easy',storage),{time:125.2,score:1700});
  assert.deepEqual(loadBest('miami','easy',storage),{time:160.2,score:2400});
  assert.deepEqual(loadBest('bay-area','easy',storage),{time:Infinity,score:0});
  assert.deepEqual(loadBest('canyon','easy',storage),{time:Infinity,score:0});
});

test('original best records seed only Canyon Easy and migrate on save',()=>{
  const storage=memoryStorage();
  storage.setItem('roadster-run-best',JSON.stringify({time:120,score:950}));
  assert.deepEqual(loadBest('canyon','easy',storage),{time:120,score:950});
  for(const id of ['austin','miami','bay-area'])assert.deepEqual(loadBest(id,'easy',storage),{time:Infinity,score:0});
  assert.equal(saveBest('canyon',{time:110,score:800},'easy',storage),true);
  assert.deepEqual(JSON.parse(storage.getItem(BEST_STORAGE_PREFIX+'canyon-easy')),{time:110,score:950});
  assert.deepEqual(loadBest('canyon','easy',storage),{time:110,score:950});
});

test('corrupt best records and invalid track writes cannot overwrite valid records',()=>{
  const storage=memoryStorage();
  for(const raw of ['{broken','null','[]','{"time":-1,"score":10}','{"time":10,"score":-1}','{"time":"10","score":10}','{"time":10,"score":1.5}']){
    storage.setItem(BEST_STORAGE_PREFIX+'austin-easy',raw);
    assert.deepEqual(loadBest('austin','easy',storage),{time:Infinity,score:0});
  }
  saveBest('austin',{time:99,score:700},'easy',storage);
  for(const value of [null,[],{time:Infinity,score:1},{time:-1,score:1},{time:1,score:NaN},{time:1,score:Number.MAX_SAFE_INTEGER+1}]){
    assert.equal(saveBest('austin',value,'easy',storage),false);
  }
  assert.equal(saveBest('unknown',{time:1,score:9999},'easy',storage),false);
  assert.deepEqual(loadBest('unknown','easy',storage),{time:Infinity,score:0});
  assert.deepEqual(loadBest('austin','easy',storage),{time:99,score:700});
});

test('X intent round-trips punctuation and Unicode while using the fixed game URL',()=>{
  const driver='Ada & Bob #1 + 50% / 🚗 https://me.example/?x=1&y=2';
  const shared={...result,driver};
  const intent=new URL(buildXIntent(shared));
  assert.equal(intent.origin,'https://x.com');
  assert.equal(intent.pathname,'/intent/tweet');
  assert.equal(intent.searchParams.get('text'),buildShareText(shared));
  assert.ok(intent.searchParams.get('text').startsWith(driver));
  assert.equal(intent.searchParams.get('url'),GAME_URL);
  assert.deepEqual([...intent.searchParams.keys()],['text','url']);
  assert.match(intent.searchParams.get('text'),/750 points \| 01:38\.3/);
  assert.match(intent.searchParams.get('text'),/Canyon Circuit · Easy/);
  assert.match(intent.searchParams.get('text'),/6\/18 obstacles \| 1\/5 ramps \| 7 safe jumps/);
});

test('long Unicode identities fit a conservative X budget without changing the saved card identity',()=>{
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES)for(const driver of ['界'.repeat(255),'🚗'.repeat(127),'👩‍🚀'.repeat(51),'a'.repeat(255)]){
    const snapshot=normalizeResult({...result,trackId:track.id,difficultyId:difficulty.id,driver});
    const text=buildShareText(snapshot);
    assert.ok(shareTextWeight(text)+24<=280,`${shareTextWeight(text)+24} weighted characters`);
    assert.ok(text.includes('… completed Roadster Run!'));
    assert.ok(text.includes(track.name));
    assert.equal(snapshot.driver,normalizeDriver(driver));
    assert.ok(!/[\ud800-\udbff]$/.test(text.split(' completed')[0]));
  }
  const large={driver:'界'.repeat(255),score:Number.MAX_SAFE_INTEGER,time:Number.MAX_SAFE_INTEGER,cleared:Number.MAX_SAFE_INTEGER,total:Number.MAX_SAFE_INTEGER,ramps:Number.MAX_SAFE_INTEGER,totalRamps:Number.MAX_SAFE_INTEGER,successfulJumps:Number.MAX_SAFE_INTEGER};
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
    const text=buildShareText({...large,trackId:track.id,difficultyId:difficulty.id});
    assert.ok(shareTextWeight(text)+24<=280,`${track.id}: ${shareTextWeight(text)+24} weighted characters`);
    assert.ok(text.includes(track.name));
    assert.ok(!text.includes('NaN'));
  }
});

test('every X post and personalized card names the completed track and difficulty',()=>{
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
    const snapshot={...result,trackId:track.id,difficultyId:difficulty.id,driver:'https://driver.example/'+'a'.repeat(230)};
    const intent=new URL(buildXIntent(snapshot));
    assert.ok(intent.searchParams.get('text').includes(track.name+' · '+difficulty.name));
    const text=[];
    const context=new Proxy({
      fillText(value){text.push(String(value));},
      measureText(value){return {width:[...String(value)].length*14};},
      createLinearGradient(){return {addColorStop(){}};},
      createRadialGradient(){return {addColorStop(){}};}
    },{get(target,key){return key in target?target[key]:()=>{};}});
    const canvas={getContext:()=>context};
    assert.equal(renderResultCard(canvas,snapshot),canvas);
    assert.equal(canvas.width,1200);assert.equal(canvas.height,675);
    assert.ok(text.includes(`${track.name.toUpperCase()}  /  ${difficulty.name.toUpperCase()}`));
    const driverStart=text.indexOf('DRIVER')+1,driverEnd=text.indexOf('YOUR LINE. YOUR PACE. YOUR NEXT RECORD.');
    assert.equal(text.slice(driverStart,driverEnd).join(''),snapshot.driver);
    assert.ok(text.includes('roadster.coolsoftware.io'));
  }
});

 test('result and post clocks round across minute boundaries consistently',()=>{const result={driver:'Driver',score:150,time:59.99,cleared:0,total:18,ramps:1,totalRamps:5,successfulJumps:1};assert.match(buildShareText(result),/01:00\.0/);assert.doesNotMatch(buildShareText(result),/00:60/);});


test('all difficulty IDs round-trip, legacy results become Easy, and unknown IDs are rejected',()=>{
  const storage=memoryStorage();
  const {difficultyId,...legacy}=result;
  assert.deepEqual(normalizeResult(legacy),result);
  for(const difficulty of DIFFICULTIES){
    const snapshot={...result,trackId:'miami',difficultyId:difficulty.id};
    assert.equal(saveResult(snapshot,storage),true);
    assert.deepEqual(loadResult(storage),snapshot);
  }
  for(const difficultyId of ['unknown','../easy','Easy','',null,0,{}]){
    assert.equal(normalizeResult({...result,difficultyId}),null);
    assert.equal(saveResult({...result,difficultyId},storage),false);
    assert.equal(saveBest('canyon',{time:1,score:9999},difficultyId,storage),false);
    assert.deepEqual(loadBest('canyon',difficultyId,storage),{time:Infinity,score:0});
  }
});

test('every track and difficulty has independent best time and score',()=>{
  const storage=memoryStorage();
  let index=0;
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
    index++;
    assert.equal(saveBest(track.id,{time:100+index,score:100*index},difficulty.id,storage),true);
  }
  assert.equal(saveBest('austin',{time:90,score:0},'medium',storage),true);
  assert.equal(saveBest('austin',{time:120,score:9900},'medium',storage),true);
  index=0;
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES){
    index++;
    const expected=track.id==='austin'&&difficulty.id==='medium'?{time:90,score:9900}:{time:100+index,score:100*index};
    assert.deepEqual(loadBest(track.id,difficulty.id,storage),expected);
  }
});

test('legacy track records migrate into Easy without populating Medium or Hard',()=>{
  const storage=memoryStorage();
  storage.setItem('roadster-run-best',JSON.stringify({time:1,score:9999}));
  for(const track of TRACKS){
    storage.setItem(BEST_STORAGE_PREFIX+track.id,JSON.stringify({time:120,score:950}));
    assert.deepEqual(loadBest(track.id,'easy',storage),{time:120,score:950});
    for(const difficultyId of ['medium','hard'])assert.deepEqual(loadBest(track.id,difficultyId,storage),{time:Infinity,score:0});
    assert.equal(saveBest(track.id,{time:110,score:800},'easy',storage),true);
    assert.deepEqual(JSON.parse(storage.getItem(BEST_STORAGE_PREFIX+track.id+'-easy')),{time:110,score:950});
    storage.setItem(BEST_STORAGE_PREFIX+track.id,JSON.stringify({time:1,score:9999}));
    assert.deepEqual(loadBest(track.id,'easy',storage),{time:110,score:950},'the new key takes precedence after migration');
    for(const difficultyId of ['medium','hard'])assert.deepEqual(loadBest(track.id,difficultyId,storage),{time:Infinity,score:0});
  }
});
