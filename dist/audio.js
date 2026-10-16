export class DrivingAudio {
  constructor(){this.ctx=null;this.muted=false;this.active=false;}
  async start(){
    if(!this.ctx){
      const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
      this.ctx=new AC();const c=this.ctx;
      this.master=c.createGain();this.master.gain.value=this.muted?0:.5;this.master.connect(c.destination);
      this.engine=c.createOscillator();this.engine.type='sawtooth';this.engine.frequency.value=45;
      this.engineFilter=c.createBiquadFilter();this.engineFilter.type='lowpass';this.engineFilter.frequency.value=650;
      this.engineGain=c.createGain();this.engineGain.gain.value=0;this.engine.connect(this.engineFilter).connect(this.engineGain).connect(this.master);this.engine.start();
      this.whine=c.createOscillator();this.whine.type='sine';this.whine.frequency.value=250;
      this.whineGain=c.createGain();this.whineGain.gain.value=0;this.whine.connect(this.whineGain).connect(this.master);this.whine.start();
      this.tires=c.createOscillator();this.tires.type='triangle';this.tireGain=c.createGain();this.tireGain.gain.value=0;this.tires.connect(this.tireGain).connect(this.master);this.tires.start();
      this.noiseBuffer=c.createBuffer(1,c.sampleRate*2,c.sampleRate);const data=this.noiseBuffer.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
      const road=c.createBufferSource();road.buffer=this.noiseBuffer;road.loop=true;const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=950;this.roadGain=c.createGain();this.roadGain.gain.value=0;road.connect(filter).connect(this.roadGain).connect(this.master);road.start();
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();this.active=true;
  }
  toggle(){this.muted=!this.muted;if(this.ctx)this.master.gain.setTargetAtTime(this.muted?0:.5,this.ctx.currentTime,.08);return this.muted;}
  update(speed,throttle,corner,airborne,playing){
    if(!this.ctx)return;const t=this.ctx.currentTime;const moving=playing&&speed>1;
    this.engine.frequency.setTargetAtTime(40+speed*3.6,t,.1);this.engineFilter.frequency.setTargetAtTime(350+speed*21,t,.1);
    this.engineGain.gain.setTargetAtTime(moving?(.035+(throttle?.065:.02))*(airborne?.35:1):0,t,.12);
    this.whine.frequency.setTargetAtTime(190+speed*14+(throttle?80:0),t,.13);this.whineGain.gain.setTargetAtTime(moving?speed/73*.045:0,t,.12);
    this.tires.frequency.setTargetAtTime(750+Math.min(1,corner)*650+Math.sin(t*24)*45,t,.05);
    this.tireGain.gain.setTargetAtTime(moving&&!airborne?Math.max(0,corner-.27)*.09:0,t,.09);
    this.roadGain.gain.setTargetAtTime(moving&&!airborne?speed/73*.07:0,t,.1);
  }
  noise(duration,volume,frequency){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime;const src=c.createBufferSource();src.buffer=this.noiseBuffer;const filter=c.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.5;const gain=c.createGain();gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(volume,t+.025);gain.gain.exponentialRampToValueAtTime(.001,t+duration);src.connect(filter).connect(gain).connect(this.master);src.start();src.stop(t+duration);
  }
  tone(frequency,volume,duration,type='sine',end=frequency){
    if(!this.ctx)return;const c=this.ctx,t=c.currentTime;const osc=c.createOscillator(),g=c.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(g).connect(this.master);osc.start();osc.stop(t+duration);
  }
  thrust(){this.noise(1.35,.72,1400);this.noise(.35,.4,240);this.tone(100,.22,.75,'triangle',35);}
  land(){this.noise(.22,.3,180);this.tone(90,.26,.25,'sine',30);this.noise(.18,.08,1800);}
  collision(){this.noise(.4,.48,320);this.tone(120,.18,.35,'triangle',30);}
  reward(){this.tone(660,.12,.22);setTimeout(()=>this.tone(990,.10,.3),100);}
}
