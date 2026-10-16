import {SOUND_CHANNELS,loadSoundSettings,saveSoundSettings,validVolume,clampVolume} from './sound-settings.js?v=sound-1';

const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));

export class DrivingAudio {
  constructor({storage}={}){
    this.ctx=null;this.active=false;this.voices=new Set();this.lastWarning=-10;
    this._storage=storage;this._settings=loadSoundSettings(storage);
  }

  get settings(){return {...this._settings};}
  get muted(){return !this._settings.enabled;}
  set muted(value){if(typeof value==='boolean')this.setEnabled(!value);}

  setEnabled(enabled){
    if(typeof enabled!=='boolean')return this.settings;
    this._settings.enabled=enabled;
    if(this.ctx)this.master.gain.setTargetAtTime(enabled?.72:0,this.ctx.currentTime,.025);
    saveSoundSettings(this._settings,this._storage);
    return this.settings;
  }

  setVolume(channel,value){
    if(!SOUND_CHANNELS.includes(channel)||!validVolume(value))return this.settings;
    this._settings[channel]=clampVolume(value);
    if(this.ctx)this.channels[channel].gain.setTargetAtTime(this._settings[channel],this.ctx.currentTime,.025);
    saveSoundSettings(this._settings,this._storage);
    return this.settings;
  }

  async start(){
    if(!this.ctx){
      const AC=globalThis.AudioContext||globalThis.webkitAudioContext;if(!AC)return;
      const c=this.ctx=new AC();
      this.mix=c.createGain();
      // Keep the layered effects full without clipping the speakers.
      this.compressor=c.createDynamicsCompressor();
      this.compressor.threshold.value=-17;this.compressor.knee.value=14;
      this.compressor.ratio.value=5;this.compressor.attack.value=.004;this.compressor.release.value=.2;
      this.master=c.createGain();this.master.gain.value=this.muted?0:.72;
      const highpass=c.createBiquadFilter();highpass.type='highpass';highpass.frequency.value=28;
      this.mix.connect(this.compressor).connect(highpass).connect(this.master).connect(c.destination);
      // Shared category buses also adjust sounds that have already started.
      this.channels=Object.fromEntries(SOUND_CHANNELS.map(channel=>{
        const bus=c.createGain();bus.gain.value=this._settings[channel];bus.connect(this.mix);
        return[channel,bus];
      }));

      this.noiseBuffer=c.createBuffer(2,c.sampleRate*3,c.sampleRate);
      for(let ch=0;ch<2;ch++){
        const samples=this.noiseBuffer.getChannelData(ch);
        for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      }
      this.motor=this._continuousTone('triangle',70,'lowpass',640);
      this.harmonic=this._continuousTone('sine',190,'lowpass',1800);
      this.inverter=this._continuousTone('sine',380,'lowpass',2400);
      this.road=this._continuousNoise('lowpass',400,.7);
      this.wind=this._continuousNoise('bandpass',700,.55);
      this.scrub=this._continuousNoise('bandpass',1400,1.5,'tires');
      this.squeal=this._continuousTone('sine',720,'lowpass',2600,'tires');
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
    this.active=true;
  }

  _continuousTone(type,frequency,filterType,cutoff,channel='engine'){
    const c=this.ctx,source=c.createOscillator(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.type=type;source.frequency.value=frequency;filter.type=filterType;filter.frequency.value=cutoff;gain.gain.value=0;
    source.connect(filter).connect(gain).connect(this.channels[channel]);source.start();return{source,filter,gain};
  }

  _continuousNoise(type,frequency,q,channel='engine'){
    const c=this.ctx,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noiseBuffer;source.loop=true;filter.type=type;filter.frequency.value=frequency;filter.Q.value=q;gain.gain.value=0;
    source.connect(filter).connect(gain).connect(this.channels[channel]);source.start(0,Math.random()*2);return{source,filter,gain};
  }

  toggle(){
    this.setEnabled(this.muted);
    return this.muted;
  }

  update(speed,throttle,corner,airborne,playing){
    if(!this.ctx)return;
    const t=this.ctx.currentTime,v=clamp(speed/73),moving=playing&&speed>.6;
    const load=throttle?1:.28,ground=airborne?.12:1;
    const slip=clamp((Math.abs(corner)-.18)/.82)*clamp(speed/17);
    const wobble=Math.sin(t*29)*.5+Math.sin(t*43)*.25;
    const smooth=(param,value,time=.1)=>param.setTargetAtTime(value,t,time);
    smooth(this.motor.source.frequency,48+v*230+load*13,.14);
    smooth(this.motor.filter.frequency,390+v*1150+load*280,.13);
    smooth(this.motor.gain.gain,moving?(.033+v*.037)*load*(airborne?.55:1):0,.11);
    smooth(this.harmonic.source.frequency,145+v*920+(throttle?65:0),.15);
    smooth(this.harmonic.gain.gain,moving?(.012+v*.026)*load:0,.14);
    smooth(this.inverter.source.frequency,340+v*1470,.17);
    smooth(this.inverter.gain.gain,moving?v*.011*(throttle?1:.5):0,.14);
    smooth(this.road.filter.frequency,180+v*750);
    smooth(this.road.gain.gain,moving?v*.075*ground:0,.15);
    smooth(this.wind.filter.frequency,330+v*1050);
    smooth(this.wind.gain.gain,moving?v*v*(airborne?.075:.045):0,.2);
    smooth(this.scrub.filter.frequency,950+slip*1400+wobble*120,.035);
    smooth(this.scrub.gain.gain,moving?slip*.22*ground*(.9+wobble*.1):0,.045);
    smooth(this.squeal.source.frequency,650+slip*590+wobble*70,.04);
    smooth(this.squeal.gain.gain,moving?slip*slip*.035*ground:0,.065);
  }

  // Each transient owns its nodes; dispose them when its source finishes.
  _play(source,nodes,start,end,offset){
    if(this.voices.size>=48){const oldest=this.voices.values().next().value;oldest.stop();}
    let stopped=false;
    const dispose=()=>{this.voices.delete(voice);source.disconnect();for(const node of nodes)node.disconnect();};
    const voice={stop:()=>{if(!stopped){stopped=true;try{source.stop();}catch{}dispose();}}};
    this.voices.add(voice);
    source.onended=()=>{if(!stopped){stopped=true;dispose();}};
    if(offset===undefined)source.start(start);else source.start(start,offset);
    source.stop(end);
  }

  _noise(duration,volume,frequency,{end=frequency,type='bandpass',q=.65,delay=0,attack=.012,channel='effects'}={}){
    if(!this.ctx)return;
    const c=this.ctx,t=c.currentTime+delay,source=c.createBufferSource(),filter=c.createBiquadFilter(),gain=c.createGain();
    source.buffer=this.noiseBuffer;source.loop=true;filter.type=type;filter.Q.value=q;
    filter.frequency.setValueAtTime(frequency,t);filter.frequency.exponentialRampToValueAtTime(Math.max(35,end),t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(filter).connect(gain).connect(this.channels[channel]);
    this._play(source,[filter,gain],t,t+duration+.025,Math.random()*2);
  }

  _tone(frequency,volume,duration,{end=frequency,type='sine',delay=0,attack=.006,channel='effects'}={}){
    if(!this.ctx)return;
    const c=this.ctx,t=c.currentTime+delay,source=c.createOscillator(),gain=c.createGain();
    source.type=type;source.frequency.setValueAtTime(frequency,t);source.frequency.exponentialRampToValueAtTime(Math.max(24,end),t+duration);
    gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+attack);gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    source.connect(gain).connect(this.channels[channel]);this._play(source,[gain],t,t+duration+.025);
  }

  thrust(){
    this._noise(.16,.29,2600,{end:800,channel:'thrust'});
    this._noise(1.22,.53,1050,{end:380,attack:.035,q:.5,channel:'thrust'});
    this._noise(.85,.2,4500,{end:1600,attack:.04,channel:'thrust'});
    this._tone(104,.27,.76,{end:36,type:'triangle',attack:.018,channel:'thrust'});
    this._tone(51,.25,.53,{end:29,attack:.014,channel:'thrust'});
  }

  ramp(){
    this._noise(.58,.25,450,{end:2600,attack:.055,channel:'thrust'});
    this._tone(95,.12,.4,{end:320,type:'triangle',attack:.025,channel:'thrust'});
    this._noise(.16,.18,220,{type:'lowpass',channel:'thrust'});
  }

  landingThrust(){
    this._noise(.64,.62,1700,{end:420,attack:.018,q:.5,channel:'thrust'});
    this._noise(.26,.2,4200,{end:1600,channel:'thrust'});
    this._tone(135,.3,.5,{end:42,type:'triangle',attack:.01,channel:'thrust'});
    this._tone(67,.24,.42,{end:30,attack:.012,channel:'thrust'});
  }

  land(){
    this._tone(85,.22,.25,{end:29});
    this._noise(.29,.24,220,{end:80,type:'lowpass'});
    this._noise(.22,.13,1800,{end:500});
    this._noise(.12,.08,350,{delay:.065});
  }

  collision(){
    this._noise(.34,.4,740,{end:180});
    this._tone(120,.23,.28,{end:30,type:'triangle'});
    this._noise(.13,.18,3300,{end:1400});
  }

  explosion(){
    this._noise(.17,.65,2700,{end:700});
    this._tone(113,.43,.62,{end:27,type:'triangle',attack:.004});
    this._tone(55,.38,1.25,{end:28,attack:.008});
    this._noise(1.85,.68,630,{end:85,type:'lowpass',attack:.025});
    this._noise(1.25,.25,2300,{end:380,attack:.025,delay:.05});
    // Stagger the small metallic fragments after the main impact.
    for(let i=0;i<5;i++){
      const delay=.13+i*.105;
      this._noise(.13+i*.025,.12-i*.015,2400-i*270,{delay,end:600,q:2});
      this._tone(470+i*191,.035,.15,{delay,end:180+i*90,type:'triangle'});
    }
  }

  warning(){
    if(!this.ctx||this.ctx.currentTime-this.lastWarning<.7)return;
    this.lastWarning=this.ctx.currentTime;
    this._tone(780,.075,.11);this._tone(560,.06,.13,{delay:.14});
  }

  reward(){
    this._tone(659,.075,.28);this._tone(988,.07,.34,{delay:.09});this._tone(1318,.035,.34,{delay:.18});
  }
}
