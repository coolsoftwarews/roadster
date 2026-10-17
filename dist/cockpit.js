/** A light foreground interior, authored in camera space (-Z looks forward). */
export function createCockpit(THREE,camera) {
  const root=new THREE.Group();root.name='roadster-cockpit';root.visible=false;camera.add(root);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  const ownGeometry=geometry=>(geometries.add(geometry),geometry);
  const ownMaterial=material=>(materials.add(material),material);
  const material=(color,roughness=.7,metalness=0)=>ownMaterial(new THREE.MeshStandardMaterial({color,roughness,metalness,fog:false}));
  const dashMat=material('#142027',.88),lowerMat=material('#0b1217',.93),leather=material('#10181e',.7),trim=material('#6c7b83',.35,.75),darkTrim=material('#263740',.45,.55);
  const glow=ownMaterial(new THREE.MeshBasicMaterial({color:'#a8dbea',transparent:true,opacity:.3,depthWrite:false,toneMapped:false,fog:false}));
  function mesh(geometry,mat,parent=root){const object=new THREE.Mesh(ownGeometry(geometry),mat);object.castShadow=false;object.receiveShadow=false;object.frustumCulled=false;parent.add(object);return object;}
  function box(width,height,depth,x,y,z,mat,parent=root){const object=mesh(new THREE.BoxGeometry(width,height,depth,1,1,1),mat,parent);object.position.set(x,y,z);return object;}

  // The curved hood falls away toward the windscreen; its crown stays below
  // the instrument panel, leaving the road and obstacles in clear view.
  const sections=48,vertices=[],indices=[];
  for(let i=0;i<=sections;i++) {
    const x=(i/sections-.5)*3.5,bow=Math.min(1,Math.abs(x)/1.6);
    vertices.push(x,-.279-bow*.03,-.76+bow*.12);
    vertices.push(x,-.296-bow*.035,-.56+bow*.08);
    vertices.push(x,-.42-bow*.02,-.395+bow*.03);
    vertices.push(x,-.57,-.42);
    if(i<sections)for(let row=0;row<3;row++){const a=i*4+row;indices.push(a,a+1,a+4,a+1,a+5,a+4);}
  }
  const hoodGeometry=new THREE.BufferGeometry();hoodGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));hoodGeometry.setIndex(indices);hoodGeometry.computeVertexNormals();
  const dashboard=mesh(hoodGeometry,dashMat);
  box(3.5,.18,.12,0,-.48,-.415,lowerMat);

  const dashboardTrim=box(3.3,.007,.012,0,-.34,-.485,trim);
  const ambientStrip=box(3.3,.0025,.008,0,-.354,-.478,glow);
  // Fine, shallow vent blades give the upper dashboard some real depth.
  const vents=new THREE.Group();root.add(vents);
  for(let i=0;i<7;i++)box(.105,.003,.02,0,-.302-i*.006,-.512,darkTrim,vents);

  const wheel=new THREE.Group();wheel.name='cockpit-steering-wheel';root.add(wheel);
  const ringPoints=Array.from({length:64},(_,i)=>{const angle=i/64*Math.PI*2;return new THREE.Vector3(Math.cos(angle)*.113,Math.max(-.086,Math.sin(angle)*.113),0);});
  const ringCurve=new THREE.CatmullRomCurve3(ringPoints,true,'centripetal');
  mesh(new THREE.TubeGeometry(ringCurve,96,.012,8,true),leather,wheel);
  // Flattened lower rim, satin spokes, and a padded hub rather than a plain hoop.
  for(const side of [-1,1]) {
    const spoke=box(.078,.018,.014,side*.063,-.012,.001,darkTrim,wheel);spoke.rotation.z=side*.13;
    const button=box(.025,.008,.005,side*.064,-.008,.012,lowerMat,wheel);button.rotation.z=side*.13;
    box(.007,.0018,.001,side*.064,-.007,.015,trim,wheel);
  }
  const lowerSpoke=box(.025,.074,.014,0,-.045,.001,darkTrim,wheel);lowerSpoke.rotation.z=.04;
  const hub=mesh(new THREE.SphereGeometry(1,24,12),leather,wheel);hub.scale.set(.044,.032,.016);hub.position.z=.009;
  const badge=box(.018,.002,.002,0,.002,.026,trim,wheel);
  // A thin center mark is useful while steering without becoming a HUD overlay.
  box(.009,.009,.025,0,.113,0,trim,wheel);

  function screen(width,height) {
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=256;
    const context=canvas.getContext('2d');
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;textures.add(texture);
    const mat=ownMaterial(new THREE.MeshBasicMaterial({map:texture,toneMapped:false,fog:false}));
    const group=new THREE.Group();root.add(group);
    box(width+.016,height+.016,.012,0,0,-.007,lowerMat,group);
    const face=mesh(new THREE.PlaneGeometry(width,height),mat,group);face.position.z=.001;
    return {group,canvas,context,texture};
  }
  const instruments=screen(.235,.1175);
  const centerDisplay=screen(.145,.0725);
  function drawCenter(){
    const ctx=centerDisplay.context;ctx.fillStyle='#081218';ctx.fillRect(0,0,512,256);
    ctx.fillStyle='#8babb7';ctx.font='600 24px system-ui, sans-serif';ctx.textAlign='left';ctx.fillText('ROADSTER',29,42);
    ctx.strokeStyle='#82d5e3';ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(47,204);ctx.bezierCurveTo(30,138,180,178,169,112);ctx.bezierCurveTo(163,75,300,111,292,63);ctx.stroke();
    ctx.fillStyle='#cbe7ec';ctx.beginPath();ctx.arc(47,204,9,0,Math.PI*2);ctx.fill();
    ctx.textAlign='right';ctx.fillStyle='#bcd4dd';ctx.font='500 25px system-ui, sans-serif';ctx.fillText('DRIVE',480,128);
    ctx.fillStyle='#5d7c8a';ctx.font='18px system-ui, sans-serif';ctx.fillText('ROADSTER RUN',480,161);centerDisplay.texture.needsUpdate=true;
  }
  drawCenter();
  let previousSpeed=-1,previousBrake=null,previousNight=-1;
  function drawInstruments(speed,braking,nightFactor){
    const ctx=instruments.context;ctx.fillStyle='#071016';ctx.fillRect(0,0,512,256);
    ctx.fillStyle=nightFactor>.5?'#b4dfea':'#dbe9ec';ctx.textAlign='center';ctx.font='500 103px system-ui, sans-serif';ctx.fillText(String(speed),256,154);
    ctx.font='500 20px system-ui, sans-serif';ctx.fillStyle='#89a3ad';ctx.fillText('KM/H',256,188);
    ctx.font='600 27px system-ui, sans-serif';ctx.textAlign='left';ctx.fillStyle=braking?'#f4ac83':'#83d7ca';ctx.fillText(braking?'BRAKE':'D',30,54);
    ctx.strokeStyle='#36525f';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(34,222);ctx.lineTo(478,222);ctx.stroke();
    ctx.strokeStyle='#85d3e1';ctx.beginPath();ctx.moveTo(34,222);ctx.lineTo(34+Math.min(speed/300,1)*444,222);ctx.stroke();
    instruments.texture.needsUpdate=true;
  }

  // Narrow A-pillars hug the edge of the camera frustum rather than covering
  // the center. The windshield itself is deliberately clear.
  const pillars=[-1,1].map(side=>{
    const pillar=mesh(new THREE.CylinderGeometry(.019,.03,1,10,1),leather);
    const lining=mesh(new THREE.CylinderGeometry(.006,.009,1,8,1),darkTrim);
    return {side,pillar,lining};
  });
  const up=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
  let previousAspect=0,previousFov=0;
  function layout(){
    const aspect=Number.isFinite(camera.aspect)&&camera.aspect>0?camera.aspect:16/9;
    const fov=camera.fov||74;
    if(aspect===previousAspect&&fov===previousFov)return;
    previousAspect=aspect;previousFov=fov;
    const tan=Math.tan(fov*Math.PI/360),portrait=Math.min(1,Math.max(.57,aspect/1.2));
    const wheelHalfWidth=.43*tan*aspect;
    wheel.position.set(-wheelHalfWidth*.22,-.285,-.43);wheel.scale.setScalar(portrait);
    instruments.group.position.set(-.60*tan*aspect*.22,-.225,-.60);instruments.group.scale.setScalar(portrait);
    centerDisplay.group.position.set(.56*tan*aspect*.50,-.308,-.56);centerDisplay.group.scale.setScalar(portrait);
    vents.position.set(.53*tan*aspect*.43,0,0);vents.scale.x=portrait;
    dashboard.scale.x=Math.max(1,aspect/2.2);dashboardTrim.scale.x=dashboard.scale.x;ambientStrip.scale.x=dashboard.scale.x;
    for(const {side,pillar,lining} of pillars){
      start.set(side*.55*tan*aspect*.99,-.34,-.55);
      end.set(side*1.15*tan*aspect*1.04,1.15*tan*.92,-1.15);
      direction.copy(end).sub(start);pillar.position.copy(start).add(end).multiplyScalar(.5);pillar.scale.y=direction.length();pillar.quaternion.setFromUnitVectors(up,direction.normalize());
      lining.position.copy(pillar.position);lining.position.x-=side*.012;lining.position.z+=.008;lining.scale.y=pillar.scale.y;lining.quaternion.copy(pillar.quaternion);
    }
  }

  let disposed=false;
  function update({speed=0,steer=0,braking=false,nightFactor=0}={}){
    if(disposed)return;layout();
    const kmh=Math.max(0,Math.round((Number.isFinite(speed)?speed:0)*3.6));
    const brakingNow=Boolean(braking),night=Math.max(0,Math.min(1,Number.isFinite(nightFactor)?nightFactor:0));
    wheel.rotation.set(-.08,0,-Math.max(-1,Math.min(1,Number.isFinite(steer)?steer:0))*.68);
    glow.opacity=.18+night*.42;
    if(kmh!==previousSpeed||brakingNow!==previousBrake||(night>.5)!==(previousNight>.5)){
      drawInstruments(kmh,brakingNow,night);previousSpeed=kmh;previousBrake=brakingNow;previousNight=night;
    }
  }
  function dispose(){
    if(disposed)return;disposed=true;root.removeFromParent();
    for(const geometry of geometries)geometry.dispose();for(const mat of materials)mat.dispose();for(const texture of textures)texture.dispose();
    root.clear();
  }
  update();
  return {root,update,dispose};
}
