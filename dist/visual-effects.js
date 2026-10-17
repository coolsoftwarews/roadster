import * as THREE from './vendor/three.module.min.js';

// These scenery textures and effects are generated locally. Particle buffers and skid marks are
// fixed size, so repeated crashes and long runs cannot grow GPU memory usage.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const random=(a,b)=>a+Math.random()*(b-a);
const TAU=Math.PI*2;

export function createAsphaltTexture(renderer){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(512,512);
  let seed=14279;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<pixels.data.length;i+=4){
    const grain=(rng()-.5)*28;
    const bright=99+grain;
    pixels.data[i]=bright;pixels.data[i+1]=bright+2;pixels.data[i+2]=bright+3;pixels.data[i+3]=255;
  }
  ctx.putImageData(pixels,0,0);
  // Fine aggregate at a consistent metre scale. Broad cracks are avoided so
  // tiling doesn't form an obvious grid.
  for(let i=0;i<4200;i++){
    const x=rng()*512,y=rng()*512,r=.35+rng()*.8;
    ctx.fillStyle=i%3?'rgba(185,185,175,.12)':'rgba(18,24,27,.16)';
    ctx.beginPath();ctx.ellipse(x,y,r,r*.65,rng()*3,0,TAU);ctx.fill();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
  // Supply UVs measured in metres / 4; the texture repeats every four metres.
  return texture;
}

export function createGroundTexture(renderer,trackId){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(256,256);let seed=5987;
  const rng=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<pixels.data.length;i+=4){const shade=224+rng()*28;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=shade;pixels.data[i+3]=255;}
  ctx.putImageData(pixels,0,0);
  const grassy=trackId==='austin'||trackId==='bay-area';
  for(let i=0;i<1900;i++){
    const x=rng()*256,y=rng()*256;ctx.strokeStyle=`rgba(55,64,47,${.04+rng()*.12})`;ctx.lineWidth=.5;
    ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rng()*2-1,y+(grassy?2+rng()*4:rng()));ctx.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(145,164);
  texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());return texture;
}

export function installEnvironment(scene,renderer,theme={}){
  const studio=new THREE.Scene();studio.background=new THREE.Color(theme.skyTop||'#9eafbb');
  const shell=new THREE.Mesh(new THREE.SphereGeometry(70,24,16),new THREE.ShaderMaterial({
    side:THREE.BackSide,uniforms:{skyColor:{value:new THREE.Color(theme.skyTop||'#7cabbf')},horizonColor:{value:new THREE.Color(theme.skyBottom||'#f6d4ab')},groundColor:{value:new THREE.Color(theme.hemisphereGround||'#b48b64').multiplyScalar(.28)}},
    vertexShader:'varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'varying vec3 dir;uniform vec3 skyColor;uniform vec3 horizonColor;uniform vec3 groundColor;void main(){float h=normalize(dir).y;vec3 c=h>0.?mix(horizonColor,skyColor,pow(h,.55)):mix(horizonColor,groundColor,pow(-h,.2));gl_FragColor=vec4(c,1.);}'
  }));studio.add(shell);
  const cards=[];
  for(const [x,y,z,w,h,intensity]of [[-25,25,20,38,20,2],[27,23,-15,28,15,.9],[0,38,-8,24,8,1.2]]){
    const card=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color('#f6e4d1').multiplyScalar(intensity),side:THREE.DoubleSide}));
    card.position.set(x,y,z);card.lookAt(0,0,0);studio.add(card);cards.push(card);
  }
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(studio,.03,1,100);
  scene.environment=target.texture;
  studio.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});pmrem.dispose();
  return {dispose(){if(scene.environment===target.texture)scene.environment=null;target.dispose();}};
}

function glowTexture(smoke=false){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d');
  if(smoke){
    for(let i=0;i<16;i++){
      const angle=i*2.39996,radius=11+13*(i%4)/3,x=64+Math.cos(angle)*radius,y=64+Math.sin(angle)*radius;
      const glow=ctx.createRadialGradient(x,y,0,x,y,35+(i%3)*4);glow.addColorStop(0,'rgba(255,255,255,.19)');glow.addColorStop(.55,'rgba(255,255,255,.12)');glow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);
    }
  }else{
    const glow=ctx.createRadialGradient(64,64,0,64,64,63);glow.addColorStop(0,'rgba(255,255,255,1)');glow.addColorStop(.12,'rgba(255,255,255,.95)');glow.addColorStop(.36,'rgba(255,255,255,.45)');glow.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,128,128);
  }
  return new THREE.CanvasTexture(canvas);
}

export function enhanceRoadster(car,wheels){
  const paint=new THREE.MeshPhysicalMaterial({color:'#f4f3ef',metalness:.55,roughness:.24,clearcoat:1,clearcoatRoughness:.12,envMapIntensity:1.15});
  const replaced=new Set();
  car.traverse(mesh=>{
    if(!mesh.isMesh||Array.isArray(mesh.material))return;
    if(mesh.material.color?.getHex()===0xf4f2e9){replaced.add(mesh.material);mesh.material=paint;}
    else if(mesh.material.isMeshPhysicalMaterial){mesh.material.roughness=.12;mesh.material.envMapIntensity=1.25;}
  });
  for(const material of replaced)material.dispose();
  const graphite=new THREE.MeshStandardMaterial({color:'#182125',metalness:.65,roughness:.36});
  const polished=new THREE.MeshStandardMaterial({color:'#d6e1e6',metalness:.94,roughness:.19});
  const discMaterial=new THREE.MeshStandardMaterial({color:'#425158',metalness:.85,roughness:.5});
  const ringGeometry=new THREE.TorusGeometry(.365,.021,6,32);
  const hubGeometry=new THREE.CylinderGeometry(.085,.085,.045,12);
  const discGeometry=new THREE.CylinderGeometry(.305,.305,.018,24);
  const spokeGeometry=new THREE.BoxGeometry(.04,.31,.045),transform=new THREE.Object3D();
  for(const wheel of wheels){
    const side=Math.sign(wheel.position.x),face=side*.205;
    const disc=new THREE.Mesh(discGeometry,discMaterial);disc.rotation.z=Math.PI/2;disc.position.x=face;wheel.add(disc);
    const ring=new THREE.Mesh(ringGeometry,polished);ring.rotation.y=Math.PI/2;ring.position.x=face+side*.018;wheel.add(ring);
    const hub=new THREE.Mesh(hubGeometry,graphite);hub.rotation.z=Math.PI/2;hub.position.x=face+side*.035;wheel.add(hub);
    const spokes=new THREE.InstancedMesh(spokeGeometry,polished,7);
    for(let i=0;i<7;i++){const angle=i*TAU/7;transform.position.set(face+side*.025,Math.cos(angle)*.2,Math.sin(angle)*.2);transform.rotation.set(angle,0,0);transform.scale.set(1,1,1);transform.updateMatrix();spokes.setMatrixAt(i,transform.matrix);}wheel.add(spokes);
  }
  const details=new THREE.Group();car.add(details);
  const lineVertices=[];
  function seam(a,b){lineVertices.push(...a,...b);}
  for(const sign of [-1,1]){
    seam([sign*1.085,.98,.62],[sign*1.105,.56,.62]);seam([sign*1.105,.56,.62],[sign*1.13,.52,-.92]);seam([sign*1.13,.52,-.92],[sign*1.13,1.11,-.98]);
    seam([sign*.52,.91,1.97],[sign*.65,1.01,1.02]);
    const handle=new THREE.Mesh(new THREE.BoxGeometry(.025,.045,.22),graphite);handle.position.set(sign*1.125,1.01,-.54);details.add(handle);
  }
  const seams=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lineVertices,3)),new THREE.LineBasicMaterial({color:'#525f62',transparent:true,opacity:.55}));details.add(seams);
  const fins=new THREE.InstancedMesh(new THREE.BoxGeometry(.035,.18,.48),graphite,5);
  for(let i=0;i<5;i++){transform.position.set((i-2)*.28,.45,-2.48);transform.rotation.set(-.13,0,0);transform.updateMatrix();fins.setMatrixAt(i,transform.matrix);}details.add(fins);
  const lens=glowTexture();
  for(const sign of [-1,1]){
    const brakeGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:lens,color:'#ff3028',transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false}));brakeGlow.position.set(sign*.72,1.035,-2.7);brakeGlow.scale.set(.45,.16,1);details.add(brakeGlow);
  }
  return details;
}

function particlePool(scene,count,texture,additive){
  const positions=new Float32Array(count*3),colors=new Float32Array(count*3),sizes=new Float32Array(count),alpha=new Float32Array(count);
  const velocity=new Float32Array(count*3),life=new Float32Array(count),duration=new Float32Array(count),baseSize=new Float32Array(count),growth=new Float32Array(count),gravity=new Float32Array(count),drag=new Float32Array(count),opacity=new Float32Array(count);
  const geometry=new THREE.BufferGeometry();
  for(const [name,array,components]of [['position',positions,3],['tint',colors,3],['particleSize',sizes,1],['particleAlpha',alpha,1]])geometry.setAttribute(name,new THREE.BufferAttribute(array,components).setUsage(THREE.DynamicDrawUsage));
  const material=new THREE.ShaderMaterial({
    uniforms:{map:{value:texture},screenScale:{value:600}},transparent:true,depthWrite:false,blending:additive?THREE.AdditiveBlending:THREE.NormalBlending,
    vertexShader:'attribute vec3 tint;attribute float particleSize;attribute float particleAlpha;uniform float screenScale;varying vec3 vTint;varying float vAlpha;void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(particleSize*screenScale/max(1.,-p.z),0.,220.);vTint=tint;vAlpha=particleAlpha;}',
    fragmentShader:'uniform sampler2D map;varying vec3 vTint;varying float vAlpha;void main(){float a=texture2D(map,gl_PointCoord).a*vAlpha;if(a<.008)discard;gl_FragColor=vec4(vTint,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'
  });
  const points=new THREE.Points(geometry,material);points.frustumCulled=false;points.renderOrder=additive?3:2;scene.add(points);
  let cursor=0;
  function emit(x,y,z,vx,vy,vz,seconds,size,expand,color,transparency=1,pull=0,friction=0){
    const i=cursor++%count,j=i*3;positions[j]=x;positions[j+1]=y;positions[j+2]=z;velocity[j]=vx;velocity[j+1]=vy;velocity[j+2]=vz;
    life[i]=duration[i]=seconds;baseSize[i]=size;growth[i]=expand;gravity[i]=pull;drag[i]=friction;opacity[i]=transparency;
    colors[j]=color.r;colors[j+1]=color.g;colors[j+2]=color.b;sizes[i]=size;alpha[i]=transparency;
  }
  function update(dt,scale){
    material.uniforms.screenScale.value=scale;
    for(let i=0;i<count;i++){
      if(life[i]<=0)continue;life[i]-=dt;
      if(life[i]<=0){alpha[i]=0;sizes[i]=0;continue;}
      const j=i*3,age=1-life[i]/duration[i],damping=Math.exp(-drag[i]*dt);
      velocity[j]*=damping;velocity[j+2]*=damping;velocity[j+1]+=gravity[i]*dt;
      positions[j]+=velocity[j]*dt;positions[j+1]+=velocity[j+1]*dt;positions[j+2]+=velocity[j+2]*dt;
      sizes[i]=baseSize[i]+growth[i]*age;alpha[i]=opacity[i]*Math.pow(1-age,1.25)*Math.min(1,(age+.12)*7);
    }
    geometry.attributes.position.needsUpdate=true;geometry.attributes.tint.needsUpdate=true;geometry.attributes.particleSize.needsUpdate=true;geometry.attributes.particleAlpha.needsUpdate=true;
  }
  return {emit,update,reset(){life.fill(0);alpha.fill(0);sizes.fill(0);geometry.attributes.particleAlpha.needsUpdate=true;geometry.attributes.particleSize.needsUpdate=true;},dispose(){scene.remove(points);geometry.dispose();material.dispose();}};
}

export function createVisualEffects({scene,renderer}){
  const soft=glowTexture(true),glow=glowTexture();
  const smoke=particlePool(scene,280,soft,false),fire=particlePool(scene,220,glow,true),sparks=particlePool(scene,110,glow,true);
  const sand=new THREE.Color('#ba9b78'),rubber=new THREE.Color('#b6b7b3'),soot=new THREE.Color('#373b3f'),cyan=new THREE.Color('#46baff'),ice=new THREE.Color('#e4faff'),gold=new THREE.Color('#ffb343'),orange=new THREE.Color('#ff531a');
  const currentForward=new THREE.Vector3(0,0,1),tmp=new THREE.Object3D();let emission=0,skidClock=0,markCursor=0,lastAirborne=false;
  const markCount=160,markLife=new Float32Array(markCount),markAlpha=new Float32Array(markCount);
  const markGeo=new THREE.PlaneGeometry(.26,1);markGeo.setAttribute('markAlpha',new THREE.InstancedBufferAttribute(markAlpha,1));
  const markMaterial=new THREE.MeshBasicMaterial({color:'#101619',transparent:true,opacity:.46,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  markMaterial.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float markAlpha;varying float vMarkAlpha;').replace('#include <begin_vertex>','#include <begin_vertex>\nvMarkAlpha=markAlpha;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vMarkAlpha;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a*=vMarkAlpha;');};
  const marks=new THREE.InstancedMesh(markGeo,markMaterial,markCount);marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);marks.frustumCulled=false;marks.renderOrder=1;scene.add(marks);
  tmp.scale.set(0,0,0);tmp.updateMatrix();for(let i=0;i<markCount;i++)marks.setMatrixAt(i,tmp.matrix);
  const ringMaterial=new THREE.MeshBasicMaterial({color:'#ffdba0',transparent:true,opacity:0,side:THREE.DoubleSide,depthWrite:false,blending:THREE.AdditiveBlending});
  const shock=new THREE.Mesh(new THREE.RingGeometry(.88,1,64),ringMaterial);shock.rotation.x=-Math.PI/2;shock.visible=false;scene.add(shock);let shockLife=0;
  const flash=new THREE.Sprite(new THREE.SpriteMaterial({map:glow,color:'#fff1b2',opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));scene.add(flash);let flashLife=0;
  const debrisCount=18,debrisGeo=new THREE.BoxGeometry(1,1,1),debrisMat=new THREE.MeshStandardMaterial({color:'#282d2d',metalness:.65,roughness:.5});
  const debris=new THREE.InstancedMesh(debrisGeo,debrisMat,debrisCount);debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);debris.frustumCulled=false;scene.add(debris);
  const debrisState=Array.from({length:debrisCount},()=>({x:0,y:0,z:0,vx:0,vy:0,vz:0,rx:0,ry:0,rz:0,size:.1,life:0,floor:0}));
  for(let i=0;i<debrisCount;i++)debris.setMatrixAt(i,tmp.matrix);

  function thrust(at){
    if(!lastAirborne)for(let i=0;i<24;i++){const a=random(0,TAU),r=random(.2,1.9);smoke.emit(at.x+Math.cos(a)*r,at.y+.1,at.z+Math.sin(a)*r,Math.cos(a)*random(2,6),random(.5,1.9),Math.sin(a)*random(2,6),random(.4,1.1),random(.5,1.2),2,sand,.4,-.4,1);}
    for(let i=0;i<26;i++){const rear=random(1.8,3.3);fire.emit(at.x-currentForward.x*rear+random(-.8,.8),at.y+random(.3,.8),at.z-currentForward.z*rear+random(-.8,.8),-currentForward.x*random(10,18),random(-.4,.9),-currentForward.z*random(10,18),random(.14,.35),random(.3,.7),.5,i%2?ice:cyan,.8);}
  }
  function land(at){
    for(let i=0;i<42;i++){const a=random(0,TAU),v=random(2,10);smoke.emit(at.x+Math.cos(a),at.y+.13,at.z+Math.sin(a)*1.8,Math.cos(a)*v,random(.3,1.8),Math.sin(a)*v,random(.55,1.5),random(.6,1.5),2.6,sand,.52,-.3,1.8);}
  }
  function collision(at){
    for(let i=0;i<28;i++)sparks.emit(at.x+random(-1,1),at.y+random(.2,1),at.z+random(-1,1),random(-8,8),random(2,8),random(-8,8),random(.2,.8),random(.04,.12),-.02,gold,.95,-16,.3);
    for(let i=0;i<12;i++)smoke.emit(at.x+random(-1.2,1.2),at.y+.4,at.z+random(-1.2,1.2),random(-3,3),random(.5,2),random(-3,3),random(.4,1),.7,2,sand,.4);
  }
  function explode(at){
    for(let i=0;i<80;i++){const a=random(0,TAU),v=random(1,12),lift=random(1,11);fire.emit(at.x+random(-1,1),at.y+random(.3,1.9),at.z+random(-1.5,1.5),Math.cos(a)*v,lift,Math.sin(a)*v,random(.35,1.25),random(1,3),random(2,4),i%3?orange:gold,1,-5,1.6);}
    for(let i=0;i<85;i++){const a=random(0,TAU),v=random(.5,8);smoke.emit(at.x+random(-1,1),at.y+random(.2,2),at.z+random(-1.5,1.5),Math.cos(a)*v,random(2,7),Math.sin(a)*v,random(1.3,3.2),random(1.3,2.7),random(3,7),i%4?soot:sand,.85,.3,.7);}
    for(let i=0;i<80;i++)sparks.emit(at.x,at.y+1,at.z,random(-18,18),random(3,16),random(-18,18),random(.4,1.7),random(.06,.19),-.04,gold,1,-15,.4);
    for(const p of debrisState){p.x=at.x+random(-1,1);p.y=at.y+random(.5,1.5);p.z=at.z+random(-1,1);p.vx=random(-12,12);p.vy=random(4,14);p.vz=random(-12,12);p.rx=random(0,6);p.ry=random(0,6);p.rz=random(0,6);p.size=random(.12,.36);p.life=2.4;p.floor=at.y+.07;}
    shock.position.copy(at);shock.position.y+=.17;shock.scale.setScalar(1);shock.visible=true;shockLife=.75;
    flash.position.copy(at);flash.position.y+=1;flash.scale.set(18,18,1);flashLife=.32;
  }
  function emitJet(position,forward,speed){
    const nx=forward.z,nz=-forward.x;
    for(const side of [-1,1]){
      const x=position.x-forward.x*2.8+nx*.65*side,y=position.y+.66,z=position.z-forward.z*2.8+nz*.65*side;
      fire.emit(x,y,z,forward.x*(speed-24)+random(-1,1),random(-.7,.7),forward.z*(speed-24)+random(-1,1),random(.13,.24),random(.28,.5),.8,Math.random()>.45?cyan:ice,.85);
      fire.emit(position.x+nx*.8*side,position.y-.1,position.z,forward.x*speed,random(-13,-7),forward.z*speed,random(.12,.24),.35,.65,cyan,.7);
    }
  }
  function mark(position,forward,speed){
    const nx=forward.z,nz=-forward.x,yaw=Math.atan2(forward.x,forward.z);
    for(const side of [-1,1]){const i=markCursor++%markCount;tmp.position.set(position.x-forward.x*1.6+nx*side,position.y+.1,position.z-forward.z*1.6+nz*side);tmp.rotation.set(-Math.PI/2,0,-yaw);tmp.scale.set(1,clamp(speed*.055,.35,3.8),1);tmp.updateMatrix();marks.setMatrixAt(i,tmp.matrix);markLife[i]=14;markAlpha[i]=.8;}
    marks.instanceMatrix.needsUpdate=true;
  }
  function update(dt,{position,forward,speed=0,corner=0,airborne=false,playing=false,thrusting=false}){
    dt=clamp(dt,0,.05);if(forward)currentForward.copy(forward);lastAirborne=airborne;
    const pixelHeight=renderer.domElement.height,screenScale=pixelHeight*.86;
    if(playing){
      emission+=dt;let emitted=0;
      while(emission>=.018&&emitted++<4){
        emission-=.018;
        if(thrusting)emitJet(position,currentForward,speed);
        if(!airborne&&speed>10&&corner>.28){
          const side=Math.random()>.5?1:-1,x=position.x-currentForward.x*1.55+currentForward.z*side,z=position.z-currentForward.z*1.55-currentForward.x*side;
          smoke.emit(x,position.y+.22,z,currentForward.x*speed*.16+random(-.8,.8),random(.3,.9),currentForward.z*speed*.16+random(-.8,.8),random(.55,1),random(.45,.8),2.1,rubber,clamp(corner*.23,.07,.38),.1,.8);
        }
      }
      skidClock+=dt;if(!airborne&&speed>16&&corner>.6&&skidClock>.045){mark(position,currentForward,speed);skidClock=0;}
    }else emission=0;
    smoke.update(dt,screenScale);fire.update(dt,screenScale);sparks.update(dt,screenScale);
    for(let i=0;i<markCount;i++){if(markLife[i]>0){markLife[i]=Math.max(0,markLife[i]-dt);markAlpha[i]=clamp(markLife[i]/5,0,.8);}}markGeo.attributes.markAlpha.needsUpdate=true;
    if(shockLife>0){shockLife=Math.max(0,shockLife-dt);shock.scale.setScalar(1+(1-shockLife/.75)*20);ringMaterial.opacity=shockLife*.65;shock.visible=shockLife>0;}
    if(flashLife>0){flashLife=Math.max(0,flashLife-dt);flash.material.opacity=flashLife*2.2;flash.scale.setScalar(12+(1-flashLife/.32)*15);}
    let debrisChanged=false;
    for(let i=0;i<debrisCount;i++){
      const p=debrisState[i];if(p.life<=0)continue;p.life-=dt;debrisChanged=true;
      if(p.life<=0){tmp.scale.set(0,0,0);}else{
        p.vy-=18*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
        if(p.y<p.floor){p.y=p.floor;p.vy=Math.abs(p.vy)*.24;p.vx*=.89;p.vz*=.89;}
        p.rx+=dt*4;p.ry+=dt*5;p.rz+=dt*3;tmp.position.set(p.x,p.y,p.z);tmp.rotation.set(p.rx,p.ry,p.rz);const s=p.size*Math.min(1,p.life*2);tmp.scale.set(s*1.6,s*.45,s);
      }
      tmp.updateMatrix();debris.setMatrixAt(i,tmp.matrix);
    }
    if(debrisChanged)debris.instanceMatrix.needsUpdate=true;
  }
  function reset(){
    smoke.reset();fire.reset();sparks.reset();markLife.fill(0);markAlpha.fill(0);markGeo.attributes.markAlpha.needsUpdate=true;
    shock.visible=false;shockLife=flashLife=0;flash.material.opacity=0;emission=skidClock=0;lastAirborne=false;
    tmp.scale.set(0,0,0);tmp.updateMatrix();for(let i=0;i<debrisCount;i++){debrisState[i].life=0;debris.setMatrixAt(i,tmp.matrix);}debris.instanceMatrix.needsUpdate=true;
  }
  function dispose(){reset();smoke.dispose();fire.dispose();sparks.dispose();for(const mesh of [marks,shock,flash,debris]){scene.remove(mesh);mesh.geometry?.dispose();mesh.material.dispose();}soft.dispose();glow.dispose();}
  return {update,thrust,land,collision,explode,reset,dispose};
}
