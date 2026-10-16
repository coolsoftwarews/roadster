// Shared low-poly scenery batches keep the three city circuits light enough to race.
export function installTrackScenery({scene,track,frame,pointOn,nearestTrack,length,THREE}){
  if(track.id==='canyon')return;
  const root=new THREE.Group();root.name=`${track.id}-scenery`;scene.add(root);
  let seed=track.seed;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;};
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const batches=new Map(),transform=new THREE.Object3D();
  const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.IcosahedronGeometry(1,1),cylinderGeo=new THREE.CylinderGeometry(.8,1,1,7),coneGeo=new THREE.ConeGeometry(1,1,4);
  const materials=new Map();
  function material(color,options={}){const key=color+JSON.stringify(options);if(!materials.has(key))materials.set(key,new THREE.MeshStandardMaterial({color,roughness:.85,...options}));return materials.get(key);}
  function put(geometry,mat,position,scale,rotation=0,quaternion){
    const key=geometry.uuid+mat.uuid;let batch=batches.get(key);if(!batch){batch={geometry,mat,matrices:[]};batches.set(key,batch);}
    transform.position.set(...position);transform.rotation.set(0,rotation,0);if(quaternion)transform.quaternion.copy(quaternion);transform.scale.set(...scale);transform.updateMatrix();batch.matrices.push(transform.matrix.clone());
  }
  const box=(mat,x,y,z,w,h,d,yaw=0)=>put(boxGeo,mat,[x,y,z],[w,h,d],yaw);
  function groundY(x,z){const near=nearestTrack(x,z),natural=-14+Math.sin(x*.012)*8+Math.cos(z*.009)*9+Math.sin(x*.035+z*.025)*3;return near.y-.32+(natural-near.y+.32)*clamp((near.d-12)/43,0,1);}
  function clear(x,z,radius=0){return nearestTrack(x,z).d>radius+15;}
  function atRoad(s,side,distance){const p=pointOn(s,side*distance);return {x:p.x,z:p.z,y:groundY(p.x,p.z),yaw:frame(s).yaw};}
  function beam(a,b,radius,mat){const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),delta=to.clone().sub(from),mid=from.clone().add(to).multiplyScalar(.5);put(cylinderGeo,mat,mid.toArray(),[radius,delta.length(),radius],0,new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));}

  const oakBark=material('#665447'),oakLeaf=material('#4f7541'),oakLight=material('#698953'),palmBark=material('#a8906c'),palmLeaf=material('#3b9276'),window=material('#375f6b',{metalness:.35,roughness:.34}),cream=material('#e8dfca');
  function oak(x,z,size=1){if(!clear(x,z,5*size))return;const y=groundY(x,z);put(cylinderGeo,oakBark,[x,y+3*size,z],[.65*size,6*size,.65*size]);for(let j=0;j<3;j++){const a=j*2.1;put(sphereGeo,j%2?oakLight:oakLeaf,[x+Math.sin(a)*2.3*size,y+(6+j*.35)*size,z+Math.cos(a)*2.3*size],[4.4*size,3.6*size,4*size],random()*6);}}
  function palm(x,z,size=1){if(!clear(x,z,7*size))return;const y=groundY(x,z),height=(10+random()*4)*size;put(cylinderGeo,palmBark,[x,y+height/2,z],[.35*size,height,.35*size]);
    // Broad tapered leaf silhouettes are visible even from the elevated chase camera.
    for(let j=0;j<7;j++){const a=j*Math.PI*2/7+random()*.2,tip=new THREE.Vector3(Math.sin(a)*6.2*size,-1.8*size,Math.cos(a)*6.2*size),mid=new THREE.Vector3(x,y+height,z).addScaledVector(tip,.45);const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),tip.normalize());put(coneGeo,palmLeaf,mid.toArray(),[1.55*size,6.8*size,.6*size],0,q);}
  }
  function hill(x,z,r,h,color){if(!clear(x,z,r))return;put(sphereGeo,material(color),[x,-24,z],[r,h,r*.85],random()*6);}
  function building(x,z,w,h,d,color,yaw=0,style='tower'){
    if(!clear(x,z,Math.hypot(w,d)/2+2))return false;
    const y=groundY(x,z),body=material(color),trim=style==='deco'?material('#fff1d8'):cream;
    box(body,x,y+h/2,z,w,h,d,yaw);
    const place=(mat,lx,ly,lz,bw,bh,bd)=>box(mat,x+Math.cos(yaw)*lx+Math.sin(yaw)*lz,y+ly,z-Math.sin(yaw)*lx+Math.cos(yaw)*lz,bw,bh,bd,yaw);
    const floorHeight=style==='house'?3.3:style==='deco'?4.4:7;
    for(let floor=3;floor<h-1;floor+=floorHeight){
      place(window,0,floor,-d/2-.06,w*.78,style==='deco'?1.5:2,.16);place(window,0,floor,d/2+.06,w*.78,style==='deco'?1.5:2,.16);
      place(window,-w/2-.06,floor,0,.16,1.7,d*.7);place(window,w/2+.06,floor,0,.16,1.7,d*.7);
      if(style==='deco')place(trim,0,floor+1.2,-d/2-.3,w+1,.3,.8);
    }
    place(trim,0,h+.35,0,w+1,.7,d+1);
    if(style==='deco'){
      place(body,0,h+2.3,0,w*.65,4,d*.72);place(trim,0,h+4.4,0,w*.68,.4,d*.75);place(body,0,h+5.7,0,w*.3,2.4,d*.4);
      const stripe=material('#da887e');place(stripe,-w*.32,h*.5,-d/2-.16,.9,h*.87,.25);place(stripe,w*.32,h*.5,-d/2-.16,.9,h*.87,.25);
    }else if(style==='house'){
      put(coneGeo,material('#a36d52'),[x,y+h+2,z],[w*.75,4,d*.75],yaw+Math.PI/4);
    }else{
      place(body,0,h+2.5,0,w*.65,5,d*.7);for(const lx of [-w*.3,0,w*.3])place(trim,lx,h*.5,-d/2-.2,.35,h,.4);
    }
    return true;
  }
  function waterfront(xStart,xEnd,zStart,zEnd,color,y=-1){
    const positions=[],indices=[],step=45;
    for(let z=zStart;z<zEnd;z+=step)for(let x=xStart;x<xEnd;x+=step){
      const corners=[[x,z],[Math.min(x+step,xEnd),z],[x,Math.min(z+step,zEnd)],[Math.min(x+step,xEnd),Math.min(z+step,zEnd)]];
      if(corners.some(([cx,cz])=>nearestTrack(cx,cz).d<40))continue;
      const k=positions.length/3;for(const [cx,cz]of corners)positions.push(cx,y,cz);indices.push(k,k+2,k+1,k+1,k+2,k+3);
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const water=new THREE.Mesh(geometry,material(color,{metalness:.22,roughness:.23}));water.receiveShadow=true;root.add(water);
    // Small bright surface lines suggest sunlit ripples without animated textures.
    const foam=material('#a7e7e2',{roughness:.35});for(let i=0;i<100;i++){const x=xStart+random()*(xEnd-xStart),z=zStart+random()*(zEnd-zStart);if(nearestTrack(x,z).d>65)box(foam,x,y+.03,z,3+random()*13,.025,.15);}
  }

  if(track.id==='austin'){
    // A pink-granite dome and classical wings reference the Texas Capitol.
    const capitol=atRoad(230,-1,96),stone=material('#c99b85'),roof=material('#626b6a'),domeStone=material('#d8c9ad'),x=capitol.x,z=capitol.z,y=capitol.y;
    if(clear(x,z,55)){
      box(stone,x,y+11,z,91,22,37);box(stone,x,y+16,z,38,32,44);box(cream,x,y+2,z-27,58,4,16);
      for(let k=-4;k<=4;k++)put(cylinderGeo,cream,[x+k*7,y+15,z-23],[1.2,24,1.2]);
      const drumGeo=new THREE.CylinderGeometry(1,1,1,24),domeGeo=new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2);
      put(drumGeo,stone,[x,y+36,z],[13,12,13]);put(drumGeo,cream,[x,y+41.6,z],[16.5,1.2,16.5]);
      put(domeGeo,domeStone,[x,y+42,z],[16,15,16]);put(drumGeo,cream,[x,y+60,z],[2.5,7,2.5]);put(drumGeo,roof,[x,y+63.5,z],[3.2,.7,3.2]);put(coneGeo,roof,[x,y+66,z],[3.1,4.5,3.1],Math.PI/4);
      for(let k=-5;k<=5;k++)for(const side of [-1,1])box(window,x+k*7.2,y+12,z+side*18.7,3.3,7,.2);
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
    const sand=material('#ead7a6');
    // A broad beach along the opening coastal straight.
    for(let z=-100;z<620;z+=40)if(clear(-40,z,16))box(sand,-40,1.2,z,28,1,40);
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
    const bridgeRed=material('#b74635'),bridgeLight=material('#d86b48'),bridgeDeck=material('#6f7c7b');
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

  for(const {geometry,mat,matrices}of batches.values()){
    const mesh=new THREE.InstancedMesh(geometry,mat,matrices.length);matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.castShadow=true;mesh.receiveShadow=true;mesh.instanceMatrix.needsUpdate=true;root.add(mesh);
  }
  return root;
}
