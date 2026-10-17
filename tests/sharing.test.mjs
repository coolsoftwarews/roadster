import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRIVER_STORAGE_KEY,RESULT_STORAGE_KEY,BEST_STORAGE_PREFIX,GAME_URL,normalizeDriver,displayDriver,
  loadDriver,saveDriver,loadBest,saveBest,normalizeResult,loadResult,saveResult,
  buildShareText,buildXIntent,shareTextWeight
} from '../dist/result-sharing.js';
import {TRACKS} from '../dist/tracks.js';
import {DIFFICULTIES} from '../dist/difficulty.js';
import {renderResultCard,CARD_FORMATS,layoutCardDriver} from '../dist/result-card.js';

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

test('optional personal-best metadata survives save and load while malformed metadata is ignored',()=>{
  const storage=memoryStorage();
  for(const isBest of [true,false])for(const isScoreBest of [true,false]){
    const snapshot={...result,isBest,isScoreBest,previousBestTime:105.2};
    assert.equal(saveResult(snapshot,storage),true);
    assert.deepEqual(loadResult(storage),snapshot);
  }
  for(const previousBestTime of [Infinity,NaN,-1,'105.2',null]){
    assert.deepEqual(normalizeResult({...result,isBest:'yes',isScoreBest:1,previousBestTime}),result);
  }
  assert.deepEqual(normalizeResult({...result,previousBestTime:0}),{...result,previousBestTime:0});
  assert.deepEqual(normalizeResult(result),result);
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

function cardContext() {
  const text = [], images = [];
  const target = {
    font: '16px Arial', textAlign: 'left',
    fillText(value, x, y) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1]) || 16;
      text.push({value: String(value), x, y, size, width: this.measureText(value).width});
    },
    measureText(value) {
      const size = Number(this.font.match(/([\d.]+)px/)?.[1]) || 16;
      return {width: Array.from(String(value)).reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 1 : .56) * size, 0)};
    },
    drawImage(...args) { images.push(args); },
    createLinearGradient() { return {addColorStop(){}}; },
    createRadialGradient() { return {addColorStop(){}}; }
  };
  const context = new Proxy(target, {get(object,key){return key in object ? object[key] : ()=>{};}});
  return {context, text, images};
}

test('both social formats identify every completed track and difficulty, preserving driver identity',()=>{
  for(const track of TRACKS)for(const difficulty of DIFFICULTIES)for(const format of Object.keys(CARD_FORMATS)){
    const snapshot={...result,trackId:track.id,difficultyId:difficulty.id,driver:'https://driver.example/'+'a'.repeat(232)};
    const intent=new URL(buildXIntent(snapshot));
    assert.ok(intent.searchParams.get('text').includes(track.name+' · '+difficulty.name));
    const {context,text}=cardContext();
    const canvas={getContext:()=>context};
    assert.equal(renderResultCard(canvas,snapshot,{format}),canvas);
    assert.equal(canvas.width,CARD_FORMATS[format].width);
    assert.equal(canvas.height,CARD_FORMATS[format].height);
    const values=text.map(item=>item.value);
    assert.ok(values.includes(track.name.toUpperCase()));
    assert.ok(values.some(value=>value.includes(difficulty.name.toUpperCase())));
    const driverStart=values.indexOf('DRIVER')+1;
    const driverEnd=values.indexOf('TOTAL SCORE');
    const driverRows=text.slice(driverStart,driverEnd).filter(row=>row.x=== (format==='square'?36:48));
    assert.equal(driverRows.map(row=>row.value).join(''),snapshot.driver);
    assert.ok(driverRows.every(row=>row.x+row.width<=canvas.width/2-36 && row.y+row.size<=canvas.height/2-45));
    assert.ok(values.includes('roadster.coolsoftware.io'));
    for(const label of ['TOTAL SCORE','FINISH TIME','OBSTACLES JUMPED','RAMP LANDINGS','ALL SAFE LANDINGS','Unique ramps completed','Ramp + thrust jumps'])assert.ok(values.includes(label));
    assert.ok(values.includes('750'));
    assert.ok(values.includes('01:38.3'));
  }
});

test('long Unicode driver names fit both cards without ellipsis, clipping, or broken graphemes',()=>{
  for(const driver of ['界'.repeat(255),'👩‍🚀'.repeat(51),'https://example.com/'+'x'.repeat(235),'Ada '.repeat(63)+'XYZ']){
    for(const [width,height] of [[1060,55],[684,51]]){
      const {context}=cardContext();
      const layout=layoutCardDriver(context,driver,width,height);
      assert.equal(layout.lines.join(''),driver);
      assert.ok(layout.lines.length*layout.lineHeight<=height);
      assert.ok(layout.lines.every(line=>context.measureText(line).width<=width));
      if(driver.startsWith('👩')) assert.ok(layout.lines.every(line=>line.replaceAll('👩‍🚀','')===''));
    }
  }
});

test('card artwork stays contained in both formats and invalid artwork falls back safely',()=>{
  const artwork={naturalWidth:1672,naturalHeight:941};
  for(const format of Object.keys(CARD_FORMATS)){
    const {context,images}=cardContext();
    const canvas={getContext:()=>context};
    renderResultCard(canvas,result,{format,artwork});
    assert.equal(images.length,1);
    const [image,x,y,width,height]=images[0];
    assert.equal(image,artwork);
    assert.ok(Math.abs(width/height-artwork.naturalWidth/artwork.naturalHeight)<1e-10);
    assert.ok(x>=0&&y>=0&&x+width<=canvas.width/2&&y+height<=canvas.height/2);
  }
  const {context,text}=cardContext();
  context.drawImage=()=>{throw new Error('not decoded');};
  assert.doesNotThrow(()=>renderResultCard({getContext:()=>context},result,{artwork}));
  assert.ok(text.some(item=>item.value===TRACKS[0].tagline));
});

test('card values stay finite and an unknown format uses the wide export',()=>{
  const {context,text}=cardContext();
  const canvas={getContext:()=>context};
  renderResultCard(canvas,{...result,score:Infinity,time:NaN,cleared:-1,total:undefined,ramps:NaN,successfulJumps:Infinity},{format:'invalid'});
  assert.equal(canvas.width,2400);assert.equal(canvas.height,1350);
  assert.ok(text.every(item=>!/(NaN|Infinity|undefined)/.test(item.value)));
  assert.ok(text.every(item=>Number.isFinite(item.size)&&Number.isFinite(item.x)&&Number.isFinite(item.y)));
});

test('personal best belongs beside the finish time without duplicating the record',()=>{
  for (const format of Object.keys(CARD_FORMATS)) {
    const {context,text}=cardContext();
    renderResultCard({getContext:()=>context},{...result,isBest:true,previousBestTime:105.2},{format});
    const time=text.find(item=>item.value==='FINISH TIME');
    const badge=text.find(item=>item.value==='NEW PERSONAL BEST');
    const previous=text.find(item=>item.value==='Previous best 01:45.2');
    assert.ok(badge.y>time.y && badge.y<time.y+115);
    assert.ok(Math.abs(badge.x-time.x)<12);
    assert.ok(previous.y>badge.y);
    const metrics=text.find(item=>item.value==='OBSTACLES JUMPED');
    assert.ok(previous.y+previous.size<metrics.y);
    const noBest=cardContext();
    renderResultCard({getContext:()=>noBest.context},{...result,previousBestTime:90},{format});
    assert.ok(!noBest.text.some(item=>item.value==='NEW PERSONAL BEST'));
    assert.ok(noBest.text.some(item=>item.value==='Personal best 01:30.0'));
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
