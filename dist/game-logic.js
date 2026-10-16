export const ROAD_WIDTH = 19;
export const MAX_SPEED = 73;
export const JUMP_DURATION = 1.66;
export const JUMP_HEIGHT = 6.4;
export const RECHARGE_TIME = 2.1;
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
export class Run {
  constructor(length) { this.length=length; this.obstacles=makeObstacles(length); this.reset(); }
  reset(){
    this.s=7;this.offset=0;this.speed=0;this.lateralVelocity=0;this.time=0;this.score=0;this.cleared=0;this.successfulJumps=0;
    this.height=0;this.jumpTime=-1;this.charge=1;this.checkpoint=7;this.state='ready';this.events=[];this.pending=new Set();this.recoverCooldown=0;this.offroadTime=0;this.roll=0;this.distance=0;
    for(const o of this.obstacles){o.cleared=false;o.hit=false;}
  }
  start(){this.state='running';}
  jump(){
    if(this.state!=='running'||this.jumpTime>=0||this.charge<.999||this.speed<5)return false;
    this.jumpTime=0;this.charge=0;this.pending.clear();this.events.push({type:'jump'});return true;
  }
  recover(){
    if(this.state!=='running'||this.recoverCooldown>0)return;
    this.s=this.checkpoint;this.speed=0;this.offset=0;this.lateralVelocity=0;this.height=0;this.jumpTime=-1;this.roll=0;this.pending.clear();this.recoverCooldown=1;this.offroadTime=0;
    for(const o of this.obstacles)o.hit=false;
    this.events.push({type:'recover'});
  }
  update(dt,input){
    if(this.state!=='running')return;
    dt=clamp(dt,0,.04);this.time+=dt;this.recoverCooldown=Math.max(0,this.recoverCooldown-dt);
    this.charge=clamp(this.charge+dt/RECHARGE_TIME,0,1);
    const airborne=this.jumpTime>=0;
    const offroad=Math.abs(this.offset)>ROAD_WIDTH/2-.5;
    const gas=input.gas?1:0, brake=input.brake?1:0;
    const accel=gas*(28-this.speed*.19)-brake*48-(this.speed>0?2.2+this.speed*.035:0)-(offroad&&!airborne?20:0);
    this.speed=clamp(this.speed+accel*dt,0,MAX_SPEED);
    const steer=(input.left?1:0)-(input.right?1:0);
    const targetLateral=steer*Math.min(12,this.speed*.36)*(airborne?.68:1);
    this.lateralVelocity=lerp(this.lateralVelocity,targetLateral,Math.min(1,dt*(airborne?3.1:6.5)));
    this.offset+=this.lateralVelocity*dt;
    const prevS=this.s;this.s+=this.speed*dt;this.distance+=this.speed*dt;
    if(this.jumpTime>=0){
      this.jumpTime+=dt;const t=clamp(this.jumpTime/JUMP_DURATION,0,1);
      this.height=JUMP_HEIGHT*4*t*(1-t);
      const phase=clamp((t-.1)/.8,0,1);this.roll=2*Math.PI*(phase*phase*(3-2*phase));
      if(t>=1){
        this.height=0;this.roll=0;this.jumpTime=-1;
        const awarded=[...this.pending].filter(id=>{const o=this.obstacles[id];return !o.hit&&!o.cleared&&this.s>o.s+o.length/2+2;});
        for(const id of awarded){this.obstacles[id].cleared=true;this.cleared++;this.score+=100;}
        if(awarded.length)this.successfulJumps++;
        this.pending.clear();this.events.push({type:'land',points:awarded.length*100});
      }
    }
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
    if(!airborne&&Math.abs(this.offset)>ROAD_WIDTH/2+2)this.offroadTime+=dt;else this.offroadTime=0;
    if(Math.abs(this.offset)>ROAD_WIDTH/2+8||this.offroadTime>1.3)this.recover();
    const cp=Math.floor(this.s/400)*400;
    if(cp>this.checkpoint&&this.jumpTime<0){this.checkpoint=cp;this.events.push({type:'checkpoint'});}
    if(this.s>=this.length-12){this.s=this.length-12;this.state='finished';this.speed=0;this.events.push({type:'finish'});}
  }
  drainEvents(){return this.events.splice(0);}
  nextObstacle(){return this.obstacles.find(o=>o.s>this.s+3&&!o.cleared);}
}
export function formatTime(t){const mins=Math.floor(t/60),secs=(t%60).toFixed(1).padStart(4,'0');return `${String(mins).padStart(2,'0')}:${secs}`;}
