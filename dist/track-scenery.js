import {createScenerySurfaces} from './scenery-materials.js?v=realism-1';

// Shared geometry and material tiles keep detailed city scenery light enough to race.
export function installTrackScenery({scene,track,frame,pointOn,nearestTrack,length,THREE}){
  if(track.id==='canyon')return;
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
  function put(geometry,mat,position,scale,rotation=0,quaternion){
    const key=geometry.uuid+mat.uuid;let batch=batches.get(key);if(!batch){batch={geometry,mat,matrices:[],colors:[]};batches.set(key,batch);}
    transform.position.set(...position);transform.rotation.set(0,rotation,0);if(quaternion)transform.quaternion.copy(quaternion);transform.scale.set(...scale);transform.updateMatrix();batch.matrices.push(transform.matrix.clone());batch.colors.push(new THREE.Color().setScalar(.92+detailNoise(position[0]+position[1],position[2])*.12));
  }
  const box=(mat,x,y,z,w,h,d,yaw=0)=>put(boxGeo,mat,[x,y,z],[w,h,d],yaw);
  function groundY(x,z){const near=nearestTrack(x,z),natural=-14+Math.sin(x*.012)*8+Math.cos(z*.009)*9+Math.sin(x*.035+z*.025)*3;return near.y-.32+(natural-near.y+.32)*clamp((near.d-12)/43,0,1);}
  function clear(x,z,radius=0){return nearestTrack(x,z).d>radius+15;}
  function atRoad(s,side,distance){const p=pointOn(s,side*distance);return {x:p.x,z:p.z,y:groundY(p.x,p.z),yaw:frame(s).yaw};}
  function beam(a,b,radius,mat){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),mid=from.clone().add(to).multiplyScalar(.5);put(cylinderGeo,mat,mid.toArray(),[radius,delta.length(),radius],0,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));}

  const oakBark=material('#675348',{map:surfaces.bark,bumpMap:surfaces.bark,bumpScale:.05}),oakLeaf=material('#4a693e',{map:surfaces.foliage,roughness:.95}),oakLight=material('#63834b',{map:surfaces.foliage,roughness:.95}),palmBark=material('#a68e6d',{map:surfaces.bark,bumpMap:surfaces.bark,bumpScale:.035}),palmLeaf=material('#367854',{map:surfaces.palm,side:THREE.DoubleSide,roughness:.78}),window=material('#78949f',{map:surfaces.glass,roughnessMap:surfaces.glassRoughness,metalness:.42,roughness:.5,envMapIntensity:.9}),cream=material('#e8dfca',{map:surfaces.plaster});
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

  if(track.id==='austin'){
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
  }

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
