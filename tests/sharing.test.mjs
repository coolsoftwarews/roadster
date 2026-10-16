import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_STORAGE_KEY,RESULT_STORAGE_KEY,GAME_URL,normalizeDriver,displayDriver,
  loadDriver,saveDriver,normalizeResult,loadResult,saveResult,
  buildShareText,buildXIntent,shareTextWeight
} from '../dist/result-sharing.js';

const result={driver:'Ada',score:750,time:98.25,cleared:6,total:18,ramps:1,totalRamps:5,successfulJumps:7};
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
  assert.match(intent.searchParams.get('text'),/6\/18 obstacles \| 1\/5 ramps \| 7 safe jumps/);
});

test('long Unicode identities fit a conservative X budget without changing the saved card identity',()=>{
  for(const driver of ['界'.repeat(255),'🚗'.repeat(127),'👩‍🚀'.repeat(51),'a'.repeat(255)]){
    const snapshot=normalizeResult({...result,driver});
    const text=buildShareText(snapshot);
    assert.ok(shareTextWeight(text)+24<=280,`${shareTextWeight(text)+24} weighted characters`);
    assert.ok(text.includes('… completed Roadster Run!'));
    assert.equal(snapshot.driver,normalizeDriver(driver));
    assert.ok(!/[\ud800-\udbff]$/.test(text.split(' completed')[0]));
  }
  const large={driver:'界'.repeat(255),score:Number.MAX_SAFE_INTEGER,time:Number.MAX_SAFE_INTEGER,cleared:Number.MAX_SAFE_INTEGER,total:Number.MAX_SAFE_INTEGER,ramps:Number.MAX_SAFE_INTEGER,totalRamps:Number.MAX_SAFE_INTEGER,successfulJumps:Number.MAX_SAFE_INTEGER};
  assert.ok(shareTextWeight(buildShareText(large))+24<=280);
  assert.ok(!buildShareText(large).includes('NaN'));
});

 test('result and post clocks round across minute boundaries consistently',()=>{const result={driver:'Driver',score:150,time:59.99,cleared:0,total:18,ramps:1,totalRamps:5,successfulJumps:1};assert.match(buildShareText(result),/01:00\.0/);assert.doesNotMatch(buildShareText(result),/00:60/);});
