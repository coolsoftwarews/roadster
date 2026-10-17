import {formatTime} from './game-logic.js?v=radio-1';
import {TRACKS,getTrack} from './tracks.js?v=cinematic-1';
import {DIFFICULTIES,getDifficulty} from './difficulty.js?v=radio-1';

export const DRIVER_STORAGE_KEY='roadster-run-driver';
export const RESULT_STORAGE_KEY='roadster-run-last-result';
export const BEST_STORAGE_PREFIX='roadster-run-best-';
export const GAME_URL='https://roadster.coolsoftware.io';
const knownTrack=id=>TRACKS.some(track=>track.id===id);
const knownDifficulty=id=>DIFFICULTIES.some(difficulty=>difficulty.id===id);

// Count UTF-16 units like the input's maxlength, without keeping a split emoji.
export function normalizeDriver(value){
  if(typeof value!=='string')return '';
  const clean=value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,'');
  let result='';
  for(const character of clean){
    const code=character.codePointAt(0);
    if(code>=0xd800&&code<=0xdfff)continue;
    if(result.length+character.length>255)break;
    result+=character;
  }
  return result;
}
export function displayDriver(value){return normalizeDriver(value).trim()||'Roadster driver';}

export function loadDriver(storage){
  try{return normalizeDriver((storage??globalThis.localStorage).getItem(DRIVER_STORAGE_KEY));}
  catch{return '';}
}
export function saveDriver(value,storage){
  try{(storage??globalThis.localStorage).setItem(DRIVER_STORAGE_KEY,normalizeDriver(value));return true;}
  catch{return false;}
}

const emptyBest=()=>({time:Infinity,score:0});
function normalizeBest(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  if(typeof value.time!=='number'||!Number.isFinite(value.time)||value.time<0||value.time>Number.MAX_SAFE_INTEGER)return null;
  if(!Number.isSafeInteger(value.score)||value.score<0)return null;
  return {time:value.time,score:value.score};
}
export function loadBest(trackId,difficultyId='easy',storage){
  if(!knownTrack(trackId)||!knownDifficulty(difficultyId))return emptyBest();
  try{
    const source=storage??globalThis.localStorage;
    const read=key=>{try{return normalizeBest(JSON.parse(source.getItem(key)));}catch{return null;}};
    const best=read(BEST_STORAGE_PREFIX+trackId+'-'+difficultyId);
    if(best)return best;
    // Before the picker every race used Easy physics. Legacy records never seed
    // a harder difficulty, and the original single-track key belongs to Canyon.
    if(difficultyId==='easy'){
      const legacy=read(BEST_STORAGE_PREFIX+trackId);
      if(legacy)return legacy;
      if(trackId==='canyon')return read('roadster-run-best')||emptyBest();
    }
  }catch{}
  return emptyBest();
}
export function saveBest(trackId,value,difficultyId='easy',storage){
  const candidate=normalizeBest(value);
  if(!knownTrack(trackId)||!knownDifficulty(difficultyId)||!candidate)return false;
  const previous=loadBest(trackId,difficultyId,storage);
  const best={time:Math.min(candidate.time,previous.time),score:Math.max(candidate.score,previous.score)};
  try{(storage??globalThis.localStorage).setItem(BEST_STORAGE_PREFIX+trackId+'-'+difficultyId,JSON.stringify(best));return true;}
  catch{return false;}
}

const countKeys=['score','cleared','total','ramps','totalRamps','successfulJumps'];
export function normalizeResult(value){
  if(!value||typeof value!=='object'||Array.isArray(value)||typeof value.driver!=='string')return null;
  if(!countKeys.every(key=>Number.isSafeInteger(value[key])&&value[key]>=0))return null;
  if(typeof value.time!=='number'||!Number.isFinite(value.time)||value.time<0||value.time>Number.MAX_SAFE_INTEGER)return null;
  if(value.cleared>value.total||value.ramps>value.totalRamps)return null;
  const trackId=value.trackId===undefined?'canyon':value.trackId;
  const difficultyId=value.difficultyId===undefined?'easy':value.difficultyId;
  if(!knownTrack(trackId)||!knownDifficulty(difficultyId))return null;
  return {
    trackId,difficultyId,driver:displayDriver(value.driver),score:value.score,time:value.time,
    cleared:value.cleared,total:value.total,ramps:value.ramps,
    totalRamps:value.totalRamps,successfulJumps:value.successfulJumps
  };
}
export function loadResult(storage){
  try{return normalizeResult(JSON.parse((storage??globalThis.localStorage).getItem(RESULT_STORAGE_KEY)));}
  catch{return null;}
}
export function saveResult(value,storage){
  const result=normalizeResult(value);
  if(!result)return false;
  try{(storage??globalThis.localStorage).setItem(RESULT_STORAGE_KEY,JSON.stringify(result));return true;}
  catch{return false;}
}

// X counts a URL as 23 characters. ASCII counts as one; counting every other
// Unicode code point as two safely overestimates complex emoji and other text.
export function shareTextWeight(text){
  return [...text].reduce((weight,character)=>weight+(character.codePointAt(0)<=0x7f?1:2),0);
}
function shortenIdentity(identity,budget){
  if(shareTextWeight(identity)<=budget)return identity;
  const parts=typeof Intl.Segmenter==='function'
    ?[...new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(identity)].map(part=>part.segment)
    :[...identity];
  let shortened='',weight=0;
  for(const part of parts){
    const nextWeight=shareTextWeight(part);
    if(weight+nextWeight>budget-2)break;
    shortened+=part;weight+=nextWeight;
  }
  return shortened+'…';
}
export function buildShareText(value){
  const result=normalizeResult(value);
  if(!result)throw new TypeError('A valid race result is required to share.');
  const heading=` completed Roadster Run!\n${getTrack(result.trackId).name} · ${getDifficulty(result.difficultyId).name}\n${result.score} points | ${formatTime(result.time)}`;
  let stats=heading+`\n${result.cleared}/${result.total} obstacles | ${result.ramps}/${result.totalRamps} ramps | ${result.successfulJumps} safe jumps`;
  // Even maximum safe integers must leave room for an identity and the URL.
  // The saved result/card retain full totals if a very large result needs this
  // shorter post summary.
  if(shareTextWeight(stats)>224)stats=heading+`\n${result.cleared} obstacles | ${result.ramps} ramps | ${result.successfulJumps} safe jumps`;

  const identity=shortenIdentity(result.driver,280-24-shareTextWeight(stats));
  return identity+stats;
}
export function buildXIntent(value){
  const intent=new URL('https://x.com/intent/tweet');
  intent.searchParams.set('text',buildShareText(value));
  intent.searchParams.set('url',GAME_URL);
  return intent.href;
}
