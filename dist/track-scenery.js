import {createScenerySurfaces} from './scenery-materials.js?v=cinematic-1';

// Shared geometry and material tiles keep detailed city scenery light enough to race.
export function installTrackScenery({scene,track,frame,pointOn,nearestTrack,length,THREE}){
  const root=new THREE.Group();root.name=`${track.id}-scenery`;scene.add(root);
  let seed=track.seed;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const batches=new Map(),transform=new THREE.Object3D(),surfaces=createScenerySurfaces(THREE);
  const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,12,8),hillGeo=new THREE.SphereGeometry(1,20,12),cylinderGeo=new THREE.CylinderGeometry(.8,1,1,10),coneGeo=new THREE.ConeGeometry(1,1,4);
  const rockGeo=new THREE.IcosahedronGeometry(1,1);
  const detailNoise=(x,z)=>{const v=Math.sin(x*12.9898+z*78.233)*43758.5453;return v-Math.floor(v);};
  const materials=new Map();
  function material(color,options={}){const key=color+JSON.stringify(Object.entries(options).map(([key,value])=>[key,value?.isTexture?value.uuid:value]));if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.85,...options}));return materials.get(key);}
  const nightMaterials=[];
  function litMaterial(color,options={},baseIntensity=.08,nightIntensity=1.4){const mat=material(color,{emissive:color,emissiveIntensity:baseIntensity,...options});if(!nightMaterials.some(item=>item.material===mat))nightMaterials.push({material:mat,baseIntensity,nightIntensity});return mat;}
  root.userData.nightMaterials=nightMaterials;
  root.userData.setNightIntensity=value=>{const amount=clamp(value,0,1);for(const item of nightMaterials)item.material.emissiveIntensity=item.baseIntensity+(item.nightIntensity-item.baseIntensity)*amount;};
  function put(geometry,mat,position,scale,rotation=0,quaternion){
    const key=geometry.uuid+mat.uuid;let batch=batches.get(key);if(!batch){batch={geometry,mat,matrices:[],colors:[]};batches.set(key,batch);}
    transform.position.set(...position);transform.rotation.set(0,rotation,0);if(quaternion)transform.quaternion.copy(quaternion);transform.scale.set(...scale);transform.updateMatrix();batch.matrices.push(transform.matrix.clone());batch.colors.push(new THREE.Color().setScalar(.92+detailNoise(position[0]+position[1],position[2])*.12));
  }
  const box=(mat,x,y,z,w,h,d,yaw=0)=>put(boxGeo,mat,[x,y,z],[w,h,d],yaw);
  function groundY(x,z){const near=nearestTrack(x,z),natural=-14+Math.sin(x*.012)*8+Math.cos(z*.009)*9+Math.sin(x*.035+z*.025)*3;return near.y-.32+(natural-near.y+.32)*clamp((near.d-12)/43,0,1);}
  function clear(x,z,radius=0){return nearestTrack(x,z).d>radius+15;}
  function atRoad(s,side,distance){const p=pointOn(s,side*distance);return {x:p.x,z:p.z,y:groundY(p.x,p.z),yaw:frame(s).yaw};}
  function beam(a,b,radius,mat){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),mid=from.clone().add(to).multiplyScalar(.5);put(cylinderGeo,mat,mid.toArray(),[radius,delta.length(),radius],0,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));}

  const oakBark=material('#675348',{map:surfaces.bark,bumpMap:surfaces.bark,bumpScale:.05}),oakLeaf=material('#4a693e',{map:surfaces.foliage,roughness:.95}),oakLight=material('#63834b',{map:surfaces.foliage,roughness:.95}),palmBark=material('#a68e6d',{map:surfaces.bark,bumpMap:surfaces.bark,bumpScale:.035}),palmLeaf=material('#367854',{map:surfaces.palm,side:THREE.DoubleSide,roughness:.78}),window=litMaterial('#78949f',{map:surfaces.glass,emissiveMap:surfaces.glass,roughnessMap:surfaces.glassRoughness,metalness:.42,roughness:.5,envMapIntensity:.9},.02,.65),cream=material('#e8dfca',{map:surfaces.plaster});
  const frondGeo=new THREE.BufferGeometry(),frondPoints=[],frondUvs=[],frondIndices=[];
  for(let i=0;i<=10;i++){
    const t=i/10,width=Math.pow(Math.sin(t*Math.PI),.7)*(.75+(i%2)*.12),y=Math.sin(t*Math.PI)*.7-t*t*1.6;
    for(const side of [-1,0,1]){frondPoints.push(side*width,y+(side===0?.09:0),t*6.4);frondUvs.push((side+1)/2,t);}
    if(i<10){const k=i*3;frondIndices.push(k,k+3,k+1,k+1,k+3,k+4,k+1,k+4,k+2,k+2,k+4,k+5);}
  }
  frondGeo.setAttribute('position',new THREE.Float32BufferAttribute(frondPoints,3));frondGeo.setAttribute('uv',new THREE.Float32BufferAttribute(frondUvs,2));frondGeo.setIndex(frondIndices);frondGeo.computeVertexNormals();
  function oak(x,z,size=1){if(!clear(x,z,5*size))return;const y=groundY(x,z);put(cylinderGeo,oakBark,[x,y+3*size,z],[.65*size,6*size,.65*size]);for(let j=0;j<3;j++){const a=j*2.1,cx=x+Math.sin(a)*2.3*size,cz=z+Math.cos(a)*2.3*size;beam([x,y+3*size,z],[cx,y+(6+j*.35)*size,cz],.23*size,oakBark);put(sphereGeo,j%2?oakLight:oakLeaf,[cx,y+(6+j*.35)*size,cz],[4.4*size,3.6*size,4*size],random()*6);}}
  function palm(x,z,size=1){if(!clear(x,z,7*size))return;const y=groundY(x,z),height=(10+random()*4)*size;put(cylinderGeo,palmBark,[x,y+height/2,z],[.35*size,height,.35*size]);
    // Curved, tapered fronds replace the old solid cones; all palms share one mesh.
    for(let j=0;j<7;j++){const a=j*Math.PI*2/7+random()*.2;put(frondGeo,palmLeaf,[x,y+height,z],[size,size,size],a);}
  }
  function hill(x,z,r,h,color){if(!clear(x,z,r))return;put(hillGeo,material(color,{map:surfaces.grass,roughness:1}),[x,-24,z],[r,h,r*.85],random()*6);}
  const houseRoof=new THREE.BufferGeometry();houseRoof.setAttribute('position',new THREE.Float32BufferAttribute([-.5,0,-.5,.5,0,-.5,0,.5,-.5,-.5,0,.5,.5,0,.5,0,.5,.5],3));houseRoof.setIndex([0,2,1,3,4,5,0,3,5,0,5,2,2,5,4,2,4,1]);houseRoof.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,.5,1,0,0,1,0,.5,1],2));houseRoof.computeVertexNormals();
  const roofMat=material('#8b6958',{map:surfaces.roof,roughness:.93,flatShading:true}),roofEquipment=material('#697475',{metalness:.25,roughness:.7}),baseStone=material('#a3a090',{map:surfaces.stone,roughness:1});
  function building(x,z,w,h,d,color,yaw=0,style='tower'){
    if(!clear(x,z,Math.hypot(w,d)/2+2))return false;
    const y=groundY(x,z),body=material(color,{map:style==='tower'?surfaces.stone:surfaces.plaster,bumpMap:surfaces.plaster,bumpScale:.035}),trim=style==='deco'?material('#fff1d8',{map:surfaces.plaster}):cream;
    box(body,x,y+h/2,z,w,h,d,yaw);
    const place=(mat,lx,ly,lz,bw,bh,bd)=>box(mat,x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,y+ly,z-Math.sin(yaw)*lx+Math.cos(yaw)*lz,bw,bh,bd,yaw);
    place(baseStone,0,.5,0,w+.35,1,d+.35);
    const floorHeight=style==='house'?3.3:style==='deco'?4.4:7;
    for(let floor=3;floor<h-1;floor+=floorHeight){
      place(window,0,floor,-d/2-.06,w*.78,style==='deco'?1.5:2,.16);place(window,0,floor,d/2+.06,w*.78,style==='deco'?1.5:2,.16);
      place(window,-w/2-.06,floor,0,.16,1.7,d*.7);place(window,w/2+.06,floor,0,.16,1.7,d*.7);
      if(style==='deco')place(trim,0,floor+1.2,-d/2-.3,w+1,.3,.8);
    }
    place(trim,0,h+.35,0,w+1,.7,d+1);
    place(window,0,1.4,-d/2-.12,style==='house'?1.7:3.4,2.8,.2);
    place(trim,0,.22,-d/2-.7,style==='house'?2.7:5,.44,1.4);
    if(style==='deco'){
      place(body,0,h+2.3,0,w*.65,4,d*.72);place(trim,0,h+4.4,0,w*.68,.4,d*.75);place(body,0,h+5.7,0,w*.3,2.4,d*.4);
      const stripe=material('#da887e');place(stripe,-w*.32,h*.5,-d/2-.16,.9,h*.87,.25);place(stripe,w*.32,h*.5,-d/2-.16,.9,h*.87,.25);
      place(trim,0,3,-d/2-1.2,w*.38,.35,2.5);place(roofEquipment,w*.2,h+1.2,d*.15,2.8,1.6,3.4);
    }else if(style==='house'){
      put(houseRoof,roofMat,[x,y+h+.7,z],[w+1.5,6,d+1.5],yaw);place(body,w*.28,h+2,d*.2,1.1,3.1,1.2);
    }else{
      place(body,0,h+2.5,0,w*.65,5,d*.7);for(const lx of [-w*.3,0,w*.3])place(trim,lx,h*.5,-d/2-.2,.35,h,.4);
      place(roofEquipment,-w*.2,h+5.7,0,3,1.5,4);place(roofEquipment,w*.2,h+5.5,d*.15,2,1.2,3);
    }
    return true;
  }
  function waterfront(xStart,xEnd,zStart,zEnd,color,y=-1){
    const positions=[],indices=[],uvs=[],colors=[],step=45;
    const coast=xEnd<0?xEnd:xStart,coastDirection=xEnd<0?-1:1;
    const shallow=new THREE.Color(track.id==='miami'?'#62c5b7':'#90b9b9'),deep=new THREE.Color(track.id==='miami'?'#18859b':color),waterColor=new THREE.Color();
    for(let z=zStart;z<zEnd;z+=step)for(let x=xStart;x<xEnd;x+=step){
      const corners=[[x,z],[Math.min(x+step,xEnd),z],[x,Math.min(z+step,zEnd)],[Math.min(x+step,xEnd),Math.min(z+step,zEnd)]];
      if(corners.some(([cx,cz])=>nearestTrack(cx,cz).d<40))continue;
      const k=positions.length/3;for(const [cx,cz]of corners){positions.push(cx,y,cz);uvs.push(cx/35,cz/35);waterColor.copy(shallow).lerp(deep,clamp(Math.abs(cx-coast)/160,0,1));colors.push(waterColor.r,waterColor.g,waterColor.b);}indices.push(k,k+2,k+1,k+1,k+2,k+3);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const water=new THREE.Mesh(geometry,surfaces.waterMaterial('#ffffff'));water.name='coastal-water';water.receiveShadow=true;water.onBeforeRender=()=>{water.material.userData.waveClock.value=performance.now()*.001;};root.add(water);
    // Broken curved surf bands follow the shore, rather than floating white bars.
    const foamPositions=[],foamColors=[],foamIndices=[];
    for(let strip=0;strip<2;strip++)for(let z=zStart;z<zEnd-12;z+=12){
      if(detailNoise(z,strip)<.2)continue;
      const ends=[z,z+12],edge=coast+coastDirection*(3.8+strip*5.4),k=foamPositions.length/3;
      const xs=ends.map(cz=>edge+Math.sin(cz*.037+strip)*1.5);
      if(ends.some((cz,i)=>!clear(xs[i],cz,25)))continue;
      for(let i=0;i<2;i++)for(const side of [0,1]){foamPositions.push(xs[i]+coastDirection*side*(.5+strip*.35),y+.035,ends[i]);const brightness=.72+detailNoise(ends[i],strip)*.28;foamColors.push(brightness,brightness,brightness);}
      foamIndices.push(k,k+2,k+1,k+1,k+2,k+3);
    }
    const foamGeo=new THREE.BufferGeometry();foamGeo.setAttribute('position',new THREE.Float32BufferAttribute(foamPositions,3));foamGeo.setAttribute('color',new THREE.Float32BufferAttribute(foamColors,3));foamGeo.setIndex(foamIndices);foamGeo.computeVertexNormals();
    const foam=new THREE.Mesh(foamGeo,new THREE.MeshBasicMaterial({color:'#d1e9db',vertexColors:true,transparent:true,opacity:track.id==='miami'?.5:.32,depthWrite:false,side:THREE.DoubleSide}));foam.name='shore-break';root.add(foam);
    // Keep the established deterministic scenery placement sequence unchanged.
    for(let i=0;i<100;i++){const x=xStart+random()*(xEnd-xStart),z=zStart+random()*(zEnd-zStart);if(nearestTrack(x,z).d>65)random();}
    if(track.id==='bay-area'){
      const shoreRock=material('#858a7d',{map:surfaces.stone,roughness:1});
      for(let z=zStart;z<zEnd;z+=21){const x=coast+coastDirection*(1+detailNoise(z,14)*9),size=1.2+detailNoise(z,12)*2.5;if(!clear(x,z,size+2))continue;put(rockGeo,shoreRock,[x,Math.max(y-.2,groundY(x,z))-.2,z],[size,size*.6,size*.8],detailNoise(z,2)*6);}
    }
  }

  if(track.id==='canyon'){
    const cactus=material('#71825b',{map:surfaces.bark,roughness:.95}),sandstone=material('#bf8763',{map:surfaces.stone,roughness:1});
    for(let s=45;s<length-50;s+=61){const p=atRoad(s,s%122<61?1:-1,22+random()*15);if(!clear(p.x,p.z,3))continue;const h=3+random()*4;put(cylinderGeo,cactus,[p.x,p.y+h/2,p.z],[.38,h,.38]);for(const side of [-1,1]){const lift=h*(side>0?.5:.65);beam([p.x,p.y+lift,p.z],[p.x+side*1.3,p.y+lift+.2,p.z],.25,cactus);put(cylinderGeo,cactus,[p.x+side*1.3,p.y+lift+1,p.z],[.26,1.8,.26]);}}
    const arch=atRoad(270,1,90),archGeo=new THREE.TorusGeometry(23,6,7,18,Math.PI);
    if(clear(arch.x,arch.z,34)){put(archGeo,sandstone,[arch.x,arch.y+9,arch.z],[1,1,.7],arch.yaw);for(const side of [-1,1])box(sandstone,arch.x+Math.cos(arch.yaw)*side*23,arch.y+4,arch.z-Math.sin(arch.yaw)*side*23,12,12,10,arch.yaw);}
  }else if(track.id==='austin'){
    // A pink-granite dome and classical wings reference the Texas Capitol.
    const capitol=atRoad(230,-1,96),stone=material('#c99b85',{map:surfaces.stone,bumpMap:surfaces.stone,bumpScale:.045}),roof=material('#626b6a',{metalness:.2,roughness:.6}),domeStone=material('#d8c9ad',{map:surfaces.plaster}),x=capitol.x,z=capitol.z,y=capitol.y;
    if(clear(x,z,55)){
      box(stone,x,y+11,z,91,22,37);box(stone,x,y+16,z,38,32,44);box(cream,x,y+2,z-27,58,4,16);
      for(let k=-4;k<=4;k++)put(cylinderGeo,cream,[x+k*7,y+15,z-23],[1.2,24,1.2]);
      const drumGeo=new THREE.CylinderGeometry(1,1,1,24),domeGeo=new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2);
      put(drumGeo,stone,[x,y+36,z],[13,12,13]);put(drumGeo,cream,[x,y+41.6,z],[16.5,1.2,16.5]);
      put(domeGeo,domeStone,[x,y+42,z],[16,15,16]);put(drumGeo,cream,[x,y+60,z],[2.5,7,2.5]);put(drumGeo,roof,[x,y+63.5,z],[3.2,.7,3.2]);put(coneGeo,roof,[x,y+66,z],[3.1,4.5,3.1],Math.PI/4);
      for(let k=-5;k<=5;k++)for(const side of [-1,1])box(window,x+k*7.2,y+12,z+side*18.7,3.3,7,.2);
      for(let stair=0;stair<5;stair++)box(cream,x,y+.4+stair*.32,z-35+stair*1.7,43,.8+stair*.64,1.8);
      // Formal lawns and trees frame the civic landmark off the road.
      for(const side of [-1,1])for(let k=0;k<4;k++)oak(x+side*59,z-30+k*22,1.3);
    }
    const towerColors=['#91a9a5','#879f9e','#aeb8ab','#a6b5b4'];
    for(let i=0;i<14;i++){const p=atRoad(100+i*27,1,65+(i%3)*41);building(p.x,p.z,17+i%3*5,32+(i%5)*16,19,towerColors[i%4],p.yaw);}
    for(let s=40;s<length-50;s+=47){for(const side of [-1,1]){const p=atRoad(s,side,23+random()*22);oak(p.x,p.z,.8+random()*.6);}}
    for(let i=0;i<40;i++)hill(-450+random()*1600,-100+random()*1850,45+random()*70,45+random()*65,i%2?'#63854b':'#557744');
    for(let i=0;i<35;i++){const p=atRoad(520+random()*(length-650),random()>.5?1:-1,70+random()*80);building(p.x,p.z,15+random()*9,8+random()*25,15+random()*10,['#d0bd98','#b9b59c','#bd9f82'][i%3],p.yaw,'house');}
  }else if(track.id==='miami'){
    waterfront(-750,-48,-500,1850,'#25aeb9',.3);waterfront(1080,1550,-500,1900,'#25aeb9',.3);
    const sand=material('#ead7a6',{map:surfaces.sand,bumpMap:surfaces.sand,bumpScale:.025}),wetSand=material('#b9b38f',{map:surfaces.sand,roughness:.67});
    // A broad beach along the opening coastal straight.
    for(let z=-100;z<620;z+=40)if(clear(-40,z,16)){box(sand,-40,1.2,z,28,1,40);box(wetSand,-53,.65,z,5,.5,40);}
    const colors=['#edb7aa','#b8dcca','#efdec0','#b6d6df','#d6bbd7'];
    for(let i=0;i<12;i++){const p=atRoad(85+i*70,1,47+(i%2)*18);building(p.x,p.z,24+(i%3)*5,15+(i%4)*5,22,colors[i%colors.length],p.yaw,'deco');}
    for(let i=0;i<36;i++){const p=atRoad(880+random()*(length-1000),random()>.35?1:-1,48+random()*45);building(p.x,p.z,21+random()*15,12+random()*23,21,colors[i%5],p.yaw,'deco');}
    for(let s=20;s<length-30;s+=38){for(const side of [-1,1]){const p=atRoad(s,side,21+random()*12);palm(p.x,p.z,.85+random()*.4);}}
    const parasolColors=['#fb9278','#7bd8cd','#f2cf78'];
    for(let z=10;z<590;z+=48){const x=-35+random()*8;if(!clear(x,z,5))continue;put(cylinderGeo,cream,[x,4,z],[.12,5,.12]);put(coneGeo,material(parasolColors[Math.floor(z/48)%3]),[x,7,z],[4,1.5,4],Math.PI/4);box(cream,x+5,1.9,z,1.4,.4,4);}
    // Coastal safety rails sit beyond the curb; their rhythm reinforces the causeway.
    const rail=material('#e3eee6');for(let s=25;s<640;s+=6){const p=pointOn(s,-12,1),f=frame(s);box(rail,p.x,p.y,p.z,.15,1.4,.15);box(rail,p.x,p.y+.5,p.z,.17,.16,6.2,f.yaw);}
  }else if(track.id==='bay-area'){
    waterfront(-750,-55,-500,1850,'#6dabb7',-1);waterfront(1020,1550,-500,1900,'#6dabb7',-1);
    const bridgeRed=material('#b74635',{metalness:.45,roughness:.56}),bridgeLight=material('#d86b48',{metalness:.38,roughness:.49}),bridgeDeck=material('#6f7c7b',{map:surfaces.stone,roughness:.92});
    // The red suspension bridge runs beside the opening climb. Its complete
    // footprint is outside the circuit, so towers and cables never block jumps.
    const bx=-157,bridgeY=27,z0=-80,z1=590;
    box(bridgeDeck,bx,bridgeY,(z0+z1)/2,30,3,z1-z0);
    for(const tz of [50,430]){
      for(const side of [-1,1]){box(bridgeRed,bx+side*20,62,tz,7,132,9);box(bridgeLight,bx+side*20,130,tz,8,5,10);}
      for(const ty of [50,79,108])box(bridgeRed,bx,ty,tz,43,5,8);
    }
    for(const side of [-1,1]){
      let previous=null;
      for(let z=z0;z<=z1;z+=10){let cableY;if(z<50)cableY=38+(z-z0)/(50-z0)*90;else if(z>430)cableY=128-(z-430)/(z1-430)*90;else{const t=(z-50)/380;cableY=46+82*(2*t-1)**2;}
        const p=[bx+side*18,cableY,z];if(previous)beam(previous,p,.65,bridgeLight);previous=p;
        if(z%30===0&&cableY>bridgeY)beam([bx+side*18,bridgeY,z],p,.19,bridgeRed);
      }
      box(bridgeRed,bx+side*15,bridgeY+2,(z0+z1)/2,.5,2,z1-z0);
    }
    const colors=['#d4c7ad','#c1c5c2','#a1b5b6','#d6d4c7'];
    for(let i=0;i<12;i++){const p=atRoad(100+i*34,1,78+(i%3)*42);building(p.x,p.z,19+i%3*4,34+i%5*17,22,colors[i%4],p.yaw);}
    const spire=atRoad(170,1,126);if(clear(spire.x,spire.z,29)){box(cream,spire.x,spire.y+36,spire.z,28,72,28);put(coneGeo,cream,[spire.x,spire.y+103,spire.z],[20,62,20],Math.PI/4);}
    const homes=['#e2c7ad','#b6c2b5','#d1bdc9','#e1d8bd','#b7c8cd'];
    for(let s=430;s<length-70;s+=52){for(const side of [-1,1]){const p=atRoad(s,side,31+random()*34);building(p.x,p.z,9+random()*5,7+random()*8,11+random()*5,homes[Math.floor(s/52)%5],p.yaw,'house');}}
    for(let i=0;i<36;i++)hill(-400+random()*1700,100+random()*1700,45+random()*85,60+random()*90,i%2?'#7a8866':'#6b7d5f');
    for(let s=35;s<length;s+=100){const p=atRoad(s,1,24+random()*20);oak(p.x,p.z,.8+random()*.4);}
  }else if(track.id==='alpine'){
    const pineGeo=new THREE.ConeGeometry(1,1,9),pineGreen=material('#36564c',{map:surfaces.foliage,roughness:1}),pineSnow=material('#e5edf0',{map:surfaces.snow,roughness:.96}),timber=material('#71584c',{map:surfaces.bark,roughness:1});
    function pine(x,z,size){if(!clear(x,z,3.7*size))return;const y=groundY(x,z);put(cylinderGeo,oakBark,[x,y+3.3*size,z],[.35*size,6.6*size,.35*size]);for(let tier=0;tier<3;tier++){const r=(3.4-tier*.7)*size,cy=y+(3.6+tier*2.2)*size;put(pineGeo,pineGreen,[x,cy,z],[r,5.1*size,r],tier*.4);put(pineGeo,pineSnow,[x,cy+.65*size,z],[r*.81,4.1*size,r*.81],tier*.4);}}
    for(let s=15;s<length-25;s+=23)for(const side of [-1,1]){const p=atRoad(s,side,23+random()*29);pine(p.x,p.z,.8+random()*.7);if(s%69<23){const q=atRoad(s+9,side,62+random()*40);pine(q.x,q.z,1.2+random());}}
    // Shared rugged peaks blend exposed rock into snow near the ridgeline.
    const peakPositions=[],peakColors=[],peakIndices=[],peakUvs=[],segments=16,levels=7;
    const rockTone=new THREE.Color('#79868b'),snowTone=new THREE.Color('#edf4f7'),peakColor=new THREE.Color();
    for(let ring=0;ring<=levels;ring++)for(let side=0;side<=segments;side++){const t=ring/levels,a=side%segments/segments*Math.PI*2,edge=1+detailNoise(side%segments,ring)*.15,radius=(1-t)*edge;peakPositions.push(Math.sin(a)*radius,t+(ring&&ring<levels?(detailNoise(side%segments,ring+8)-.5)*.055:0),Math.cos(a)*radius);peakUvs.push(side/segments,t);peakColor.copy(rockTone).lerp(snowTone,clamp((t-.53)*8+(detailNoise(side%segments,ring+24)-.5)*.8,0,1));peakColors.push(peakColor.r,peakColor.g,peakColor.b);if(ring<levels&&side<segments){const k=ring*(segments+1)+side;peakIndices.push(k,k+1,k+segments+1,k+1,k+segments+2,k+segments+1);}}
    const peakGeo=new THREE.BufferGeometry();peakGeo.setAttribute('position',new THREE.Float32BufferAttribute(peakPositions,3));peakGeo.setAttribute('color',new THREE.Float32BufferAttribute(peakColors,3));peakGeo.setAttribute('uv',new THREE.Float32BufferAttribute(peakUvs,2));peakGeo.setIndex(peakIndices);peakGeo.computeVertexNormals();
    const peakMat=material('#ffffff',{map:surfaces.stone,vertexColors:true,roughness:1,flatShading:true});
    for(let i=0;i<34;i++){const s=i/(34-1)*length,p=atRoad(s,i%2?1:-1,170+random()*180),radius=60+random()*80;if(clear(p.x,p.z,radius+5))put(peakGeo,peakMat,[p.x,-30,p.z],[radius,140+random()*190,radius*.85],random()*6);}
    for(let s=135;s<length-80;s+=330){const p=atRoad(s,s%660<330?1:-1,46+random()*22),w=17,h=10+random()*4,d=15;if(!building(p.x,p.z,w,h,d,'#bfa388',p.yaw,'house'))continue;
      put(houseRoof,pineSnow,[p.x,p.y+h+.9,p.z],[w+1.7,6,d+1.7],p.yaw);
      const local=(lx,ly,lz,bw,bh,bd,mat=timber)=>box(mat,p.x+Math.cos(p.yaw)*lx+Math.sin(p.yaw)*lz,p.y+ly,p.z-Math.sin(p.yaw)*lx+Math.cos(p.yaw)*lz,bw,bh,bd,p.yaw);
      local(0,4.5,-d/2-1,w+1,.45,3);local(0,5.6,-d/2-2.2,w+1,.18,.18);for(let k=-4;k<=4;k++)local(k*2,5.1,-d/2-2.2,.12,1.1,.12);local(-w*.28,1.7,-d/2-.15,3,2.6,.2,window);
    }
    const viaductStone=material('#9ca5a4',{map:surfaces.stone,bumpMap:surfaces.stone,bumpScale:.07}),vx=-145,vz0=40,vz1=530,deckY=48,archGeo=new THREE.TorusGeometry(28,3.5,7,22,Math.PI),archQ=new THREE.Quaternion().setFromEuler(new THREE.Euler(0,Math.PI/2,0));
    box(viaductStone,vx,deckY,(vz0+vz1)/2,23,4,vz1-vz0+26);
    for(let z=vz0;z<=vz1;z+=70){for(const side of [-1,1])put(archGeo,viaductStone,[vx+side*9,deckY-33,z],[1,1,1],0,archQ);box(viaductStone,vx,4,z-35,23,76,11);}
    for(const side of [-1,1])box(viaductStone,vx+side*11,deckY+3,(vz0+vz1)/2,.9,2,vz1-vz0+26);
    root.userData.landmarks=['Snow peaks','Pine forest','Alpine chalets','Stone viaduct'];
  }else if(track.id==='tokyo'){
    const signFaceGeo=new THREE.PlaneGeometry(1,1);
    const cityColors=['#777f91','#9497a2','#697887','#ada8b0'],neonPink=litMaterial('#fb65c5',{map:surfaces.neon,emissiveMap:surfaces.neon,roughness:.38},.45,2.5),neonBlue=litMaterial('#72dce9',{map:surfaces.neon,emissiveMap:surfaces.neon,roughness:.38},.4,2.2),neonGold=litMaterial('#f9bf68',{map:surfaces.neon,emissiveMap:surfaces.neon,roughness:.4},.35,2),signMaterials=[neonPink,neonBlue,neonGold],signFrame=material('#293344',{metalness:.45,roughness:.45});
    for(let s=25,i=0;s<length-25;s+=54,i++)for(const side of [-1,1]){
      const p=atRoad(s,side,36+random()*20),w=15+random()*10,h=22+random()*48,d=16+random()*9;if(!building(p.x,p.z,w,h,d,cityColors[i%4],p.yaw,'tower'))continue;
      const local=(mat,lx,ly,lz,bw,bh,bd)=>box(mat,p.x+Math.cos(p.yaw)*lx+Math.sin(p.yaw)*lz,p.y+ly,p.z-Math.sin(p.yaw)*lx+Math.cos(p.yaw)*lz,bw,bh,bd,p.yaw);
      // Independent outward-facing signs on both ends stay readable from either
      // driving direction. FrontSide faces never show reversed backface text.
      for(const face of [-1,1]){
        const sign=(mat,lx,ly,lz,bw,bh)=>put(signFaceGeo,mat,[p.x+Math.cos(p.yaw)*lx+Math.sin(p.yaw)*lz,p.y+ly,p.z-Math.sin(p.yaw)*lx+Math.cos(p.yaw)*lz],[bw,bh,1],p.yaw+(face<0?Math.PI:0));
        local(signFrame,-w*.34,10,face*(d/2+.45),5,14,.55);sign(signMaterials[i%3],-w*.34,10,face*(d/2+.78),4.6,13.4);
        sign(signMaterials[(i+1)%3],w*.1,h*.72,face*(d/2+.18),w*.5,5);
      }
      local(signFrame,0,4.7,-d/2-1.4,w*.83,.45,3);for(let k=-2;k<=2;k++)local(window,k*w*.15,2.1,-d/2-.18,w*.12,3.2,.2);
      if(i%3===0){const q=atRoad(s+25,side,115+random()*75);building(q.x,q.z,24,65+random()*65,24,cityColors[(i+2)%4],q.yaw);}
    }
    // An illuminated lattice tower and its observation deck anchor the opening district.
    const tower=atRoad(225,-1,130),towerRed=material('#b66e61',{metalness:.55,roughness:.45}),towerWhite=material('#d8d8cf',{metalness:.45,roughness:.5}),towerGlow=litMaterial('#ffb87e',{roughness:.3},.25,2),towerBase=tower.y;
    if(clear(tower.x,tower.z,37)){
      for(const sx of [-1,1])for(const sz of [-1,1]){beam([tower.x+sx*28,towerBase,tower.z+sz*28],[tower.x+sx*5,towerBase+137,tower.z+sz*5],1.5,towerRed);for(let j=0;j<6;j++){const y0=12+j*20,y1=y0+20,r0=28-y0*.168,r1=28-y1*.168;beam([tower.x+sx*r0,towerBase+y0,tower.z+sz*r0],[tower.x-sx*r1,towerBase+y1,tower.z+sz*r1],.46,j%2?towerWhite:towerRed);}}
      box(towerRed,tower.x,towerBase+70,tower.z,32,5,32);box(window,tower.x,towerBase+75,tower.z,28,5,28);box(towerGlow,tower.x,towerBase+78,tower.z,31,.6,31);put(cylinderGeo,towerWhite,[tower.x,towerBase+150,tower.z],[1.5,28,1.5]);put(sphereGeo,towerGlow,[tower.x,towerBase+165,tower.z],[1.3,1.3,1.3]);
    }
    // Elevated rail remains entirely beside the driving line, with paired rails,
    // concrete piers, and a stationary commuter train on the opening section.
    const railConcrete=material('#8b929d',{map:surfaces.stone,roughness:.85}),railMetal=material('#525b69',{metalness:.65,roughness:.4}),trainBody=material('#d2d7dc',{metalness:.45,roughness:.35}),trainStripe=litMaterial('#6cd2dc',{roughness:.4},.1,.6);
    for(let s=35;s<Math.min(length-40,950);s+=13){const p=pointOn(s,-25,13),f=frame(s);box(railConcrete,p.x,p.y,p.z,7,1.25,13.4,f.yaw);for(const side of [-1,1]){const q=pointOn(s,-25+side*1.8,13.8);box(railMetal,q.x,q.y,q.z,.14,.18,13.4,f.yaw);}if(s%52<13){const y=groundY(p.x,p.z);box(railConcrete,p.x,(y+p.y)/2,p.z,2.2,p.y-y,2.2,f.yaw);}}
    for(let i=0;i<5;i++){const s=140+i*17,p=pointOn(s,-25,16.3),f=frame(s);box(trainBody,p.x,p.y,p.z,4.4,4.5,15.5,f.yaw);for(const side of [-1,1]){const q=pointOn(s,-25+side*2.23,16.5);box(window,q.x,q.y,q.z,.1,1.4,12.7,f.yaw);box(trainStripe,q.x,q.y-1.4,q.z,.12,.4,15,f.yaw);}box(roofEquipment,p.x,p.y+2.7,p.z,2.4,.9,6,f.yaw);}
    root.userData.landmarks=['Neon district','Lattice observation tower','Elevated railway','City train'];
  }

  // Shared roadside layers use instancing: hundreds of rails, shrubs, and lamps
  // add depth at the driver's eye level without creating hundreds of draw calls.
  const railSteel=material(track.id==='alpine'?'#8a969e':'#87928e',{metalness:.5,roughness:.55}),streetPole=material('#56636c',{metalness:.65,roughness:.5}),streetGlow=litMaterial(track.id==='tokyo'?'#beddf3':'#fff1cb',{roughness:.3},.25,2.2),shrubMat=material(track.id==='alpine'?'#566b62':track.id==='canyon'?'#8a865a':'#647b4d',{map:surfaces.foliage,roughness:1}),groundRocks=material(track.id==='alpine'?'#9ca9ac':'#949589',{map:surfaces.stone,roughness:1});
  for(let s=30;s<length-30;s+=8){const f=frame(s);if(track.id==='tokyo'||Math.abs(f.curvature||0)>.002||track.id==='alpine')for(const side of [-1,1]){const p=pointOn(s,side*12.8,.7);box(railSteel,p.x,p.y,p.z,.18,1.4,.18,f.yaw);box(railSteel,p.x,p.y+.45,p.z,.2,.32,8.15,f.yaw);}}
  for(let s=40;s<length-45;s+=track.id==='tokyo'?54:112){const side=Math.floor(s/(track.id==='tokyo'?54:112))%2?1:-1,p=pointOn(s,side*14.5,0),q=pointOn(s,side*12.7,8.3),f=frame(s);put(cylinderGeo,streetPole,[p.x,p.y+4.25,p.z],[.15,8.5,.15]);beam([p.x,p.y+8.3,p.z],[q.x,q.y,q.z],.12,streetPole);box(streetPole,q.x,q.y,q.z,.85,.27,1.8,f.yaw);box(streetGlow,q.x,q.y-.15,q.z,.7,.05,1.55,f.yaw);}
  for(let s=35;s<length-30;s+=17){const side=random()>.5?1:-1,p=atRoad(s,side,18+random()*16),size=.7+random()*1.1;if(!clear(p.x,p.z,size+1))continue;put(rockGeo,s%51<17?groundRocks:shrubMat,[p.x,p.y+size*.35,p.z],[size*1.7,size*.7,size],random()*6);}

  for(const {geometry,mat,matrices,colors}of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,mat,matrices.length);matrices.forEach((matrix,i)=>{mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,colors[i]);});mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
  }
  // Track selection currently reloads the page. Expose explicit cleanup as well
  // so a future in-place switch can release every shared GPU resource exactly once.
  root.userData.disposeScenery=()=>{
    const geometries=new Set([boxGeo,sphereGeo,hillGeo,cylinderGeo,coneGeo,rockGeo,frondGeo,houseRoof]),ownedMaterials=new Set(materials.values());
    root.traverse(object=>{if(object.geometry)geometries.add(object.geometry);if(object.material)for(const mat of Array.isArray(object.material)?object.material:[object.material])ownedMaterials.add(mat);});
    for(const geometry of geometries)geometry.dispose();for(const mat of ownedMaterials)mat.dispose();surfaces.dispose();root.removeFromParent();
  };
  return root;
}
