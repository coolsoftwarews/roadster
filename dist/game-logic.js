export const ROAD_WIDTH = 19;
export const MAX_SPEED = 73;
export const JUMP_DURATION = 1.66;
export const JUMP_HEIGHT = 6.4;
export const RECHARGE_TIME = 2.1;
export const LANDING_WINDOW_START = .62;
const GRAVITY = 8 * JUMP_HEIGHT / (JUMP_DURATION * JUMP_DURATION);
const LAUNCH_VELOCITY = GRAVITY * JUMP_DURATION / 2;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a,b,t) => a+(b-a)*t;
export function makeObstacles(length) {
  const layout = [
    [.065,'barrier',0], [.12,'car',-3], [.175,'pothole',2.6], [.225,'bus',0],
    [.28,'barrier',-1.5], [.335,'car',3], [.39,'pothole',-3], [.44,'bus',-2.7],
    [.49,'barrier',0], [.54,'car',-3.4], [.59,'pothole',2], [.64,'bus',2.4],
    [.695,'barrier',0], [.75,'car',1.8], [.80,'pothole',-2.7], [.85,'bus',0],
    [.905,'car',-2], [.945,'barrier',0]
  ];
  const sizes={barrier:[12,1.15,1.5],car:[2.8,1.65,5.6],bus:[3.25,3.35,11],pothole:[5.5,.15,7]};
  return layout.map(([f,type,offset],id)=>({id,s:f*length,type,offset,width:sizes[type][0],height:sizes[type][1],length:sizes[type][2],cleared:false,hit:false}));
}
export function makeRamps(length) {
  const positions=[.105,.315,.525,.735,.875], offsets=[0,-2,2,0,-2];
  return positions.map((fraction,id)=>({id,s:fraction*length,length:22,width:7,height:3.2,offset:offsets[id],cleared:false}));
}
export function rampSurfaceHeight(ramp,s) {
  const t=clamp((s-(ramp.s-ramp.length))/ramp.length,0,1);
  return ramp.height*t*t;
}
export class Run {
  constructor(length) { this.length=length; this.obstacles=makeObstacles(length); this.ramps=makeRamps(length); this.reset(); }
  reset(){
    this.s=7;this.offset=0;this.speed=0;this.lateralVelocity=0;this.time=0;this.score=0;this.cleared=0;this.successfulJumps=0;
    this.height=0;this.jumpTime=-1;this.charge=1;this.checkpoint=7;this.state='ready';this.events=[];this.pending=new Set();this.recoverCooldown=0;this.offroadTime=0;this.roll=0;this.distance=0;
    this.verticalVelocity=0;this.flightProgress=0;this.flightKind=null;this.landingWindow=false;this.landingArmed=false;this.rampId=null;this._landingTime=0;this._edgeFall=false;this._flightGravity=GRAVITY;
    for(const o of this.obstacles){o.cleared=false;o.hit=false;}
    for(const ramp of this.ramps)ramp.cleared=false;
  }
  start(){if(this.state==='ready'||this.state==='paused')this.state='running';}
  _launch(kind,height,velocity,rampId=null,edgeFall=false){
    this.jumpTime=0;this.height=height;this.verticalVelocity=velocity;this.flightKind=kind;this.rampId=rampId;
    this.flightProgress=0;this.landingWindow=false;this.landingArmed=false;this.roll=0;this.pending.clear();
    this._launchHeight=height;this._launchVelocity=velocity;this._edgeFall=edgeFall;
    // Small side drops still leave enough time to respond to the landing cue.
    this._flightGravity=edgeFall?Math.min(GRAVITY,2*height/(.75*.75)):GRAVITY;
    this._flightDuration=(velocity+Math.sqrt(velocity*velocity+2*this._flightGravity*height))/this._flightGravity;
    this.events.push({type:kind==='ramp'?'ramp':'jump',rampId});
  }
  jump(){
    if(this.state!=='running')return false;
    if(this.jumpTime>=0){
      if(!this.landingWindow||this.landingArmed)return false;
      this.landingArmed=true;this.landingWindow=false;this._landingTime=0;
      this._landingHeight=this.height;this._landingProgress=this.flightProgress;
      // Preserve descent velocity and ease to rest exactly at road level.
      this._landingDuration=-2*this.height/this.verticalVelocity;
      if(this._edgeFall)this._landingDuration=Math.min(.75,this._landingDuration);
      this._landingVelocity=this.verticalVelocity;
      this.events.push({type:'landingThrust'});return true;
    }
    if(this.charge<.999||this.speed<5)return false;
    this.charge=0;this._launch('manual',this.height,LAUNCH_VELOCITY);return true;
  }
  recover(){
    if((this.state!=='running'&&this.state!=='crashed')||(this.state==='running'&&this.recoverCooldown>0))return false;
    this.state='running';this.s=this.checkpoint;this.speed=0;this.offset=0;this.lateralVelocity=0;this.height=0;this.jumpTime=-1;this.roll=0;this.pending.clear();this.recoverCooldown=1;this.offroadTime=0;
    this.verticalVelocity=0;this.flightProgress=0;this.flightKind=null;this.landingWindow=false;this.landingArmed=false;this.rampId=null;this._edgeFall=false;
    for(const o of this.obstacles)o.hit=false;
    this.events.push({type:'recover'});return true;
  }
  _advanceFlight(dt){
    this.jumpTime+=dt;
    if(this.landingArmed){
      this._landingTime+=dt;
      const t=clamp(this._landingTime/this._landingDuration,0,1);
      const h=this._landingHeight, tangent=this._landingVelocity*this._landingDuration;
      this.height=Math.max(0,h*(2*t*t*t-3*t*t+1)+tangent*(t*t*t-2*t*t+t));
      this.verticalVelocity=(h*(6*t*t-6*t)+tangent*(3*t*t-4*t+1))/this._landingDuration;
      this.flightProgress=lerp(this._landingProgress,1,t);
    }else{
      this.height=Math.max(0,this._launchHeight+this._launchVelocity*this.jumpTime-.5*this._flightGravity*this.jumpTime*this.jumpTime);
      this.verticalVelocity=this._launchVelocity-this._flightGravity*this.jumpTime;
      this.flightProgress=clamp(this.jumpTime/this._flightDuration,0,1);
      this.landingWindow=this.verticalVelocity<0&&(this._edgeFall||this.flightProgress>=LANDING_WINDOW_START)&&this.flightProgress<1;
    }
    const phase=clamp((this.flightProgress-.1)/.8,0,1);
    this.roll=2*Math.PI*(phase*phase*(3-2*phase));
    return this.flightProgress>=1;
  }
  _touchdown(surfaceHeight=0){
    this.height=surfaceHeight;this.roll=0;this.jumpTime=-1;this.verticalVelocity=0;this.flightProgress=1;this.landingWindow=false;
    if(!this.landingArmed){
      this.state='crashed';this.speed=0;this.lateralVelocity=0;this.pending.clear();
      this.events.push({type:'explode',flightKind:this.flightKind});return;
    }
    const awarded=[...this.pending].filter(id=>{const o=this.obstacles.find(o=>o.id===id);return o&&!o.hit&&!o.cleared&&this.s>o.s+o.length/2+2;});
    for(const id of awarded){this.obstacles.find(o=>o.id===id).cleared=true;this.cleared++;this.score+=100;}
    const ramp=this.ramps.find(r=>r.id===this.rampId);
    const rampBonus=ramp&&!ramp.cleared?150:0;
    if(rampBonus){ramp.cleared=true;this.score+=rampBonus;}
    this.successfulJumps++;this.pending.clear();
    this.events.push({type:'land',points:awarded.length*100+rampBonus,rampBonus,flightKind:this.flightKind});
    this.flightKind=null;this.rampId=null;this.landingArmed=false;
  }
  update(dt,input={}){
    if(this.state!=='running'||!Number.isFinite(dt))return;
    dt=clamp(dt,0,.04);if(dt===0)return;
    this.time+=dt;this.recoverCooldown=Math.max(0,this.recoverCooldown-dt);
    this.charge=clamp(this.charge+dt/RECHARGE_TIME,0,1);
    const airborne=this.jumpTime>=0;
    const offroad=Math.abs(this.offset)>ROAD_WIDTH/2-.5;
    const gas=input.gas?1:0, brake=input.brake?1:0;
    const accel=gas*(28-this.speed*.19)-brake*48-(this.speed>0?2.2+this.speed*.035:0)-(offroad&&!airborne?20:0);
    this.speed=clamp(this.speed+accel*dt,0,MAX_SPEED);
    // Positive offset is driver-left in the track coordinate frame.
    const steer=(input.left?1:0)-(input.right?1:0);
    const targetLateral=steer*Math.min(12,this.speed*.36)*(airborne?.68:1);
    this.lateralVelocity=lerp(this.lateralVelocity,targetLateral,Math.min(1,dt*(airborne?3.1:6.5)));
    const prevOffset=this.offset;this.offset+=this.lateralVelocity*dt;
    const prevS=this.s;this.s+=this.speed*dt;this.distance+=this.speed*dt;
    let flightDt=dt;
    if(!airborne){
      const crossed=this.ramps.find(r=>prevS<r.s&&this.s>=r.s&&Math.abs(lerp(prevOffset,this.offset,(r.s-prevS)/(this.s-prevS))-r.offset)<=r.width/2);
      if(crossed){
        flightDt=dt*(this.s-crossed.s)/(this.s-prevS);
        this._launch('ramp',crossed.height,8+this.speed*.14,crossed.id);
      }else{
        const ramp=this.ramps.find(r=>this.s>=r.s-r.length&&this.s<r.s&&Math.abs(this.offset-r.offset)<=r.width/2);
        const previousRamp=this.ramps.find(r=>prevS>=r.s-r.length&&prevS<r.s&&Math.abs(prevOffset-r.offset)<=r.width/2);
        if(!ramp&&previousRamp&&rampSurfaceHeight(previousRamp,prevS)>.2){
          const side=Math.sign(this.offset-previousRamp.offset);
          const edge=previousRamp.offset+side*previousRamp.width/2;
          const fraction=clamp((edge-prevOffset)/(this.offset-prevOffset),0,1);
          const departureS=lerp(prevS,this.s,fraction);
          flightDt=dt*(1-fraction);
          // Side falls require a landing burn, but do not earn the lip-jump bonus.
          this._launch('ramp',rampSurfaceHeight(previousRamp,departureS),0,null,true);
        }else{
          this.height=ramp?rampSurfaceHeight(ramp,this.s):0;
          this.verticalVelocity=ramp?this.speed*2*ramp.height*(this.s-(ramp.s-ramp.length))/(ramp.length*ramp.length):0;
        }
      }
    }
    const flightFinished=this.jumpTime>=0&&this._advanceFlight(flightDt);
    const groundRamp=this.ramps.find(r=>this.s>=r.s-r.length&&this.s<r.s&&Math.abs(this.offset-r.offset)<=r.width/2);
    const surfaceHeight=groundRamp?rampSurfaceHeight(groundRamp,this.s):0;
    const touchdown=flightFinished||(this.jumpTime>=0&&this.verticalVelocity<0&&this.height<=surfaceHeight);
    for(const o of this.obstacles){
      const inLong=Math.abs(this.s-o.s)<o.length/2+2.5 || (prevS<o.s&&this.s>o.s);
      const inLat=Math.abs(this.offset-o.offset)<o.width/2+1.1;
      if(inLong&&inLat&&!o.cleared){
        if(this.height>o.height+.5&&this.jumpTime>=0&&!o.hit)this.pending.add(o.id);
        else if(this.height<=o.height+.5&&!o.hit){
          o.hit=true;this.pending.delete(o.id);this.speed*=o.type==='pothole'?.48:.23;
          this.events.push({type:'hit',obstacle:o.type});
        }
      }
      if(this.s<o.s-o.length/2-8)o.hit=false;
    }
    if(touchdown)this._touchdown(surfaceHeight);
    if(this.state!=='running')return;
    if(this.jumpTime<0&&Math.abs(this.offset)>ROAD_WIDTH/2+2)this.offroadTime+=dt;else this.offroadTime=0;
    if(Math.abs(this.offset)>ROAD_WIDTH/2+8||this.offroadTime>1.3)this.recover();
    const cp=Math.floor(this.s/400)*400;
    if(cp>this.checkpoint&&this.jumpTime<0){this.checkpoint=cp;this.events.push({type:'checkpoint'});}
    if(this.s>=this.length-12&&this.jumpTime<0){this.s=this.length-12;this.state='finished';this.speed=0;this.events.push({type:'finish'});}
  }
  drainEvents(){return this.events.splice(0);}
  nextObstacle(){return this.obstacles.find(o=>o.s>this.s+3&&!o.cleared);}
  nextRamp(){return this.ramps.find(r=>r.s>this.s&&!r.cleared);}
}
export function formatTime(t){const tenths=Math.round(Math.max(0,t)*10),mins=Math.floor(tenths/600),secs=((tenths%600)/10).toFixed(1).padStart(4,'0');return `${String(mins).padStart(2,'0')}:${secs}`;}




