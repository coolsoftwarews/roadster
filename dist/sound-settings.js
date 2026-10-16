export const SOUND_STORAGE_KEY='roadster-run-sound-settings';
export const SOUND_CHANNELS=Object.freeze(['engine','tires','thrust','effects']);
export const DEFAULT_SOUND_SETTINGS=Object.freeze({enabled:true,engine:.55,tires:.75,thrust:.85,effects:.75});

export const validVolume=value=>typeof value==='number'&&Number.isFinite(value);
export const clampVolume=value=>Math.max(0,Math.min(1,value));
function browserStorage(){try{return globalThis.localStorage;}catch{return undefined;}}

export function normalizeSoundSettings(value){
  const settings={...DEFAULT_SOUND_SETTINGS};
  if(!value||typeof value!=='object'||Array.isArray(value))return settings;
  if(typeof value.enabled==='boolean')settings.enabled=value.enabled;
  for(const channel of SOUND_CHANNELS){
    if(validVolume(value[channel]))settings[channel]=clampVolume(value[channel]);
  }
  return settings;
}

export function loadSoundSettings(storage=browserStorage()){
  try{return normalizeSoundSettings(JSON.parse(storage?.getItem(SOUND_STORAGE_KEY)||'null'));}
  catch{return {...DEFAULT_SOUND_SETTINGS};}
}

export function saveSoundSettings(settings,storage=browserStorage()){
  try{storage?.setItem(SOUND_STORAGE_KEY,JSON.stringify(normalizeSoundSettings(settings)));}catch{}
}
