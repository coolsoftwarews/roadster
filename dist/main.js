import * as THREE from './vendor/three.module.min.js';
import {Run,ROAD_WIDTH,JUMP_DURATION,RECHARGE_TIME,clamp,lerp,formatTime} from './game-logic.js?v=drive-2';
import {DrivingAudio} from './audio.js?v=drive-2';
import {loadBest,saveBest,loadDriver,saveDriver,normalizeDriver,displayDriver,loadResult,saveResult,buildXIntent} from './result-sharing.js?v=cinematic-1';
import {renderResultCard} from './result-card.js?v=cinematic-1';
import {chaseCameraPosition} from './driving-view.js?v=flight-3';
import {createVisualEffects,createAsphaltTexture,installEnvironment,enhanceRoadster,createGroundTexture} from './visual-effects.js?v=realism-1';
import {loadDetailedRoadster} from './detailed-roadster.js?v=model-loading-1';

import {DIFFICULTIES,getDifficulty} from './difficulty.js?v=drive-2';
import {setupRadio} from './radio-ui.js?v=cinematic-1';
import {setupSoundControls} from './sound-ui.js?v=cinematic-1';
import {TRACKS,getTrack} from './tracks.js?v=cinematic-1';
import {installTrackScenery} from './track-scenery.js?v=cinematic-1';
import {WEATHER_OPTIONS,normalizeWeather,resolveWeather,createWeather} from './weather.js?v=cinematic-1';
import {createCockpit} from './cockpit.js?v=cinematic-1';
const $=id=>document.getElementById(id);
let rememberedTrack='canyon';try{rememberedTrack=localStorage.getItem('roadster-run-track')||'canyon';}catch{}
const track=getTrack(new URLSearchParams(location.search).get('track')??rememberedTrack);
try{localStorage.setItem('roadster-run-track',track.id);}catch{}
let rememberedDifficulty='easy';try{rememberedDifficulty=localStorage.getItem('roadster-run-difficulty')||'easy';}catch{}
const difficulty=getDifficulty(new URLSearchParams(location.search).get('difficulty')??rememberedDifficulty);
try{localStorage.setItem('roadster-run-difficulty',difficulty.id);}catch{}
for(const option of DIFFICULTIES){
  const label=document.createElement('label');label.className='difficulty-option';
  const control=document.createElement('input');control.type='radio';control.name='difficulty';control.value=option.id;control.checked=option.id===difficulty.id;
  const caption=document.createElement('span');caption.textContent=option.name;
  control.addEventListener('change',()=>{try{localStorage.setItem('roadster-run-difficulty',option.id);}catch{}const url=new URL(location.href);url.searchParams.set('difficulty',option.id);location.assign(url.href);});
  label.append(control,caption);$('difficulty-options').appendChild(label);
}
$('difficulty-description').textContent=difficulty.description;
$('difficulty-description').classList.toggle('hidden',!difficulty.description);
$('hud-difficulty').textContent=difficulty.name.toUpperCase();
document.title='Roadster Run — '+track.name;
document.documentElement.style.setProperty('--accent',track.theme.accent);
$('brand-track').textContent=track.name.toUpperCase()+' — '+track.number;
$('world').setAttribute('aria-label','Three dimensional '+track.name+' racing track');
$('brief-track').textContent=track.number+' / '+track.city.toUpperCase();
$('track-title').textContent=track.name;
$('track-description').textContent=track.description;
for(const option of TRACKS){
  const link=document.createElement('a');link.className='track-option'+(option.id===track.id?' selected':'');
  const destination=new URL(location.href);destination.searchParams.set('track',option.id);link.href=destination.href;
  link.setAttribute('aria-label','Select '+option.name);if(option.id===track.id)link.setAttribute('aria-current','true');
  link.style.setProperty('--track-color',option.theme.accent);
  const xs=option.controls.map(p=>p[0]),zs=option.controls.map(p=>p[2]);
  const minX=Math.min(...xs),minZ=Math.min(...zs),scale=Math.min(135/(Math.max(...xs)-minX),49/(Math.max(...zs)-minZ));
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 '+(24+(Math.max(...xs)-minX)*scale)+' 65');svg.setAttribute('aria-hidden','true');
  const route=document.createElementNS(svg.namespaceURI,'polyline');route.setAttribute('points',option.controls.map(p=>(12+(p[0]-minX)*scale)+','+(57-(p[2]-minZ)*scale)).join(' '));svg.appendChild(route);link.appendChild(svg);
  const number=document.createElement('small');number.textContent=option.number+' / '+option.city.toUpperCase();link.appendChild(number);
  const name=document.createElement('strong');name.textContent=option.name;link.appendChild(name);
  const desc=document.createElement('span');desc.textContent=option.tagline;link.appendChild(desc);
  $('track-options').appendChild(link);
}
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('intro').classList.add('hidden');$('error').classList.remove('hidden');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
$('world').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color(track.theme.skyTop);scene.fog=new THREE.FogExp2(track.theme.fog,.00165);
const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.2,2200);
scene.add(camera);
const cockpit=createCockpit(THREE,camera);cockpit.root.visible=false;
const hemisphere=new THREE.HemisphereLight('#dbeaff',track.theme.hemisphereGround,1.65);scene.add(hemisphere);
let environment=installEnvironment(scene,renderer,track.theme);
const sun=new THREE.DirectionalLight(track.theme.sunColor,track.theme.sunIntensity);sun.position.set(-150,180,90);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-60;sun.shadow.camera.near=1;sun.shadow.camera.far=500;sun.shadow.normalBias=.15;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
const skyGeo=new THREE.SphereGeometry(1800,28,16);const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(track.theme.skyTop)},bottom:{value:new THREE.Color(track.theme.skyBottom)}},vertexShader:'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v; uniform vec3 top; uniform vec3 bottom; void main(){float f=pow(max(0.,normalize(v).y),.55);gl_FragColor=vec4(mix(bottom,top,f),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}'});const sky=new THREE.Mesh(skyGeo,skyMat);scene.add(sky);
const sunBall=new THREE.Mesh(new THREE.SphereGeometry(24,24,12),new THREE.MeshBasicMaterial({color:'#fff1cf'}));sunBall.position.set(-780,260,720);scene.add(sunBall);

const controls=track.controls;
const curve=new THREE.CatmullRomCurve3(controls.map(p=>new THREE.Vector3(...p)),false,'centripetal');
curve.arcLengthDivisions=2500;const length=curve.getLength();const run=new Run(length,track,difficulty.id);
const samples=Array.from({length:1601},(_,i)=>curve.getPointAt(i/1600));
function frame(s){
  const u=clamp(s/length,0,.99999),p=curve.getPointAt(u),t=curve.getTangentAt(u);const yaw=Math.atan2(t.x,t.z),right=new THREE.Vector3(t.z,0,-t.x).normalize();
  const a=curve.getTangentAt(clamp(u-.003,0,1)),b=curve.getTangentAt(clamp(u+.003,0,1));
  let diff=Math.atan2(b.x,b.z)-Math.atan2(a.x,a.z);while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;
  const curvature=diff/(length*.006),bank=clamp(-curvature*6,-.11,.11);
  return {p,t,right,yaw,curvature,bank};
}
function pointOn(s,offset=0,height=0){const f=frame(s);return f.p.clone().addScaledVector(f.right,offset).add(new THREE.Vector3(0,height+f.bank*offset,0));}
const frames=Array.from({length:1401},(_,i)=>frame(length*i/1400));
function ribbon(left,right,height,material,colored=false){
  if(left>right)[left,right]=[right,left];
  const p=[],colors=[],indices=[],uvs=[];
  for(let i=0;i<frames.length;i++){
    const f=frames[i];const stripe=Math.floor(i/3)%2;const color=new THREE.Color(stripe?'#e9ddc7':(track.theme.curbColor||{canyon:'#c94737',austin:'#c2a777',miami:'#35a8a3','bay-area':'#be553b'}[track.id]||track.theme.accent));
    for(const side of [left,right]){const v=f.p.clone().addScaledVector(f.right,side);p.push(v.x,v.y+height+f.bank*side,v.z);uvs.push((side-left)/4,i/1400*length/4);if(colored)colors.push(color.r,color.g,color.b);}
    if(i<frames.length-1){let k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(indices);geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));if(colored)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
const roadTexture=createAsphaltTexture(renderer);
const asphalt=new THREE.MeshStandardMaterial({color:'#9ca3a7',map:roadTexture,bumpMap:roadTexture,bumpScale:.018,roughness:.91});
const curbMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
const paintMat=new THREE.MeshStandardMaterial({color:'#e9ddbd',roughness:1});
ribbon(-ROAD_WIDTH/2,ROAD_WIDTH/2,.02,asphalt);
for(const sign of [-1,1]){ribbon(sign*9.5,sign*10.2,.05,curbMat,true);ribbon(sign*9.18,sign*9.3,.055,paintMat);}
const dashGeo=new THREE.BoxGeometry(.13,.025,4);const dashMat=new THREE.MeshStandardMaterial({color:'#c7b99b',roughness:1});
const dashMesh=new THREE.InstancedMesh(dashGeo,dashMat,Math.floor(length/18));const dummy=new THREE.Object3D();
for(let i=0;i<dashMesh.count;i++){const f=frame(16+i*18);dummy.position.copy(f.p);dummy.position.y+=.05;dummy.rotation.set(0,f.yaw,0);dummy.updateMatrix();dashMesh.setMatrixAt(i,dummy.matrix);}scene.add(dashMesh);


const postCount=Math.floor(length/24)*2;const posts=new THREE.InstancedMesh(new THREE.BoxGeometry(.13,.95,.13),new THREE.MeshStandardMaterial({color:'#d9d5c8',roughness:.7}),postCount);const reflectors=new THREE.InstancedMesh(new THREE.BoxGeometry(.16,.16,.14),new THREE.MeshStandardMaterial({color:'#ffac62',emissive:'#d06328',emissiveIntensity:.8}),postCount);let postIndex=0;for(let s=20;s<length-24;s+=24){for(const side of [-1,1]){const pf=frame(s);dummy.position.copy(pointOn(s,side*10.5,.48));dummy.rotation.set(0,pf.yaw,0);dummy.scale.set(1,1,1);dummy.updateMatrix();posts.setMatrixAt(postIndex,dummy.matrix);dummy.position.y+=.3;dummy.updateMatrix();reflectors.setMatrixAt(postIndex++,dummy.matrix);}}posts.count=reflectors.count=postIndex;scene.add(posts,reflectors);

let seed=track.seed;function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
function nearestTrack(x,z){let best=Infinity,near=frames[0];for(let i=0;i<frames.length;i+=4){const f=frames[i],d=(x-f.p.x)**2+(z-f.p.z)**2;if(d<best){best=d;near=f;}}return {d:Math.sqrt(best),y:near.p.y};}
const terrainGeo=new THREE.PlaneGeometry(2300,2600,115,130);terrainGeo.rotateX(-Math.PI/2);terrainGeo.translate(300,0,650);
const tp=terrainGeo.attributes.position,tc=[];
for(let i=0;i<tp.count;i++){
  const x=tp.getX(i),z=tp.getZ(i),near=nearestTrack(x,z);
  const natural=-14+Math.sin(x*.012)*8+Math.cos(z*.009)*9+Math.sin(x*.035+z*.025)*3;
  const blend=clamp((near.d-12)/43,0,1);tp.setY(i,lerp(near.y-.32,natural,blend));
  const grain=Math.sin(x*.026)*Math.cos(z*.023);const c=new THREE.Color().setHSL(track.theme.groundHue+grain*.008,track.theme.groundSaturation,track.theme.groundLightness+grain*.025+random()*.012);tc.push(c.r,c.g,c.b);
}terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(tc,3));terrainGeo.computeVertexNormals();const groundTexture=createGroundTexture(renderer,track.id);const terrain=new THREE.Mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,map:groundTexture,bumpMap:groundTexture,bumpScale:.18,roughness:1,flatShading:false}));terrain.receiveShadow=true;scene.add(terrain);
const strataCanvas=document.createElement('canvas');strataCanvas.width=128;strataCanvas.height=512;const strataCtx=strataCanvas.getContext('2d');strataCtx.fillStyle='#d6b497';strataCtx.fillRect(0,0,128,512);for(let y=0;y<512;y+=3){const a=.02+Math.random()*.10;strataCtx.fillStyle='rgba(67,34,17,'+a+')';strataCtx.fillRect(0,y,128,1+Math.random()*4);}const strataTexture=new THREE.CanvasTexture(strataCanvas);strataTexture.wrapS=strataTexture.wrapT=THREE.RepeatWrapping;strataTexture.colorSpace=THREE.SRGBColorSpace;
const sandstone=[new THREE.MeshStandardMaterial({color:'#c49271',map:strataTexture,roughness:1,flatShading:true}),new THREE.MeshStandardMaterial({color:'#dfb58a',map:strataTexture,roughness:1,flatShading:true}),new THREE.MeshStandardMaterial({color:'#ad7c61',map:strataTexture,roughness:1,flatShading:true})];
for(let i=0;i<(track.id==='canyon'?115:0);i++){
  const x=random()*1900-650,z=random()*2200-450,near=nearestTrack(x,z);if(near.d<75)continue;
  const radius=22+random()*55,h=25+random()*115;const group=new THREE.Group();
  for(let k=0;k<3;k++){const r=radius*(1-k*.17);const rock=new THREE.Mesh(new THREE.CylinderGeometry(r*.76,r,h/3,5+Math.floor(random()*3),1),sandstone[(i+k)%3]);rock.position.y=h/6+k*h/3;rock.rotation.y=i*.83;rock.castShadow=true;rock.receiveShadow=true;group.add(rock);}
  group.position.set(x,-19,z);scene.add(group);
}
const rockGeo=new THREE.DodecahedronGeometry(1,0),rockMesh=new THREE.InstancedMesh(rockGeo,sandstone[1],750);let rockCount=0;
const bushMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#737450',roughness:1,flatShading:true}),450);let bushCount=0;
for(let i=0;i<(track.id==='canyon'?1300:0);i++){
  const s=random()*length,f=frame(s),side=(random()>.5?1:-1)*(13+random()*33),v=f.p.clone().addScaledVector(f.right,side),near=nearestTrack(v.x,v.z);if(near.d<11)continue;
  const size=.35+random()*2.3;dummy.position.copy(v);dummy.position.y-=.3+Math.max(0,Math.abs(side)-13)*.18;dummy.rotation.set(random(),random()*6,random());dummy.scale.set(size,size*.7,size);dummy.updateMatrix();
  if(i%3&&rockCount<750)rockMesh.setMatrixAt(rockCount++,dummy.matrix);else if(bushCount<450){dummy.scale.set(size*.8,size*.45,size*.8);dummy.updateMatrix();bushMesh.setMatrixAt(bushCount++,dummy.matrix);}
}rockMesh.count=rockCount;rockMesh.castShadow=true;rockMesh.receiveShadow=true;bushMesh.count=bushCount;bushMesh.castShadow=true;scene.add(rockMesh,bushMesh);

const scenery=installTrackScenery({scene,track,frame,pointOn,nearestTrack,length,THREE});
const weather=createWeather({THREE,scene,renderer,camera,sun,hemisphere,skyMaterial:skyMat,sunBall,asphalt,theme:track.theme});
let weatherChoice='auto';try{weatherChoice=normalizeWeather(localStorage.getItem('roadster-run-weather'));}catch{}
weatherChoice=normalizeWeather(new URLSearchParams(location.search).get('weather')??weatherChoice);
for(const option of WEATHER_OPTIONS){const item=document.createElement('option');item.value=option.id;item.textContent=option.name;$('weather-select').appendChild(item);}
$('weather-select').value=weatherChoice;
function applyWeather(){
  const automatic=weatherChoice==='auto';
  const resolved=resolveWeather(automatic&&track.theme.defaultWeather?(Math.random()<.18?'rainy':track.theme.defaultWeather):weatherChoice);
  weather.apply(resolved);scenery?.userData.setNightIntensity?.(resolved.nightFactor);
  environment.dispose();environment=installEnvironment(scene,renderer,{...track.theme,skyTop:resolved.skyTop||track.theme.skyTop,skyBottom:resolved.skyBottom||track.theme.skyBottom,hemisphereGround:resolved.hemisphereGround||track.theme.hemisphereGround});
  $('weather-description').textContent=(automatic?'Auto · ':'')+resolved.name+(automatic?' selected for this drive.':'');
  for(const link of $('track-options').querySelectorAll('a')){const url=new URL(link.href);url.searchParams.set('weather',weatherChoice);link.href=url.href;}
  document.body.dataset.weather=resolved.id;
}
$('weather-select').addEventListener('change',()=>{weatherChoice=normalizeWeather($('weather-select').value);try{localStorage.setItem('roadster-run-weather',weatherChoice);}catch{}const url=new URL(location.href);url.searchParams.set('weather',weatherChoice);history.replaceState(null,'',url);applyWeather();});
applyWeather();

function box(parent,w,h,d,x,y,z,mat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
const black=new THREE.MeshStandardMaterial({color:'#111b21',roughness:.46});const tireMat=new THREE.MeshStandardMaterial({color:'#14191b',roughness:.9});const alloy=new THREE.MeshStandardMaterial({color:'#66747c',metalness:.8,roughness:.27});
function wheel(parent,x,y,z,r=.55,width=.38){const g=new THREE.Group();const tire=new THREE.Mesh(new THREE.CylinderGeometry(r,r,width,16),tireMat);tire.rotation.z=Math.PI/2;g.add(tire);const rim=new THREE.Mesh(new THREE.CylinderGeometry(r*.66,r*.66,width+.015,10),alloy);rim.rotation.z=Math.PI/2;g.add(rim);g.position.set(x,y,z);g.castShadow=true;parent.add(g);return g;}
function shell(rings,mat){const p=[],idx=[];for(const [z,w,bottom,top]of rings){p.push(-w,bottom,z,w,bottom,z,w*.97,top-.11,z,w*.78,top,z,-w*.78,top,z,-w*.97,top-.11,z);}
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<6;j++){let a=i*6+j,b=i*6+(j+1)%6;idx.push(a,b,a+6,b,b+6,a+6);}idx.push(0,5,1,1,5,4,1,4,2,2,4,3);let n=(rings.length-1)*6;idx.push(n,n+1,n+5,n+1,n+4,n+5,n+1,n+2,n+4,n+2,n+3,n+4);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();return new THREE.Mesh(geo,mat);}
function roadster(){const car=new THREE.Group();const white=new THREE.MeshPhysicalMaterial({color:'#e9eeef',metalness:.58,roughness:.23,clearcoat:1,clearcoatRoughness:.16,envMapIntensity:1.1});
  const body=shell([[-2.65,.92,.48,1.02],[-2.15,1.12,.35,1.25],[-.95,1.15,.32,1.15],[.8,1.08,.3,1.02],[1.8,1.1,.42,.93],[2.6,.86,.54,.75]],white);body.castShadow=true;body.receiveShadow=true;car.add(body);
  const glass=new THREE.MeshPhysicalMaterial({color:'#172d39',metalness:.65,roughness:.17,clearcoat:1});const cabin=shell([[-1.5,.88,1.05,1.18],[-.7,.77,1.08,1.83],[.45,.74,1.02,1.79],[1.25,.84,.99,1.03]],glass);cabin.castShadow=true;car.add(cabin);
  box(car,.055,.07,1.3,0,1.81,-.13,white);box(car,1.5,.04,.07,0,1.82,-.72,white);
  for(const side of [-1,1]){box(car,.18,.14,.38,side*1.16,1.17,.63,white);box(car,.13,.14,2.6,side*1.05,.4,0,black);}
  box(car,1.8,.21,.24,0,.62,-2.53,black);box(car,1.6,.14,.15,0,.55,2.5,black);
  const red=new THREE.MeshStandardMaterial({color:'#ff413a',emissive:'#ff1c16',emissiveIntensity:3});box(car,1.75,.065,.035,0,1.02,-2.67,red);
  const led=new THREE.MeshStandardMaterial({color:'#fff9e2',emissive:'#fff1b0',emissiveIntensity:1.6});for(const side of [-1,1])box(car,.62,.055,.06,side*.58,.82,2.39,led);
  box(car,1.9,.075,.42,0,1.18,-2.16,white);for(const side of [-1,1])box(car,.08,.18,.12,side*.75,1.07,-2.12,black);
  const wheels=[];for(const side of [-1,1])for(const z of [-1.62,1.55])wheels.push(wheel(car,side*1.08,.57,z,.56,.37));
  const flames=[];for(const side of [-1,1]){const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.19,.24,.3,12),alloy);nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*.65,.66,-2.7);car.add(nozzle);const fire=new THREE.Mesh(new THREE.ConeGeometry(.18,1.9,10),new THREE.MeshBasicMaterial({color:'#a3e8ff',transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));fire.rotation.x=-Math.PI/2;fire.position.set(side*.65,.66,-3.7);car.add(fire);flames.push(fire);}
  for(const x of [-.85,.85])for(const z of [-1.65,1.4]){const fire=new THREE.Mesh(new THREE.ConeGeometry(.16,1.8,8),new THREE.MeshBasicMaterial({color:'#b9eeff',transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));fire.rotation.z=Math.PI;fire.position.set(x,-.65,z);car.add(fire);flames.push(fire);}
  return {car,wheels,flames};
}
const {car,wheels,flames}=roadster();enhanceRoadster(car,wheels);
// Isolate the standard body so loading the detailed car never changes the
// physics transform, crash visibility, or the existing thrust flame meshes.
const standardBody=new THREE.Group();
for(const part of [...car.children])if(!flames.includes(part))standardBody.add(part);
standardBody.visible=false;
car.add(standardBody);scene.add(car);
let detailedCar=null;
let modelLoading=false;
function updateModelLoading(progress){
  const meter=$('model-load-progress'),detail=$('model-load-detail');
  meter.classList.remove('hidden');
  if(progress.stage==='decode'){meter.value=100;detail.textContent='Finishing your Roadster…';}
  else if(progress.stage!=='ready'){
    if(progress.total>0)meter.value=Math.min(99,Math.round(progress.loaded/progress.total*100));else meter.removeAttribute('value');
    detail.textContent=progress.loaded?`Loading detailed model · ${(progress.loaded/1048576).toFixed(1)} MB`:progress.attempt?'Trying another version of the detailed model…':'Loading detailed model…';
  }
}
async function prepareRoadster(){
  if(modelLoading||detailedCar)return;
  modelLoading=true;$('world').dataset.carModel='loading';
  $('model-load-status').classList.remove('hidden');$('model-load-retry').classList.add('hidden');
  $('model-load-title').textContent='PREPARING YOUR ROADSTER';
  $('start').disabled=true;$('controls-start').disabled=true;
  try{
  const rig=await loadDetailedRoadster(renderer,{onProgress:updateModelLoading});
  detailedCar=rig;car.add(rig.visual);standardBody.visible=false;
  // Rear thrust outlets remain attached to the stable physics group.
  for(const side of [-1,1]){
    const nozzle=new THREE.Mesh(new THREE.CylinderGeometry(.14,.19,.24,20),alloy);
    nozzle.rotation.x=Math.PI/2;nozzle.position.set(side*.65,.55,-2.58);car.add(nozzle);
    const opening=new THREE.Mesh(new THREE.CircleGeometry(.12,20),black);
    opening.rotation.y=Math.PI;opening.position.set(side*.65,.55,-2.705);car.add(opening);
  }
  for(let i=0;i<2;i++)flames[i].position.y=.55;
  $('world').dataset.carModel='detailed';
  $('world').setAttribute('aria-label','Three dimensional '+track.name+' racing track with a detailed Tesla Roadster');
  $('model-load-status').classList.add('hidden');$('start').disabled=false;$('controls-start').disabled=false;
  }catch(error){
    $('world').dataset.carModel='error';
    $('model-load-title').textContent='LET’S TRY THAT AGAIN';
    $('model-load-detail').textContent='Your Roadster couldn’t finish loading. Check your connection and retry.';
    $('model-load-progress').classList.add('hidden');$('model-load-retry').classList.remove('hidden');
    console.warn('Detailed Roadster loading failed after recovery attempts.',error);
  }finally{modelLoading=false;}
}
$('model-load-retry').addEventListener('click',prepareRoadster);
window.addEventListener('online',()=>{if(!detailedCar)prepareRoadster();});
prepareRoadster();
const fx=createVisualEffects({scene,renderer});
// Ground shadow remains level while the body rolls in the air.
const shadowCanvas=document.createElement('canvas');shadowCanvas.width=64;shadowCanvas.height=64;const shctx=shadowCanvas.getContext('2d');const sg=shctx.createRadialGradient(32,32,0,32,32,30);sg.addColorStop(0,'rgba(0,0,0,.55)');sg.addColorStop(1,'rgba(0,0,0,0)');shctx.fillStyle=sg;shctx.fillRect(0,0,64,64);const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4.8,7.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;scene.add(shadow);
const markerMat=new THREE.MeshBasicMaterial({color:'#76dccc',transparent:true,opacity:.24,depthWrite:false});
const obstacleVisuals=[];
function makeObstacle(o){const group=new THREE.Group();
  if(o.type==='barrier'){
    const concrete=new THREE.MeshStandardMaterial({color:'#c6baa2',roughness:1});box(group,o.width,1.15,1.5,0,.575,0,concrete);
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const c=canvas.getContext('2d');c.fillStyle='#d7a43a';c.fillRect(0,0,512,96);c.fillStyle='#252b2c';for(let x=-100;x<600;x+=100){c.beginPath();c.moveTo(x,96);c.lineTo(x+70,0);c.lineTo(x+115,0);c.lineTo(x+45,96);c.fill();}
    const face=new THREE.Mesh(new THREE.PlaneGeometry(o.width-.3,.82),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(canvas),roughness:.8}));face.rotation.y=Math.PI;face.position.set(0,.65,-.76);group.add(face);
  }else if(o.type==='pothole'){
    const ring=new THREE.Mesh(new THREE.RingGeometry(2.05,2.8,13),new THREE.MeshStandardMaterial({color:'#7c6b55',roughness:1,side:THREE.DoubleSide}));ring.rotation.x=-Math.PI/2;ring.scale.y=1.25;ring.position.y=.06;group.add(ring);
    const hole=new THREE.Mesh(new THREE.CircleGeometry(2.15,13),new THREE.MeshStandardMaterial({color:'#101619',roughness:1}));hole.rotation.x=-Math.PI/2;hole.scale.y=1.4;hole.position.y=.07;group.add(hole);
    for(let i=0;i<11;i++){const a=i/11*Math.PI*2;const stone=new THREE.Mesh(rockGeo,sandstone[2]);stone.position.set(Math.cos(a)*2.5,.13,Math.sin(a)*2.9);stone.scale.set(.4,.2,.3);group.add(stone);}
  }else if(o.type==='bus'){
    const yellow=new THREE.MeshStandardMaterial({color:({canyon:'#dca348',austin:'#bb734b',miami:'#dc91aa','bay-area':'#d45b46',alpine:'#d8e6ee',tokyo:'#469b8c'}[track.id]),metalness:.15,roughness:.5});box(group,3.25,2.65,10.8,0,1.85,0,yellow);box(group,3.3,.35,10.9,0,.65,0,black);box(group,3,.08,10.4,0,3.21,0,paintMat);
    for(const side of [-1,1]){for(let i=0;i<7;i++)box(group,.035,.88,1.05,side*1.632,2.46,-4.25+i*1.4,black);for(const z of [-3.6,3.6])wheel(group,side*1.58,.65,z,.66,.4);}
    box(group,2.8,.9,.035,0,2.45,-5.42,black);box(group,2.8,1.15,.04,0,2.37,5.42,black);for(const side of [-1,1])box(group,.3,.15,.07,side*1.23,.94,-5.45,new THREE.MeshStandardMaterial({color:'#f54835',emissive:'#f54835',emissiveIntensity:.6}));
  }else{
    const color=({canyon:['#b75c42','#68928b','#8394aa'],austin:['#e4c9a7','#537b67','#7f939c'],miami:['#e9acbc','#65c8c2','#e1dca7'],'bay-area':['#638192','#b3a791','#a04b43'],alpine:['#dce5e8','#476775','#bb6b47'],tokyo:['#e0e7eb','#55688d','#bd6788']}[track.id])[o.id%3],mat=new THREE.MeshStandardMaterial({color,roughness:.36,metalness:.35});const body=shell([[-2.8,1.1,.4,1.1],[-2,1.4,.35,1.2],[1.8,1.4,.35,1.2],[2.8,1.1,.5,1]],mat);group.add(body);const cab=shell([[-1.7,1.1,1.1,1.25],[-.9,1,1.1,1.65],[.7,1,1.1,1.65],[1.6,1.1,1.1,1.2]],black);group.add(cab);for(const side of [-1,1])for(const z of [-1.7,1.65])wheel(group,side*1.3,.55,z,.55,.35);box(group,2,.09,.03,0,1.07,-2.81,new THREE.MeshStandardMaterial({color:'#ee6752',emissive:'#ee6752',emissiveIntensity:.6}));
  }
  const f=frame(o.s);group.position.copy(pointOn(o.s,o.offset,.035));group.rotation.set(-Math.atan2(f.t.y,Math.hypot(f.t.x,f.t.z)),f.yaw,-f.bank);group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});scene.add(group);
  const zone=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(o.width+3,16),6),markerMat.clone());zone.rotation.x=-Math.PI/2;const zp=pointOn(o.s-25,o.offset,.09);zone.position.copy(zp);zone.rotation.z=-f.yaw;scene.add(zone);
  return {group,zone};
}
for(const o of run.obstacles)obstacleVisuals.push(makeObstacle(o));

// Each ramp follows the same curved and banked road coordinates as the car.
const rampMat=new THREE.MeshStandardMaterial({color:'#384954',metalness:.6,roughness:.42,map:roadTexture});
const rampEdge=new THREE.MeshStandardMaterial({color:'#ffbd64',emissive:'#ff7b27',emissiveIntensity:.6,roughness:.4});
const rampRails=new THREE.InstancedMesh(new THREE.BoxGeometry(.12,.08,1),rampEdge,run.ramps.length*48);let rampRailIndex=0;scene.add(rampRails);
function makeRamp(ramp){
  const positions=[],uv=[],indices=[];
  const steps=24;
  for(let i=0;i<=steps;i++){
    const t=i/steps,s=ramp.s-ramp.length+t*ramp.length,h=ramp.height*t*t;
    for(const side of [-1,1]){const p=pointOn(s,ramp.offset+side*ramp.width/2,h+.055);positions.push(p.x,p.y,p.z);uv.push(side<0?0:ramp.width/4,t*ramp.length/4);}
    if(i<steps){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,rampMat);mesh.receiveShadow=true;mesh.castShadow=true;scene.add(mesh);
  for(const side of [-1,1])for(let i=1;i<=steps;i++){
    const a=(i-1)/steps,b=i/steps,pa=pointOn(ramp.s-ramp.length+a*ramp.length,ramp.offset+side*ramp.width/2,ramp.height*a*a+.1),pb=pointOn(ramp.s-ramp.length+b*ramp.length,ramp.offset+side*ramp.width/2,ramp.height*b*b+.1);
    dummy.position.copy(pa).lerp(pb,.5);dummy.scale.set(1,1,pa.distanceTo(pb));dummy.lookAt(pb);dummy.updateMatrix();rampRails.setMatrixAt(rampRailIndex++,dummy.matrix);
  }
  const f=frame(ramp.s),support=new THREE.Mesh(new THREE.BoxGeometry(ramp.width,ramp.height,.3),black);support.position.copy(pointOn(ramp.s,ramp.offset,ramp.height/2));support.rotation.y=f.yaw;scene.add(support);
  const signCanvas=document.createElement('canvas');signCanvas.width=512;signCanvas.height=256;const c=signCanvas.getContext('2d');c.fillStyle='#162c36';c.fillRect(0,0,512,256);c.strokeStyle='#ffa85b';c.lineWidth=12;c.strokeRect(7,7,498,242);c.textAlign='center';c.fillStyle='#ffbd76';c.font='bold 42px Arial';c.fillText('LAUNCH RAMP',256,65);c.fillStyle='#f4eee0';c.font='bold 30px Arial';c.fillText('THRUST ON DESCENT',256,125);c.font='26px Arial';c.fillText('SPACE  /  SAFE LANDING',256,188);
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(6,3),new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(signCanvas),roughness:.7,side:THREE.DoubleSide}));const sf=frame(ramp.s-ramp.length-13);sign.position.copy(pointOn(ramp.s-ramp.length-13,-11.7,3.5));sign.rotation.y=sf.yaw+Math.PI;scene.add(sign);
  for(let i=0;i<3;i++){const s=ramp.s-ramp.length+4+i*5,t=(s-ramp.s+ramp.length)/ramp.length;const arrow=new THREE.Group();for(const side of [-1,1]){const bar=new THREE.Mesh(new THREE.BoxGeometry(1.8,.035,.24),rampEdge);bar.position.set(side*.65,0,0);bar.rotation.y=side*.48;arrow.add(bar);}arrow.position.copy(pointOn(s,ramp.offset,ramp.height*t*t+.08));const af=frame(s);arrow.rotation.set(-Math.atan2(2*ramp.height*t,ramp.length),af.yaw,-af.bank);scene.add(arrow);}
}
run.ramps.forEach(makeRamp);rampRails.instanceMatrix.needsUpdate=true;dummy.scale.set(1,1,1);

// Repeated chevrons help read the approaching corners.
const chevronCanvas=document.createElement('canvas');chevronCanvas.width=128;chevronCanvas.height=80;const cx=chevronCanvas.getContext('2d');cx.fillStyle='#e6b759';cx.fillRect(0,0,128,80);cx.strokeStyle='#282a29';cx.lineWidth=15;for(const x of [20,69]){cx.beginPath();cx.moveTo(x,10);cx.lineTo(x+28,40);cx.lineTo(x,70);cx.stroke();}
const signMat=new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(chevronCanvas),side:THREE.DoubleSide,roughness:1});
for(let s=70;s<length-60;s+=43){const f=frame(s);if(Math.abs(f.curvature)<.007)continue;const side=f.curvature>0?-1:1;const g=new THREE.Group();box(g,.12,2.5,.12,0,1.25,0,alloy);const face=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.55),signMat);face.position.y=2.5;face.rotation.y=Math.PI;g.add(face);g.position.copy(pointOn(s,side*11.5));g.rotation.y=f.yaw+(side>0?-.2:.2);scene.add(g);}
const finishGroup=new THREE.Group();const finishMat=new THREE.MeshStandardMaterial({color:'#17272c',roughness:.5});for(const side of [-1,1])box(finishGroup,.5,9,.6,side*10,4.5,0,finishMat);box(finishGroup,20.5,1.3,.65,0,8.5,0,finishMat);
const bannerCanvas=document.createElement('canvas');bannerCanvas.width=1024;bannerCanvas.height=80;const bctx=bannerCanvas.getContext('2d');bctx.fillStyle='#17272c';bctx.fillRect(0,0,1024,80);bctx.font='bold 43px Arial';bctx.textAlign='center';bctx.fillStyle='#fff5df';bctx.fillText('F I N I S H',512,56);const banner=new THREE.Mesh(new THREE.PlaneGeometry(16,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bannerCanvas),side:THREE.DoubleSide}));banner.position.set(0,8.5,-.34);banner.rotation.y=Math.PI;finishGroup.add(banner);const ff=frame(length-12);finishGroup.position.copy(ff.p);finishGroup.rotation.y=ff.yaw;scene.add(finishGroup);
for(let row=0;row<2;row++)for(let col=0;col<20;col++){const tile=new THREE.Mesh(new THREE.PlaneGeometry(.95,1.2),new THREE.MeshStandardMaterial({color:(row+col)%2?'#e4dac7':'#252c2e'}));tile.rotation.x=-Math.PI/2;tile.position.copy(pointOn(length-12+row*1.2,col*.95-9,.08));tile.rotation.z=-ff.yaw;scene.add(tile);}

const audio=new DrivingAudio();const input={gas:false,brake:false,left:false,right:false};let last=performance.now(),elapsed=0,noticeUntil=0,shake=0,renderFrames=0,thrustGlow=0,crashDelay=-1,flashTime=0,landingCuePlayed=false;
let cameraTarget=new THREE.Vector3(),cameraInitialized=false;const tempLook=new THREE.Vector3();
let cameraMode='chase';try{if(localStorage.getItem('roadster-run-camera')==='cockpit')cameraMode='cockpit';}catch{}
function renderCameraToggle(){
  const seated=cameraMode==='cockpit',button=$('camera-toggle');
  button.setAttribute('aria-pressed',String(seated));
  button.setAttribute('aria-label',seated?'Switch to chase camera':'Switch to driver’s seat');
  button.title=(seated?'Driver’s seat':'Chase camera')+' · C to switch';
  $('camera-label').textContent=seated?'COCKPIT':'CHASE';
  document.body.dataset.camera=cameraMode;
}
function toggleCamera(){cameraMode=cameraMode==='chase'?'cockpit':'chase';cameraInitialized=false;try{localStorage.setItem('roadster-run-camera',cameraMode);}catch{}renderCameraToggle();}
$('camera-toggle').addEventListener('click',toggleCamera);renderCameraToggle();
$('track-distance').textContent=(length/1000).toFixed(1);$('obstacle-count').textContent=run.obstacles.length;$('total').textContent=run.obstacles.length;
const map=$('minimap'),mapctx=map.getContext('2d');const bounds={minX:Math.min(...samples.map(p=>p.x)),maxX:Math.max(...samples.map(p=>p.x)),minZ:Math.min(...samples.map(p=>p.z)),maxZ:Math.max(...samples.map(p=>p.z))};const scale=Math.min(205/(bounds.maxX-bounds.minX),168/(bounds.maxZ-bounds.minZ));
const mapPoint=p=>[120+(p.x-(bounds.minX+bounds.maxX)/2)*scale,100-(p.z-(bounds.minZ+bounds.maxZ)/2)*scale];
function drawMap(){
  const finishDistance=length-12,progress=run.state==='finished'?1:clamp(run.s/finishDistance,0,1);
  mapctx.clearRect(0,0,240,200);mapctx.lineCap='round';mapctx.lineJoin='round';
  const route=(end)=>{mapctx.beginPath();for(let i=0;i<=end;i++){const [x,y]=mapPoint(samples[i]);i?mapctx.lineTo(x,y):mapctx.moveTo(x,y);}mapctx.stroke();};
  mapctx.lineWidth=7;mapctx.strokeStyle='#080f18';route(samples.length-1);
  mapctx.lineWidth=3.5;mapctx.strokeStyle='#b9cbd4';route(samples.length-1);
  mapctx.lineWidth=4;mapctx.strokeStyle='#9be8d4';route(Math.floor(progress*(samples.length-1)));
  const [sx,sy]=mapPoint(samples[0]);mapctx.fillStyle='#9be8d4';mapctx.beginPath();mapctx.arc(sx,sy,3.5,0,Math.PI*2);mapctx.fill();
  for(const ramp of run.ramps){const [rx,ry]=mapPoint(frame(ramp.s).p);mapctx.fillStyle=ramp.cleared?'#83d9ae':'#ffc178';mapctx.beginPath();mapctx.moveTo(rx,ry-4);mapctx.lineTo(rx+4,ry+3);mapctx.lineTo(rx-4,ry+3);mapctx.closePath();mapctx.fill();}
  const [fx,fy]=mapPoint(samples.at(-1));mapctx.fillStyle='#fff';mapctx.fillRect(fx-4,fy-4,8,8);mapctx.fillStyle='#192932';mapctx.fillRect(fx-4,fy-4,4,4);mapctx.fillRect(fx,fy,4,4);
  const [x,y]=mapPoint(frame(run.s).p);mapctx.fillStyle='#ff925e';mapctx.strokeStyle='#fff9ea';mapctx.lineWidth=2;mapctx.beginPath();mapctx.arc(x,y,5.5,0,Math.PI*2);mapctx.fill();mapctx.stroke();
  $('map-progress').textContent=Math.floor(progress*100)+'%';
  $('map-distance').textContent=(Math.max(0,finishDistance-run.s)/1000).toFixed(1)+' km left';
}
function message(title,detail='',kind=''){const n=$('notice');n.className='notice visible '+kind;n.replaceChildren(document.createTextNode(title));if(detail){const s=document.createElement('small');s.textContent=detail;n.appendChild(s);}noticeUntil=elapsed+2.5;}

const driverField=$('driver-name');driverField.value=loadDriver();
let runDriver=displayDriver(driverField.value),lastResult=loadResult();
function updateDriver(){const value=normalizeDriver(driverField.value);if(driverField.value!==value)driverField.value=value;$('driver-count').textContent=value.length+' / 255';const saved=saveDriver(value);$('driver-save-status').textContent=saved?'Saved in this browser · shown on your results and card':'Used for this race · browser storage is unavailable';}
driverField.addEventListener('input',updateDriver);driverField.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('start').click();}});updateDriver();
function readBest(trackId=track.id,difficultyId=difficulty.id){return loadBest(trackId,difficultyId);}
function showResults(result,isBest=false){
  clearInput();$('touch-controls').classList.add('hidden');$('intro').classList.add('hidden');$('intro-footer').classList.add('hidden');$('finish').classList.remove('hidden');
  $('again').firstChild.textContent='DRIVE '+track.city.toUpperCase()+' AGAIN ';
  $('result-driver').textContent=result.driver;$('final-score').textContent=String(result.score).padStart(4,'0');$('final-time').textContent=formatTime(result.time);$('final-clears').textContent=result.cleared+' / '+result.total;
  $('finish-track').textContent=getTrack(result.trackId).name.toUpperCase()+' · '+getDifficulty(result.difficultyId).name.toUpperCase()+' COMPLETE';
  const best=readBest(result.trackId,result.difficultyId);$('best-time').textContent=formatTime(Number.isFinite(best.time)?best.time:result.time);$('new-best').classList.toggle('hidden',!isBest);
  $('finish-copy').textContent=result.successfulJumps+' safe landings · '+result.ramps+' / '+result.totalRamps+' ramps completed.';
  $('post-x').href=buildXIntent(result);$('share-help').textContent='Save the card, then attach it to your X post. Your post opens for review.';
  try{const canvas=$('result-card');renderResultCard(canvas,result);canvas.setAttribute('aria-label','Results for '+result.driver+': '+result.score+' points in '+formatTime(result.time));$('save-card').href=canvas.toDataURL('image/png');$('save-card').download='roadster-'+result.score+'-'+Math.round(result.time)+'s.png';$('save-card').classList.remove('hidden');canvas.parentElement.classList.remove('hidden');}
  catch(error){$('save-card').classList.add('hidden');$('result-card').parentElement.classList.add('hidden');$('share-help').textContent='The image could not be generated. You can still post your results to X.';console.error('Result card unavailable',error);}
  $('finish').querySelector('.dialog').scrollTop=0;$('post-x').focus({preventScroll:true});
}
function changeDriver(){
  clearInput();run.reset();fx.reset();car.visible=true;shadow.visible=true;cameraInitialized=false;crashDelay=-1;thrustGlow=0;
  for(const id of ['finish','pause-panel','crash-panel','hud','touch-controls','landing-cue'])$(id).classList.add('hidden');
  $('intro').classList.remove('hidden');$('intro-footer').classList.remove('hidden');$('pause').setAttribute('aria-label','Pause game');document.body.classList.remove('playing','in-flight');$('intro').scrollTop=0;driverField.focus({preventScroll:true});
}
$('change-driver').addEventListener('click',changeDriver);$('change-track').addEventListener('click',changeDriver);

const {radio,close:closeRadio}=setupRadio({onOpen:()=>{soundControls.close();clearInput();if(run.state==='running')pauseToggle();}});
const soundControls=setupSoundControls({audio,onOpen:()=>{closeRadio();clearInput();if(run.state==='running')pauseToggle();}});
function clearInput(){for(const k in input)input[k]=false;document.querySelectorAll('.touch-controls .active').forEach(b=>b.classList.remove('active'));}
let controlsResume=false,controlsReturnFocus=null;
function closeControls(){
  $('controls-panel').classList.add('hidden');$('intro').inert=false;document.querySelector('.topbar').inert=false;
  controlsReturnFocus?.focus({preventScroll:true});
}
function showControls(resume=false){
  controlsReturnFocus=document.activeElement;closeRadio();soundControls.close();clearInput();
  if(run.state==='running')pauseToggle();
  controlsResume=resume&&run.state==='paused';
  if(!controlsResume&&weatherChoice==='auto')applyWeather();
  $('controls-start').textContent=controlsResume?'RESUME RACE →':'START RACE →';
  $('controls-panel').classList.remove('hidden');$('intro').inert=true;document.querySelector('.topbar').inert=true;
  ($('controls-start').disabled?$('controls-back'):$('controls-start')).focus({preventScroll:true});
}
$('controls-start').addEventListener('click',()=>{closeControls();controlsResume?pauseToggle():startRun();});
$('controls-back').addEventListener('click',closeControls);
$('help-controls').addEventListener('click',()=>showControls(run.state==='running'||run.state==='paused'));
$('controls-panel').addEventListener('keydown',e=>{
  if(e.code==='Escape'){e.preventDefault();e.stopPropagation();closeControls();return;}
  if(e.code!=='Tab')return;
  const buttons=[...$('controls-panel').querySelectorAll('button:not(:disabled)')],first=buttons[0],end=buttons.at(-1);
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();end.focus();}
  else if(!e.shiftKey&&document.activeElement===end){e.preventDefault();first.focus();}
});
let cinematicPaused=matchMedia('(prefers-reduced-motion: reduce)').matches,cinematicTime=0;
function renderCinematicToggle(){document.body.classList.toggle('cinematic-motion-paused',cinematicPaused);$('cinematic-toggle').textContent=cinematicPaused?'PLAY INTRO':'PAUSE INTRO';$('cinematic-toggle').setAttribute('aria-label',cinematicPaused?'Play intro':'Pause intro');$('cinematic-toggle').setAttribute('aria-pressed',String(cinematicPaused));}
$('cinematic-toggle').addEventListener('click',()=>{cinematicPaused=!cinematicPaused;renderCinematicToggle();});renderCinematicToggle();
async function startRun(){if(!detailedCar)return;runDriver=displayDriver(driverField.value);saveDriver(driverField.value);driverField.blur();audio.start().catch(()=>{});radio.resume();closeRadio();soundControls.close();run.reset();run.start();clearInput();fx.reset();car.visible=true;shadow.visible=true;crashDelay=-1;thrustGlow=0;landingCuePlayed=false;cameraInitialized=false;document.body.classList.add('playing');for(const id of ['intro','pause-panel','finish','intro-footer','crash-panel'])$(id).classList.add('hidden');$('hud').classList.remove('hidden');$('touch-controls').classList.remove('hidden');$('pause').setAttribute('aria-label','Pause game');for(const v of obstacleVisuals)v.zone.material.opacity=.24;$('notice').classList.remove('visible');}
function pauseToggle(){if(run.state==='running'){run.state='paused';clearInput();$('pause-panel').classList.remove('hidden');$('touch-controls').classList.add('hidden');$('pause').setAttribute('aria-label','Resume game');$('resume').focus();}else if(run.state==='paused'){run.state='running';$('pause-panel').classList.add('hidden');$('touch-controls').classList.remove('hidden');$('pause').setAttribute('aria-label','Pause game');audio.start();radio.resume();closeRadio();soundControls.close();}}
function thrust(){
  if(run.jump())return;
  if(run.state!=='running')return;
  if(run.jumpTime>=0){if(!run.landingArmed)message(run.verticalVelocity<0?'WAIT FOR LANDING CUE':'WAIT FOR DESCENT','Press Space again when the landing cue turns orange.');return;}
  if(run.speed<5)message('BUILD SOME SPEED','Accelerate before firing the thrusters.');
  else if(run.charge<.99)message('TANK RECHARGING','Landing thrust always has its own reserve.');
}
function setCrashCause(event){
  const collision=event.reason==='collision';
  const names={car:'CAR',bus:'BUS',barrier:'BARRIER',pothole:'POTHOLE'};
  $('crash-reason').textContent=collision?(names[event.obstacle]||'OBSTACLE')+' IMPACT':'LANDING THRUST MISSED';
  const emphasis=document.createElement('em');emphasis.textContent=collision?'IMPACT.':'LANDING.';
  $('crash-title').replaceChildren(document.createTextNode('HARD'),document.createElement('br'),emphasis);
  $('crash-description').textContent=collision?'Jump over obstacles or steer around them. Contact with cars, buses, barriers, or potholes causes an explosion.':'Fire your thrusters while descending to slow the fall. Watch for THRUST NOW and tap Space again.';
}
function retryCheckpoint(){if(run.state==='crashed')run.recover();}

function mute(){soundControls.toggleMute();}
function finish(){
  const previous=readBest(),isBest=run.time<previous.time||run.score>previous.score;
  saveBest(track.id,{time:Math.min(run.time,previous.time),score:Math.max(run.score,previous.score)},difficulty.id);
  const result={trackId:track.id,difficultyId:difficulty.id,driver:runDriver,score:run.score,time:run.time,cleared:run.cleared,total:run.obstacles.length,ramps:run.ramps.filter(r=>r.cleared).length,totalRamps:run.ramps.length,successfulJumps:run.successfulJumps};
  lastResult=result;const saved=saveResult(result);showResults(result,isBest);
  if(!saved)$('share-help').textContent='Save your card before closing this tab; this browser could not remember the result. Attach the card to your X post.';
  audio.reward();
}
$('retry').addEventListener('click',retryCheckpoint);$('crash-restart').addEventListener('click',()=>showControls());
$('start').addEventListener('click',()=>showControls());$('again').addEventListener('click',()=>showControls());$('restart').addEventListener('click',()=>showControls());$('pause').addEventListener('click',pauseToggle);$('resume').addEventListener('click',pauseToggle);
$('recover-control').addEventListener('click',()=>{if(run.state==='running')run.recover();});
$('touch-thrust').addEventListener('pointerdown',e=>{e.preventDefault();if(run.state!=='running')return;e.currentTarget.setPointerCapture(e.pointerId);e.currentTarget.classList.add('active');thrust();});
for(const event of ['pointerup','pointercancel','lostpointercapture'])$('touch-thrust').addEventListener(event,()=> $('touch-thrust').classList.remove('active'));
const keyMap={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{
  if(!$('controls-panel').classList.contains('hidden'))return;
  if(e.target instanceof Element&&e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if(!$('radio-panel').classList.contains('hidden')&&e.code==='Escape'){e.preventDefault();closeRadio();return;}
  if(!$('sound-panel').classList.contains('hidden')&&e.code==='Escape'){e.preventDefault();soundControls.close();return;}
  if(e.target instanceof Element&&e.target.closest('#radio-panel,#sound-panel'))return;
  const driving=run.state==='running';
  if(keyMap[e.code]&&driving){e.preventDefault();input[keyMap[e.code]]=true;document.querySelector(`[data-control="${keyMap[e.code]}"]`)?.classList.add('active');}
  if(e.code==='Space'&&!driving)return;
  if((e.code==='Space'&&driving)||['Escape','KeyP','KeyR'].includes(e.code))e.preventDefault();
  if(e.repeat)return;
  if(e.code==='Space'){$('touch-thrust').classList.add('active');thrust();}
  if(e.code==='Escape'||e.code==='KeyP')pauseToggle();
  if(e.code==='KeyR')run.recover();
  if(e.code==='KeyM')mute();
  if(e.code==='KeyC'){e.preventDefault();toggleCamera();}
});
window.addEventListener('keyup',e=>{if(keyMap[e.code]){input[keyMap[e.code]]=false;document.querySelector(`[data-control="${keyMap[e.code]}"]`)?.classList.remove('active');}if(e.code==='Space')$('touch-thrust').classList.remove('active');});window.addEventListener('blur',()=>{clearInput();if(run.state==='running')pauseToggle();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&run.state==='running')pauseToggle();});
document.querySelectorAll('[data-control]').forEach(b=>{const c=b.dataset.control;b.addEventListener('pointerdown',e=>{e.preventDefault();if(run.state!=='running')return;b.setPointerCapture(e.pointerId);input[c]=true;b.classList.add('active');});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{input[c]=false;b.classList.remove('active');});});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();cameraInitialized=false;});

function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt;const playing=run.state==='running';
  if(run.state==='ready'&&!cinematicPaused&&$('controls-panel').classList.contains('hidden'))cinematicTime+=dt;
  if(playing){run.update(dt,input);for(const event of run.drainEvents()){
    const eventPosition=pointOn(run.s,run.offset,run.height+.5);
    if(event.type==='jump'){audio.thrust();thrustGlow=.42;shake=.12;fx.thrust(eventPosition);landingCuePlayed=false;message('TAKE FLIGHT','Press Space again while descending.');}
    if(event.type==='ramp'){audio.ramp();shake=.13;landingCuePlayed=false;message('RAMP LAUNCH','Wait for descent. Then fire your landing thrusters.');}
    if(event.type==='landingThrust'){audio.landingThrust();thrustGlow=.8;shake=.14;fx.thrust(eventPosition);}
    if(event.type==='land'){audio.land();shake=.16;fx.land(eventPosition);if(event.points){audio.reward();message('+'+event.points,event.rampBonus?'RAMP LANDED · CLEAN TOUCHDOWN':'CLEAN LANDING','reward');}}
    if(event.type==='hit'){audio.collision();shake=.3;fx.collision(eventPosition);message(event.obstacle==='pothole'?'WATCH THE ROAD':'CONTACT','Build speed, then jump earlier.','warning');}
    if(event.type==='explode'){setCrashCause(event);audio.explosion();fx.explode(eventPosition);shake=1.4;clearInput();car.visible=false;shadow.visible=false;crashDelay=1.2;flashTime=.15;$('impact-flash').classList.add('active');$('touch-controls').classList.add('hidden');}
    if(event.type==='recover'){cameraInitialized=false;fx.reset();car.visible=true;shadow.visible=true;crashDelay=-1;thrustGlow=0;landingCuePlayed=false;$('crash-panel').classList.add('hidden');$('touch-controls').classList.remove('hidden');clearInput();message('BACK ON TRACK','Score kept. Fire thrust on descent to land safely.');}
    if(event.type==='checkpoint')message('CHECKPOINT','Your progress is safe.');
    if(event.type==='finish')finish();
  }}
  const preview=run.state==='ready';const visualS=preview?run.obstacles[0].s-45:run.s;const f=frame(visualS);const pos=pointOn(visualS,preview?0:run.offset,run.height+.04);
  if(preview)pos.y+=.10+Math.sin(cinematicTime*.7)*.035;
  car.position.copy(pos);const steeringYaw=Math.atan2(run.lateralVelocity,Math.max(9,run.speed));
  car.rotation.set(0,0,0);car.rotation.order='YXZ';car.rotation.y=f.yaw+steeringYaw;const rampUnder=run.jumpTime<0?run.ramps.find(r=>run.s>=r.s-r.length&&run.s<=r.s&&Math.abs(run.offset-r.offset)<r.width/2):null;
  const rampPitch=rampUnder?-Math.atan2(2*rampUnder.height*clamp((run.s-rampUnder.s+rampUnder.length)/rampUnder.length,0,1),rampUnder.length):0;
  car.rotation.x=-Math.atan2(f.t.y,Math.hypot(f.t.x,f.t.z))+(run.jumpTime>=0?-clamp(Math.atan2(run.verticalVelocity,Math.max(20,run.speed)),-.22,.3):rampPitch);car.rotation.z=run.roll-f.bank-clamp(run.lateralVelocity*.009,-.08,.08);
  if(detailedCar)detailedCar.update(playing?dt:0,run.speed,steeringYaw,input.brake);
  else for(const w of wheels)w.rotation.x+=(playing?dt:0)*run.speed/.56;
  for(let i=0;i<flames.length;i++){const active=thrustGlow>0;flames[i].visible=Boolean(detailedCar)&&(active||(preview&&i<2));if(flames[i].visible){flames[i].scale.setScalar((active?1:.2)*(1+Math.random()*.2));flames[i].material.opacity=active?.75:.4;}}
  shadow.visible=Boolean(detailedCar)&&run.state!=='crashed';shadow.position.copy(pointOn(visualS,preview?0:run.offset,.09));shadow.rotation.z=-f.yaw;shadow.material.opacity=clamp(1-run.height*.06,.18,1);shadow.scale.setScalar(1+run.height*.03);
  const forward=new THREE.Vector3(f.t.x,0,f.t.z).normalize();const target=pos.clone().addScaledVector(forward,preview?17:9);target.y=pointOn(visualS+18,run.offset,1.5).y;
  let desired=chaseCameraPosition(f.p,forward,f.right,run.offset,run.height,run.speed);
  if(preview){
    const orbit=.54+Math.sin(cinematicTime*.12)*.32;
    const stage=$('cinematic-stage')||document.querySelector('.cinematic-stage');
    const rect=stage?.getBoundingClientRect();
    const stageWidth=rect?.width||innerWidth*.55,stageHeight=rect?.height||innerHeight*.4;
    // Keep the car inside the transparent hero viewport at every screen size.
    const desiredWidth=Math.min(stageWidth*.78,Math.max(160,stageHeight)*2.1);
    const distance=5.1*innerHeight/(2*Math.tan(21*Math.PI/180)*desiredWidth);
    desired=pos.clone().addScaledVector(forward,Math.cos(orbit)*distance).addScaledVector(f.right,Math.sin(orbit)*distance);
    desired.y=pos.y+distance*.34;target.copy(pos).add(new THREE.Vector3(0,.58,0));
    const centerX=rect?rect.left+rect.width/2:innerWidth*.68,centerY=rect?rect.top+rect.height*.47:innerHeight*.38;
    camera.setViewOffset(innerWidth,innerHeight,innerWidth/2-centerX,innerHeight/2-centerY,innerWidth,innerHeight);
  }else camera.clearViewOffset();
  const seated=!preview&&cameraMode==='cockpit'&&run.state!=='crashed'&&run.state!=='finished';
  cockpit.root.visible=seated;
  car.visible=!seated&&run.state!=='crashed';
  camera.near=seated?.06:.2;
  if(seated){
    // Anchor the driver's eyes to the vehicle, including its jump and bank.
    desired.copy(pos).add(new THREE.Vector3(.34,1.06,.08).applyQuaternion(car.quaternion));
    target.copy(desired).add(new THREE.Vector3(0,-.4,30).applyQuaternion(car.quaternion));
    camera.up.set(0,1,0).applyQuaternion(car.quaternion);
    camera.position.copy(desired);cameraTarget.copy(target);cameraInitialized=true;
    cockpit.update({speed:run.speed,steer:clamp(steeringYaw*3,-1,1),braking:input.brake,nightFactor:weather.preset.nightFactor});
  }else{
    camera.up.set(0,1,0);
    if(!cameraInitialized){camera.position.copy(desired);cameraTarget.copy(target);cameraInitialized=true;}else{camera.position.lerp(desired,1-Math.exp(-dt*5));cameraTarget.lerp(target,1-Math.exp(-dt*6));}
  }
  tempLook.copy(cameraTarget);if(shake>0){const amount=seated?.25:1;tempLook.x+=(Math.random()-.5)*shake*amount;tempLook.y+=(Math.random()-.5)*shake*amount;shake=Math.max(0,shake-dt*.8);}camera.lookAt(tempLook);
  camera.fov=seated?74:preview&&cinematicPaused?42:lerp(camera.fov,preview?42:56+run.speed*.045,dt*3);camera.updateProjectionMatrix();sky.position.copy(camera.position);
  sun.position.copy(pos).add(new THREE.Vector3(...weather.preset.sunOffset));sun.target.position.copy(pos);
  weather.update(run.state==='paused'||(preview&&cinematicPaused)?0:dt,pos,forward);

  const corner=clamp(Math.abs(f.curvature)*run.speed*1.1+Math.abs(run.lateralVelocity)*.05,0,1.5);audio.update(run.speed,input.gas,corner,run.jumpTime>=0,run.state==='running');
  fx.update(run.state==='paused'?0:dt,{position:pos,forward,speed:run.speed,corner,airborne:run.jumpTime>=0,playing:run.state==='running',thrusting:thrustGlow>0});
  thrustGlow=Math.max(0,thrustGlow-dt);
  if(flashTime>0){flashTime-=dt;if(flashTime<=0)$('impact-flash').classList.remove('active');}
  if(crashDelay>=0){crashDelay-=dt;if(crashDelay<0&&run.state==='crashed'){$('crash-panel').classList.remove('hidden');$('retry').focus();}}
  if(run.landingWindow&&!landingCuePlayed){audio.warning();landingCuePlayed=true;}
  $('speed-lines').style.opacity=run.state==='running'?clamp((run.speed-40)/45,0,.45):0;
  const inFlight=run.jumpTime>=0&&run.state!=='crashed';document.body.classList.toggle('in-flight',inFlight);
  $('landing-cue').classList.toggle('hidden',!(run.state==='running'&&inFlight&&run.landingWindow&&!run.landingArmed));
  $('touch-thrust').classList.toggle('urgent',inFlight&&run.landingWindow);$('touch-thrust').classList.toggle('safe',inFlight&&run.landingArmed);
  $('touch-thrust').querySelector('strong').textContent=inFlight&&run.landingArmed?'SAFE':inFlight&&run.landingWindow?'LAND NOW':'THRUST';
  if(renderFrames++%3===0){
    $('score').textContent=String(run.score).padStart(4,'0');$('timer').textContent=formatTime(run.time);$('speed').textContent=Math.round(run.speed*3.6);$('cleared').textContent=run.cleared;
    $('grip-label').textContent=run.jumpTime>=0?'FLIGHT CONTROL':Math.abs(run.offset)>9?'LOOSE SURFACE':corner>.55?'MAX GRIP ACTIVE':'AERO GRIP';$('grip-dot').style.background=run.jumpTime>=0?'#9bdcf0':Math.abs(run.offset)>9?'#ff9d70':'#93e5c7';
    const next=run.nextObstacle(),nextRamp=run.nextRamp();
    const rampDistance=nextRamp?Math.max(0,nextRamp.s-nextRamp.length-run.s):Infinity;
    const rampNext=nextRamp&&(!next||rampDistance<next.s-run.s);
    $('next-type').textContent=rampNext?'LAUNCH RAMP':next?({car:'PARKED CAR',bus:'BUS',pothole:'POTHOLE',barrier:'ROAD BARRIER'}[next.type]):'FINISH LINE';
    const distance=rampNext?rampDistance:next?Math.max(0,next.s-run.s):Math.max(0,length-12-run.s);
    const jumpCue=!rampNext&&next&&run.jumpTime<0&&run.speed>15&&run.charge>.99&&Math.abs(distance-run.speed*.8)<run.speed*.17;
    $('next-distance').textContent=jumpCue?'JUMP NOW · SPACE':rampNext&&distance<2?'AUTO LAUNCH · LAND WITH SPACE':Math.round(distance)+' m';$('next-distance').style.color=jumpCue||rampNext?'#a9f1d9':'';
    for(let i=0;i<obstacleVisuals.length;i++)obstacleVisuals[i].zone.material.opacity=run.obstacles[i].cleared?.05:.19+Math.sin(elapsed*3)*.05;
    drawMap();
  }
  if(elapsed>noticeUntil)$('notice').classList.remove('visible');renderer.render(scene,camera);
}
requestAnimationFrame(animate);
