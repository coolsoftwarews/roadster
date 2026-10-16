// Official stream names and HTTPS URLs: https://www.181.fm/links
// These are live broadcasts; music is streamed from 181.FM, never bundled.
export const STATIONS=Object.freeze([
  {id:'rock',name:'Rock',stationName:'181.FM Rock 40',src:'https://listen.181fm.com/181-rock40_128k.mp3',page:'https://www.181.fm/stations/Rock'},
  {id:'country',name:'Country',stationName:'181.FM Highway 181',src:'https://listen.181fm.com/181-highway_128k.mp3',page:'https://www.181.fm/stations/Country'},
  {id:'rap',name:'Rap',stationName:'181.FM The Beat',src:'https://listen.181fm.com/181-beat_128k.mp3',page:'https://www.181.fm/stations/Urban'},
  {id:'love',name:'Love songs',stationName:'181.FM The Heart',src:'https://listen.181fm.com/181-heart_128k.mp3',page:'https://www.181.fm/stations/Pop'}
].map(station=>Object.freeze(station)));

export const RADIO_STORAGE_KEY='roadster-run-radio';
const defaultSettings=()=>({stationId:'rock',volume:.3,enabled:false});
const stationFor=id=>STATIONS.find(station=>station.id===id);
const validVolume=value=>typeof value==='number'&&Number.isFinite(value);
const clampVolume=value=>Math.max(0,Math.min(1,value));
function browserStorage(){try{return globalThis.localStorage;}catch{return undefined;}}

export function loadRadioSettings(storage=browserStorage()){
  const settings=defaultSettings();
  try{
    const saved=JSON.parse(storage?.getItem(RADIO_STORAGE_KEY)||'null');
    if(!saved||typeof saved!=='object'||Array.isArray(saved))return settings;
    if(stationFor(saved.stationId))settings.stationId=saved.stationId;
    if(validVolume(saved.volume))settings.volume=clampVolume(saved.volume);
    if(typeof saved.enabled==='boolean')settings.enabled=saved.enabled;
  }catch{}
  return settings;
}

/**
 * Independent music channel. Creating this model never starts a network request.
 * Status: off | connecting | playing | buffering | suspended | error.
 * UI calls play() from a click, and suspend()/resume() for page visibility.
 * onChange receives snapshots after changes, not during construction.
 */
export class RoadTripRadio {
  constructor({storage=browserStorage(),audioFactory=()=>new Audio(),onChange=()=>{}}={}){
    this._storage=storage;
    this._audioFactory=audioFactory;
    this._onChange=onChange;
    const saved=loadRadioSettings(storage);
    this._stationId=saved.stationId;
    this._volume=saved.volume;
    this._enabled=saved.enabled;
    this._status=saved.enabled?'suspended':'off';
    this._error='';
    this._audio=null;
    this._listeners=[];
    this._generation=0;
    this._suspended=false;
    this._destroyed=false;
  }

  get state(){
    return {stationId:this._stationId,volume:this._volume,enabled:this._enabled,
      status:this._status,error:this._error,stationName:stationFor(this._stationId).stationName};
  }

  _emit(){
    // A UI observer must not interrupt stream cleanup or leave audio running.
    try{this._onChange(this.state);}catch{}
  }

  _save(){
    try{this._storage?.setItem(RADIO_STORAGE_KEY,JSON.stringify({stationId:this._stationId,volume:this._volume,enabled:this._enabled}));}catch{}
  }

  _release(){
    const audio=this._audio;
    this._audio=null;
    if(!audio)return;
    for(const [event,listener] of this._listeners)audio.removeEventListener(event,listener);
    this._listeners=[];
    // Removing src and load() terminate an endless live download, unlike pause alone.
    try{audio.pause();}catch{}
    try{audio.removeAttribute('src');audio.load();}catch{}
  }

  _isCurrent(generation,audio){
    return !this._destroyed&&!this._suspended&&this._enabled&&generation===this._generation&&audio===this._audio;
  }

  _fail(generation,audio,message){
    if(!this._isCurrent(generation,audio))return;
    ++this._generation;
    this._release();
    this._status='error';
    this._error=message;
    this._emit();
  }

  async _start(){
    const generation=++this._generation;
    this._release();
    this._status='connecting';
    this._error='';
    let audio;
    try{
      audio=this._audio=this._audioFactory();
      audio.preload='none';
      audio.volume=this._volume;
      audio.playsInline=true;
      const listen=(event,callback)=>{
        const listener=()=>{if(this._isCurrent(generation,audio))callback();};
        audio.addEventListener(event,listener);
        this._listeners.push([event,listener]);
      };
      listen('playing',()=>{this._status='playing';this._error='';this._emit();});
      listen('waiting',()=>{this._status='buffering';this._error='';this._emit();});
      listen('stalled',()=>{this._status='buffering';this._error='Connection stalled. Press Play to reconnect.';this._emit();});
      listen('error',()=>this._fail(generation,audio,'Station unavailable. Press Play to retry.'));
      listen('ended',()=>this._fail(generation,audio,'Stream ended. Press Play to reconnect.'));
      audio.src=stationFor(this._stationId).src;
      this._emit();
      if(!this._isCurrent(generation,audio))return false;
      await audio.play();
      // Only the playing event reports playback. A settled old promise cannot
      // change the new station, or restart audio after Off / page hide.
      return this._isCurrent(generation,audio);
    }catch(error){
      if(generation!==this._generation||this._destroyed)return false;
      ++this._generation;
      this._release();
      this._status='error';
      this._error=error?.name==='NotAllowedError'
        ?'Press Play to allow radio playback.'
        :'Station unavailable. Press Play to retry.';
      this._emit();
      return false;
    }
  }

  async selectStation(id){
    if(this._destroyed||!stationFor(id))return false;
    const changed=id!==this._stationId;
    this._stationId=id;
    this._error='';
    this._save();
    if(this._enabled&&!this._suspended&&(changed||!this._audio))return this._start();
    this._emit();
    return true;
  }

  setVolume(value){
    if(this._destroyed||!validVolume(value))return;
    this._volume=clampVolume(value);
    if(this._audio)this._audio.volume=this._volume;
    this._save();
    this._emit();
  }

  async play(){
    if(this._destroyed)return false;
    this._enabled=true;
    this._suspended=false;
    this._save();
    return this._start();
  }

  stop(){
    if(this._destroyed)return;
    ++this._generation;
    this._enabled=false;
    this._suspended=false;
    this._release();
    this._status='off';
    this._error='';
    this._save();
    this._emit();
  }

  suspend(){
    if(this._destroyed)return;
    ++this._generation;
    this._suspended=true;
    this._release();
    this._status=this._enabled?'suspended':'off';
    this._error='';
    this._emit();
  }

  async resume(){
    if(this._destroyed||!this._enabled)return false;
    this._suspended=false;
    if(this._audio)return true;
    return this._start();
  }

  destroy(){
    if(this._destroyed)return;
    ++this._generation;
    this._destroyed=true;
    this._release();
    this._enabled=false;
    this._status='off';
    this._error='';
    this._emit();
    this._onChange=()=>{};
  }
}
