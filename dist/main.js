import * as THREE from './vendor/three.module.min.js';
import {Run,ROAD_WIDTH,JUMP_DURATION,RECHARGE_TIME,clamp,lerp,formatTime} from './game-logic.js';
import {DrivingAudio} from './audio.js';

const $=id=>document.getElementById(id);
let renderer;
try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});}catch(e){$('intro').classList.add('hidden');$('error').classList.remove('hidden');throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));renderer.setSize(innerWidth,innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;
$('world').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.background=new THREE.Color('#b9cad0');scene.fog=new THREE.FogExp2('#cfbd9d',.00165);
const camera=new THREE.PerspectiveCamera(57,innerWidth/innerHeight,.2,2200);
scene.add(new THREE.HemisphereLight('#dbeaff','#b48b64',2));
const sun=new THREE.DirectionalLight('#ffdfaf',3.3);sun.position.set(-150,180,90);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-70;sun.shadow.camera.right=70;sun.shadow.camera.top=90;sun.shadow.camera.bottom=-60;sun.shadow.camera.near=1;sun.shadow.camera.far=500;sun.shadow.normalBias=.15;sun.shadow.bias=-.0002;scene.add(sun,sun.target);
const skyGeo=new THREE.SphereGeometry(1800,28,16);const skyMat=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color('#7cabbf')},bottom:{value:new THREE.Color('#f6d4ab')}},vertexShader:'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 v; uniform vec3 top; uniform vec3 bottom; void main(){float f=pow(max(0.,normalize(v).y),.55);gl_FragColor=vec4(mix(bottom,top,f),1.);}'});const sky=new THREE.Mesh(skyGeo,skyMat);scene.add(sky);
const sunBall=new THREE.Mesh(new THREE.SphereGeometry(24,24,12),new THREE.MeshBasicMaterial({color:'#fff1cf'}));sunBall.position.set(-780,260,720);scene.add(sunBall);

const controls=[ [0,1,0],[0,1,120],[30,3,235],[155,10,290],[255,15,230],[255,18,110],[365,18,45],[470,14,130],[425,6,295],[330,1,430],[170,3,490],[85,9,600],[160,19,735],[330,15,790],[490,8,720],[610,9,790],[650,19,950],[520,24,1060],[330,18,1010],[210,9,1135],[300,12,1290],[475,10,1380] ];
const curve=new THREE.CatmullRomCurve3(controls.map(p=>new THREE.Vector3(...p)),false,'centripetal');
curve.arcLengthDivisions=2500;const length=curve.getLength();const run=new Run(length);
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
  const p=[],colors=[],indices=[];
  for(let i=0;i<frames.length;i++){
    const f=frames[i];const stripe=Math.floor(i/3)%2;const color=new THREE.Color(stripe?'#e9ddc7':'#c94737');
    for(const side of [left,right]){const v=f.p.clone().addScaledVector(f.right,side);p.push(v.x,v.y+height+f.bank*side,v.z);if(colored)colors.push(color.r,color.g,color.b);}
    if(i<frames.length-1){let k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(indices);if(colored)geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
const asphalt=new THREE.MeshStandardMaterial({color:'#353b3c',roughness:.95});
const curbMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
const paintMat=new THREE.MeshStandardMaterial({color:'#e9ddbd',roughness:1});
ribbon(-ROAD_WIDTH/2,ROAD_WIDTH/2,.02,asphalt);
for(const sign of [-1,1]){ribbon(sign*9.5,sign*10.2,.05,curbMat,true);ribbon(sign*9.18,sign*9.3,.055,paintMat);}
const dashGeo=new THREE.BoxGeometry(.13,.025,4);const dashMat=new THREE.MeshStandardMaterial({color:'#c7b99b',roughness:1});
const dashMesh=new THREE.InstancedMesh(dashGeo,dashMat,Math.floor(length/18));const dummy=new THREE.Object3D();
for(let i=0;i<dashMesh.count;i++){const f=frame(16+i*18);dummy.position.copy(f.p);dummy.position.y+=.05;dummy.rotation.set(0,f.yaw,0);dummy.updateMatrix();dashMesh.setMatrixAt(i,dummy.matrix);}scene.add(dashMesh);

let seed=38193;function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
function nearestTrack(x,z){let best=Infinity,near=frames[0];for(let i=0;i<frames.length;i+=4){const f=frames[i],d=(x-f.p.x)**2+(z-f.p.z)**2;if(d<best){best=d;near=f;}}return {d:Math.sqrt(best),y:near.p.y};}
const terrainGeo=new THREE.PlaneGeometry(2300,2600,115,130);terrainGeo.rotateX(-Math.PI/2);terrainGeo.translate(300,0,650);
const tp=terrainGeo.attributes.position,tc=[];
for(let i=0;i<tp.count;i++){
  const x=tp.getX(i),z=tp.getZ(i),near=nearestTrack(x,z);
  const natural=-14+Math.sin(x*.012)*8+Math.cos(z*.009)*9+Math.sin(x*.035+z*.025)*3;
  const blend=clamp((near.d-12)/43,0,1);tp.setY(i,lerp(near.y-.32,natural,blend));
  const c=new THREE.Color().setHSL(.065+random()*.018,.34+random()*.12,.21+random()*.1);tc.push(c.r,c.g,c.b);
}terrainGeo.setAttribute('color',new THREE.Float32BufferAttribute(tc,3));terrainGeo.computeVertexNormals();const terrain=new THREE.Mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:true}));terrain.receiveShadow=true;scene.add(terrain);
const sandstone=[new THREE.MeshStandardMaterial({color:'#b17d55',roughness:1,flatShading:true}),new THREE.MeshStandardMaterial({color:'#c99463',roughness:1,flatShading:true}),new THREE.MeshStandardMaterial({color:'#95654b',roughness:1,flatShading:true})];
for(let i=0;i<115;i++){
  const x=random()*1900-650,z=random()*2200-450,near=nearestTrack(x,z);if(near.d<75)continue;
  const radius=22+random()*55,h=25+random()*115;const group=new THREE.Group();
  for(let k=0;k<3;k++){const r=radius*(1-k*.17);const rock=new THREE.Mesh(new THREE.CylinderGeometry(r*.76,r,h/3,5+Math.floor(random()*3),1),sandstone[(i+k)%3]);rock.position.y=h/6+k*h/3;rock.rotation.y=i*.83;rock.castShadow=true;rock.receiveShadow=true;group.add(rock);}
  group.position.set(x,-19,z);scene.add(group);
}
const rockGeo=new THREE.DodecahedronGeometry(1,0),rockMesh=new THREE.InstancedMesh(rockGeo,sandstone[1],750);let rockCount=0;
const bushMesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:'#737450',roughness:1,flatShading:true}),450);let bushCount=0;
for(let i=0;i<1300;i++){
  const s=random()*length,f=frame(s),side=(random()>.5?1:-1)*(13+random()*33),v=f.p.clone().addScaledVector(f.right,side),near=nearestTrack(v.x,v.z);if(near.d<11)continue;
  const size=.35+random()*2.3;dummy.position.copy(v);dummy.position.y-=.3+Math.max(0,Math.abs(side)-13)*.18;dummy.rotation.set(random(),random()*6,random());dummy.scale.set(size,size*.7,size);dummy.updateMatrix();
  if(i%3&&rockCount<750)rockMesh.setMatrixAt(rockCount++,dummy.matrix);else if(bushCount<450){dummy.scale.set(size*.8,size*.45,size*.8);dummy.updateMatrix();bushMesh.setMatrixAt(bushCount++,dummy.matrix);}
}rockMesh.count=rockCount;rockMesh.castShadow=true;rockMesh.receiveShadow=true;bushMesh.count=bushCount;bushMesh.castShadow=true;scene.add(rockMesh,bushMesh);

function box(parent,w,h,d,x,y,z,mat){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
const black=new THREE.MeshStandardMaterial({color:'#111b21',roughness:.46});const tireMat=new THREE.MeshStandardMaterial({color:'#14191b',roughness:.9});const alloy=new THREE.MeshStandardMaterial({color:'#66747c',metalness:.8,roughness:.27});
function wheel(parent,x,y,z,r=.55,width=.38){const g=new THREE.Group();const tire=new THREE.Mesh(new THREE.CylinderGeometry(r,r,width,16),tireMat);tire.rotation.z=Math.PI/2;g.add(tire);const rim=new THREE.Mesh(new THREE.CylinderGeometry(r*.66,r*.66,width+.015,10),alloy);rim.rotation.z=Math.PI/2;g.add(rim);g.position.set(x,y,z);g.castShadow=true;parent.add(g);return g;}
function shell(rings,mat){const p=[],idx=[];for(const [z,w,bottom,top]of rings){p.push(-w,bottom,z,w,bottom,z,w*.97,top-.11,z,w*.78,top,z,-w*.78,top,z,-w*.97,top-.11,z);}
  for(let i=0;i<rings.length-1;i++)for(let j=0;j<6;j++){let a=i*6+j,b=i*6+(j+1)%6;idx.push(a,b,a+6,b,b+6,a+6);}idx.push(0,5,1,1,5,4,1,4,2,2,4,3);let n=(rings.length-1)*6;idx.push(n,n+1,n+5,n+1,n+4,n+5,n+1,n+2,n+4,n+2,n+3,n+4);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p,3));geo.setIndex(idx);geo.computeVertexNormals();return new THREE.Mesh(geo,mat);}
function roadster(){const car=new THREE.Group();const white=new THREE.MeshStandardMaterial({color:'#f4f2e9',metalness:.45,roughness:.25});
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
const {car,wheels,flames}=roadster();scene.add(car);
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
    const yellow=new THREE.MeshStandardMaterial({color:'#dca348',metalness:.15,roughness:.5});box(group,3.25,2.65,10.8,0,1.85,0,yellow);box(group,3.3,.35,10.9,0,.65,0,black);box(group,3,.08,10.4,0,3.21,0,paintMat);
    for(const side of [-1,1]){for(let i=0;i<7;i++)box(group,.035,.88,1.05,side*1.632,2.46,-4.25+i*1.4,black);for(const z of [-3.6,3.6])wheel(group,side*1.58,.65,z,.66,.4);}
    box(group,2.8,.9,.035,0,2.45,-5.42,black);box(group,2.8,1.15,.04,0,2.37,5.42,black);for(const side of [-1,1])box(group,.3,.15,.07,side*1.23,.94,-5.45,new THREE.MeshStandardMaterial({color:'#f54835',emissive:'#f54835',emissiveIntensity:.6}));
  }else{
    const color=['#b75c42','#68928b','#8394aa'][o.id%3],mat=new THREE.MeshStandardMaterial({color,roughness:.36,metalness:.35});const body=shell([[-2.8,1.1,.4,1.1],[-2,1.4,.35,1.2],[1.8,1.4,.35,1.2],[2.8,1.1,.5,1]],mat);group.add(body);const cab=shell([[-1.7,1.1,1.1,1.25],[-.9,1,1.1,1.65],[.7,1,1.1,1.65],[1.6,1.1,1.1,1.2]],black);group.add(cab);for(const side of [-1,1])for(const z of [-1.7,1.65])wheel(group,side*1.3,.55,z,.55,.35);box(group,2,.09,.03,0,1.07,-2.81,new THREE.MeshStandardMaterial({color:'#ee6752',emissive:'#ee6752',emissiveIntensity:.6}));
  }
  const f=frame(o.s);group.position.copy(pointOn(o.s,o.offset,.035));group.rotation.set(-Math.atan2(f.t.y,Math.hypot(f.t.x,f.t.z)),f.yaw,-f.bank);group.traverse(m=>{if(m.isMesh){m.castShadow=true;m.receiveShadow=true;}});scene.add(group);
  const zone=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(o.width+3,16),6),markerMat.clone());zone.rotation.x=-Math.PI/2;const zp=pointOn(o.s-25,o.offset,.09);zone.position.copy(zp);zone.rotation.z=-f.yaw;scene.add(zone);
  return {group,zone};
}
for(const o of run.obstacles)obstacleVisuals.push(makeObstacle(o));
// Repeated chevrons help read the approaching corners.
const chevronCanvas=document.createElement('canvas');chevronCanvas.width=128;chevronCanvas.height=80;const cx=chevronCanvas.getContext('2d');cx.fillStyle='#e6b759';cx.fillRect(0,0,128,80);cx.strokeStyle='#282a29';cx.lineWidth=15;for(const x of [20,69]){cx.beginPath();cx.moveTo(x,10);cx.lineTo(x+28,40);cx.lineTo(x,70);cx.stroke();}
const signMat=new THREE.MeshStandardMaterial({map:new THREE.CanvasTexture(chevronCanvas),side:THREE.DoubleSide,roughness:1});
for(let s=70;s<length-60;s+=43){const f=frame(s);if(Math.abs(f.curvature)<.007)continue;const side=f.curvature>0?-1:1;const g=new THREE.Group();box(g,.12,2.5,.12,0,1.25,0,alloy);const face=new THREE.Mesh(new THREE.PlaneGeometry(2.5,1.55),signMat);face.position.y=2.5;face.rotation.y=Math.PI;g.add(face);g.position.copy(pointOn(s,side*11.5));g.rotation.y=f.yaw+(side>0?-.2:.2);scene.add(g);}
const finishGroup=new THREE.Group();const finishMat=new THREE.MeshStandardMaterial({color:'#17272c',roughness:.5});for(const side of [-1,1])box(finishGroup,.5,9,.6,side*10,4.5,0,finishMat);box(finishGroup,20.5,1.3,.65,0,8.5,0,finishMat);
const bannerCanvas=document.createElement('canvas');bannerCanvas.width=1024;bannerCanvas.height=80;const bctx=bannerCanvas.getContext('2d');bctx.fillStyle='#17272c';bctx.fillRect(0,0,1024,80);bctx.font='bold 43px Arial';bctx.textAlign='center';bctx.fillStyle='#fff5df';bctx.fillText('F I N I S H',512,56);const banner=new THREE.Mesh(new THREE.PlaneGeometry(16,1.2),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bannerCanvas),side:THREE.DoubleSide}));banner.position.set(0,8.5,-.34);banner.rotation.y=Math.PI;finishGroup.add(banner);const ff=frame(length-12);finishGroup.position.copy(ff.p);finishGroup.rotation.y=ff.yaw;scene.add(finishGroup);
for(let row=0;row<2;row++)for(let col=0;col<20;col++){const tile=new THREE.Mesh(new THREE.PlaneGeometry(.95,1.2),new THREE.MeshStandardMaterial({color:(row+col)%2?'#e4dac7':'#252c2e'}));tile.rotation.x=-Math.PI/2;tile.position.copy(pointOn(length-12+row*1.2,col*.95-9,.08));tile.rotation.z=-ff.yaw;scene.add(tile);}

const particles=[];const dustGeo=new THREE.SphereGeometry(.12,5,4);const dustMat=new THREE.MeshBasicMaterial({color:'#e8d5ac',transparent:true,opacity:.6,depthWrite:false});
function burst(count,at,color='#b9eeff'){for(let i=0;i<count;i++){const m=new THREE.Mesh(dustGeo,dustMat.clone());m.material.color.set(color);m.position.copy(at).add(new THREE.Vector3((Math.random()-.5)*2,Math.random(),(Math.random()-.5)*2));scene.add(m);particles.push({mesh:m,life:1,max:1,v:new THREE.Vector3((Math.random()-.5)*6,Math.random()*3,(Math.random()-.5)*6)});}}
const audio=new DrivingAudio();const input={gas:false,brake:false,left:false,right:false};let last=performance.now(),elapsed=0,noticeUntil=0,shake=0,renderFrames=0;
let cameraTarget=new THREE.Vector3(),cameraInitialized=false;const tempLook=new THREE.Vector3();
$('track-distance').textContent=(length/1000).toFixed(1);$('obstacle-count').textContent=run.obstacles.length;$('total').textContent=run.obstacles.length;
const map=$('minimap'),mapctx=map.getContext('2d');const bounds={minX:Math.min(...samples.map(p=>p.x)),maxX:Math.max(...samples.map(p=>p.x)),minZ:Math.min(...samples.map(p=>p.z)),maxZ:Math.max(...samples.map(p=>p.z))};const scale=Math.min(205/(bounds.maxX-bounds.minX),168/(bounds.maxZ-bounds.minZ));
const mapPoint=p=>[120+(p.x-(bounds.minX+bounds.maxX)/2)*scale,100-(p.z-(bounds.minZ+bounds.maxZ)/2)*scale];
function drawMap(){mapctx.clearRect(0,0,240,200);mapctx.lineWidth=3;mapctx.lineCap='round';mapctx.strokeStyle='#ffffff60';mapctx.beginPath();samples.forEach((p,i)=>{const [x,y]=mapPoint(p);i?mapctx.lineTo(x,y):mapctx.moveTo(x,y);});mapctx.stroke();const [x,y]=mapPoint(frame(run.s).p);mapctx.fillStyle='#ff825b';mapctx.shadowColor='#ff825b';mapctx.shadowBlur=9;mapctx.beginPath();mapctx.arc(x,y,5,0,Math.PI*2);mapctx.fill();mapctx.shadowBlur=0;const [fx,fy]=mapPoint(samples.at(-1));mapctx.fillStyle='#f1e9d7';mapctx.fillRect(fx-3,fy-3,6,6);}
function message(title,detail='',kind=''){const n=$('notice');n.className='notice visible '+kind;n.replaceChildren(document.createTextNode(title));if(detail){const s=document.createElement('small');s.textContent=detail;n.appendChild(s);}noticeUntil=elapsed+2.5;}
function clearInput(){for(const k in input)input[k]=false;document.querySelectorAll('.touch-controls .active').forEach(b=>b.classList.remove('active'));}
async function startRun(){audio.start().catch(()=>{});run.reset();run.start();clearInput();cameraInitialized=false;document.body.classList.add('playing');for(const id of ['intro','pause-panel','finish','intro-footer'])$(id).classList.add('hidden');$('hud').classList.remove('hidden');$('touch-controls').classList.remove('hidden');$('pause').setAttribute('aria-label','Pause game');for(const v of obstacleVisuals)v.zone.material.opacity=.24;message('YOUR ROAD. YOUR PACE.','Hold W or ↑ to accelerate. Space to thrust.');}
function pauseToggle(){if(run.state==='running'){run.state='paused';clearInput();$('pause-panel').classList.remove('hidden');$('touch-controls').classList.add('hidden');$('pause').setAttribute('aria-label','Resume game');$('resume').focus();}else if(run.state==='paused'){run.state='running';$('pause-panel').classList.add('hidden');$('touch-controls').classList.remove('hidden');$('pause').setAttribute('aria-label','Pause game');audio.start();}}
function thrust(){if(run.jump())return;if(run.state==='running'&&run.speed<5)message('BUILD SOME SPEED','Accelerate before firing the thrusters.');else if(run.state==='running'&&run.charge<.99)message('TANK RECHARGING','Ready for another burst in a moment.');}
function mute(){const muted=audio.toggle();$('sound').classList.toggle('muted',muted);$('sound').setAttribute('aria-label',muted?'Unmute sound':'Mute sound');$('sound').setAttribute('aria-pressed',String(muted));}
function finish(){clearInput();$('touch-controls').classList.add('hidden');$('finish').classList.remove('hidden');let best={time:Infinity,score:0};try{const saved=JSON.parse(localStorage.getItem('roadster-run-best')||'null');if(saved&&Number.isFinite(saved.time)&&Number.isFinite(saved.score))best=saved;}catch{}
  const isBest=run.time<best.time||run.score>best.score;best={time:Math.min(run.time,best.time),score:Math.max(run.score,best.score)};try{localStorage.setItem('roadster-run-best',JSON.stringify(best));}catch{}
  $('final-score').textContent=String(run.score).padStart(4,'0');$('final-time').textContent=formatTime(run.time);$('final-clears').textContent=`${run.cleared} / ${run.obstacles.length}`;$('best-time').textContent=formatTime(best.time);$('new-best').classList.toggle('hidden',!isBest);$('finish-copy').textContent=run.cleared===run.obstacles.length?'Every obstacle cleared. The canyon is yours.':`${run.successfulJumps} successful jump${run.successfulJumps===1?'':'s'}. Another run, another chance to fly.`;$('again').focus();audio.reward();}
$('start').addEventListener('click',startRun);$('again').addEventListener('click',startRun);$('restart').addEventListener('click',startRun);$('pause').addEventListener('click',pauseToggle);$('resume').addEventListener('click',pauseToggle);$('sound').addEventListener('click',mute);$('touch-thrust').addEventListener('pointerdown',e=>{e.preventDefault();thrust();});
const keyMap={KeyW:'gas',ArrowUp:'gas',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right'};
window.addEventListener('keydown',e=>{if(keyMap[e.code]){e.preventDefault();if(run.state==='running')input[keyMap[e.code]]=true;}if(['Space','Escape','KeyP','KeyR'].includes(e.code))e.preventDefault();if(e.repeat)return;if(e.code==='Space')thrust();if(e.code==='Escape'||e.code==='KeyP')pauseToggle();if(e.code==='KeyR')run.recover();if(e.code==='KeyM')mute();});
window.addEventListener('keyup',e=>{if(keyMap[e.code])input[keyMap[e.code]]=false;});window.addEventListener('blur',()=>{clearInput();if(run.state==='running')pauseToggle();});document.addEventListener('visibilitychange',()=>{if(document.hidden&&run.state==='running')pauseToggle();});
document.querySelectorAll('[data-control]').forEach(b=>{const c=b.dataset.control;b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);input[c]=true;b.classList.add('active');});for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{input[c]=false;b.classList.remove('active');});});
window.addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();cameraInitialized=false;});

function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-last)/1000,.035);last=now;elapsed+=dt;const playing=run.state==='running';
  if(playing){run.update(dt,input);for(const event of run.drainEvents()){
    if(event.type==='jump'){audio.thrust();shake=.14;burst(16,car.position);message('TAKE FLIGHT','Keep your line. Land the jump.');}
    if(event.type==='land'){audio.land();shake=.2;burst(14,car.position,'#d4b48a');if(event.points){audio.reward();message(`+${event.points}`,'CLEAN LANDING','reward');}}
    if(event.type==='hit'){audio.collision();shake=.4;burst(12,car.position,'#d1a983');message(event.obstacle==='pothole'?'WATCH THE ROAD':'CONTACT','Build speed, then jump earlier.','warning');}
    if(event.type==='recover'){cameraInitialized=false;message('BACK ON TRACK','Recovered at your last checkpoint.');}
    if(event.type==='checkpoint')message('CHECKPOINT','Your progress is safe.');
    if(event.type==='finish')finish();
  }}
  const preview=run.state==='ready';const visualS=preview?run.obstacles[0].s-45:run.s;const f=frame(visualS);const pos=pointOn(visualS,preview?0:run.offset,run.height+.04);
  car.position.copy(pos);const steeringYaw=Math.atan2(run.lateralVelocity,Math.max(9,run.speed));
  car.rotation.set(0,0,0);car.rotation.order='YXZ';car.rotation.y=f.yaw+steeringYaw;car.rotation.x=-Math.atan2(f.t.y,Math.hypot(f.t.x,f.t.z))+(run.jumpTime>=0?-.1*Math.cos(run.jumpTime/JUMP_DURATION*Math.PI):0);car.rotation.z=run.roll-f.bank-clamp(run.lateralVelocity*.009,-.08,.08);
  for(const w of wheels)w.rotation.x+=run.speed*dt/.56;
  for(let i=0;i<flames.length;i++){const active=run.jumpTime>=0;flames[i].visible=active||(preview&&i<2);if(flames[i].visible){flames[i].scale.setScalar((active?1:.2)*(1+Math.random()*.2));flames[i].material.opacity=active?.75:.4;}}
  shadow.position.copy(pointOn(visualS,preview?0:run.offset,.09));shadow.rotation.z=-f.yaw;shadow.material.opacity=1-run.height*.085;shadow.scale.setScalar(1+run.height*.03);
  const forward=new THREE.Vector3(f.t.x,0,f.t.z).normalize();const target=pos.clone().addScaledVector(forward,preview?17:13);target.y=pointOn(visualS+18,run.offset,1.5).y;
  const back=preview?18:16+run.speed*.035;const desired=pos.clone().addScaledVector(forward,-back).addScaledVector(f.right,preview?11:run.lateralVelocity*.09);desired.y=f.p.y+(preview?12:10)+run.height*.36;
  if(preview)target.addScaledVector(f.right,13);
  if(!cameraInitialized){camera.position.copy(desired);cameraTarget.copy(target);cameraInitialized=true;}else{camera.position.lerp(desired,1-Math.exp(-dt*5));cameraTarget.lerp(target,1-Math.exp(-dt*6));}
  tempLook.copy(cameraTarget);if(shake>0){tempLook.x+=(Math.random()-.5)*shake;tempLook.y+=(Math.random()-.5)*shake;shake=Math.max(0,shake-dt*.8);}camera.lookAt(tempLook);
  camera.fov=lerp(camera.fov,preview?57:57+run.speed*.085,dt*3);camera.updateProjectionMatrix();sky.position.copy(camera.position);
  sun.position.copy(pos).add(new THREE.Vector3(-110,145,70));sun.target.position.copy(pos);
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.life-=dt;p.mesh.position.addScaledVector(p.v,dt);p.mesh.scale.setScalar(1+(1-p.life)*7);p.mesh.material.opacity=Math.max(0,p.life*.45);if(p.life<=0){scene.remove(p.mesh);p.mesh.material.dispose();particles.splice(i,1);}}
  const corner=clamp(Math.abs(f.curvature)*run.speed*1.1+Math.abs(run.lateralVelocity)*.05,0,1.5);audio.update(run.speed,input.gas,corner,run.jumpTime>=0,playing);
  if(renderFrames++%3===0){
    $('score').textContent=String(run.score).padStart(4,'0');$('timer').textContent=formatTime(run.time);$('speed').textContent=Math.round(run.speed*3.6);$('cleared').textContent=run.cleared;
    const pct=clamp(run.s/length*100,0,100);$('progress-bar').style.width=pct+'%';$('progress-label').textContent=Math.floor(pct)+'%';$('charge-bar').style.width=run.charge*100+'%';
    $('thrust-label').textContent=run.jumpTime>=0?'IN FLIGHT':run.charge>=.999?'READY':`${Math.ceil((1-run.charge)*RECHARGE_TIME*10)/10}s`;
    $('grip-label').textContent=run.jumpTime>=0?'FLIGHT CONTROL':Math.abs(run.offset)>9?'LOOSE SURFACE':corner>.55?'MAX GRIP ACTIVE':'AERO GRIP';$('grip-dot').style.background=run.jumpTime>=0?'#9bdcf0':Math.abs(run.offset)>9?'#ff9d70':'#93e5c7';
    const next=run.nextObstacle();$('next-type').textContent=next?({car:'PARKED CAR',bus:'BUS',pothole:'POTHOLE',barrier:'ROAD BARRIER'}[next.type]):'FINISH LINE';const distance=next?Math.max(0,next.s-run.s):Math.max(0,length-12-run.s);const jumpCue=next&&run.speed>15&&run.charge>.99&&Math.abs(distance-run.speed*.8)<run.speed*.17; $('next-distance').textContent=jumpCue?'THRUST NOW · SPACE':Math.round(distance)+' m'; $('next-distance').style.color=jumpCue?'#a9f1d9':'';
    for(let i=0;i<obstacleVisuals.length;i++)obstacleVisuals[i].zone.material.opacity=run.obstacles[i].cleared?.05:.19+Math.sin(elapsed*3)*.05;
    drawMap();
  }
  if(elapsed>noticeUntil)$('notice').classList.remove('visible');renderer.render(scene,camera);
}
requestAnimationFrame(animate);
