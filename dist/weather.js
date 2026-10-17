// Simulated atmosphere: no location permission, forecast service, or physics changes.
const modes = [
  {id:'auto',name:'Auto'},
  {id:'daylight',name:'Daylight'},
  {id:'rainy',name:'Rainy'},
  {id:'evening',name:'Evening'},
  {id:'sunrise',name:'Sunrise'},
  {id:'sundown',name:'Sundown'},
];
export const WEATHER_OPTIONS = Object.freeze(modes.map(mode=>Object.freeze(mode)));

const settings = {
  daylight: {sunOffset:[-110,145,70],sunColor:null,sunIntensity:null,skyTop:null,skyBottom:null,fog:null,fogDensity:.00145,hemisphereSky:'#dbeaff',hemisphereGround:null,hemisphereIntensity:1.65,exposure:1.02,roadRoughness:.91,roadMetalness:0,nightFactor:0,rain:false,diskColor:'#fff1cf',diskSize:1},
  rainy: {sunOffset:[-65,145,95],sunColor:'#c7d8e6',sunIntensity:.85,skyTop:'#455b70',skyBottom:'#b0c2cc',fog:'#9aafb9',fogDensity:.0026,hemisphereSky:'#c4d5e5',hemisphereGround:'#58605f',hemisphereIntensity:1.8,exposure:1.02,roadRoughness:.33,roadMetalness:.16,nightFactor:.4,rain:true,diskColor:'#dce6ec',diskSize:1},
  evening: {sunOffset:[-145,65,-100],sunColor:'#a3b9eb',sunIntensity:1.05,skyTop:'#202d55',skyBottom:'#b37b91',fog:'#7b829f',fogDensity:.0017,hemisphereSky:'#adc1eb',hemisphereGround:'#6b6375',hemisphereIntensity:1.35,exposure:1.05,roadRoughness:.86,roadMetalness:0,nightFactor:1,rain:false,diskColor:'#e2e8ff',diskSize:.7},
  sunrise: {sunOffset:[130,55,100],sunColor:'#ffd0a3',sunIntensity:2.0,skyTop:'#829ebe',skyBottom:'#f5b88b',fog:'#cbb5aa',fogDensity:.00155,hemisphereSky:'#c6d7ed',hemisphereGround:'#8a746b',hemisphereIntensity:1.5,exposure:1.05,roadRoughness:.86,roadMetalness:0,nightFactor:.22,rain:false,diskColor:'#ffe2a8',diskSize:1.2},
  sundown: {sunOffset:[-155,48,80],sunColor:'#ffba7d',sunIntensity:2.2,skyTop:'#656c9d',skyBottom:'#f3a16e',fog:'#bc9293',fogDensity:.0016,hemisphereSky:'#b6c3e9',hemisphereGround:'#8b6972',hemisphereIntensity:1.5,exposure:1.02,roadRoughness:.85,roadMetalness:0,nightFactor:.58,rain:false,diskColor:'#ffd79b',diskSize:1.3},
};
const presets = Object.freeze(Object.fromEntries(WEATHER_OPTIONS.filter(mode=>mode.id!=='auto').map(mode=>[
  mode.id,Object.freeze({...mode,...settings[mode.id],sunOffset:Object.freeze(settings[mode.id].sunOffset)}),
])));

export function normalizeWeather(id) {
  const normalized = typeof id==='string' ? id.trim().toLowerCase() : 'auto';
  return WEATHER_OPTIONS.some(option=>option.id===normalized) ? normalized : 'auto';
}

/** Auto is resolved once per selection/run, not on every animation frame. */
export function resolveWeather(id, {hour=new Date().getHours(),random=Math.random}={}) {
  let mode=normalizeWeather(id);
  if(mode==='auto') {
    const localHour=Number.isFinite(hour) ? ((hour%24)+24)%24 : 12;
    const roll=typeof random==='function' ? random() : .5;
    mode=Number.isFinite(roll)&&roll>=0&&roll<.18 ? 'rainy'
      : localHour>=5&&localHour<8 ? 'sunrise'
      : localHour>=8&&localHour<16 ? 'daylight'
      : localHour>=16&&localHour<19 ? 'sundown' : 'evening';
  }
  return presets[mode];
}

/**
 * apply(preset) adjusts atmosphere immediately and returns the applied preset.
 * The caller owns the shadow sun's position: player position + preset.sunOffset.
 * update(dt, playerPosition, forward?) animates rain and follows the car with
 * shadow-free headlights. Pass dt=0 while paused; the rain then stays still.
 * The optional forward vector is the car's world heading, defaulting to +Z.
 */
export function createWeather({THREE,scene,renderer,camera,sun,hemisphere,skyMaterial,sunBall,asphalt,theme={}}) {
  const original={
    background:scene.background?.clone?.()??scene.background,
    fog:scene.fog?.clone?.()??scene.fog,
    exposure:renderer.toneMappingExposure,
    sunColor:sun.color.clone(),sunIntensity:sun.intensity,
    hemisphereSky:hemisphere.color.clone(),hemisphereGround:hemisphere.groundColor.clone(),hemisphereIntensity:hemisphere.intensity,
    top:skyMaterial.uniforms.top.value.clone(),bottom:skyMaterial.uniforms.bottom.value.clone(),
    diskColor:sunBall.material.color.clone(),diskVisible:sunBall.visible,diskScale:sunBall.scale.clone(),diskPosition:sunBall.position.clone(),
    roadRoughness:asphalt.roughness,roadMetalness:asphalt.metalness,
  };
  let active=presets.daylight,disposed=false;

  // One fixed allocation and draw call; wrapping drops never adds scene nodes.
  const dropCount=1400,span=76,ceiling=44;
  const positions=new Float32Array(dropCount*6);
  const velocities=new Float32Array(dropCount);
  let seed=0x72b53;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<dropCount;i++) {
    const k=i*6;
    positions[k]=(random()-.5)*span;positions[k+1]=random()*ceiling;positions[k+2]=(random()-.5)*span;
    velocities[i]=28+random()*18;
    positions[k+3]=positions[k]-.24;positions[k+4]=positions[k+1]-1.8;positions[k+5]=positions[k+2]-.13;
  }
  const rainGeometry=new THREE.BufferGeometry();
  const rainPosition=new THREE.BufferAttribute(positions,3).setUsage(THREE.DynamicDrawUsage);
  rainGeometry.setAttribute('position',rainPosition);
  const rainMaterial=new THREE.LineBasicMaterial({color:'#d5e5f2',transparent:true,opacity:.55,depthWrite:false});
  const rain=new THREE.LineSegments(rainGeometry,rainMaterial);
  rain.name='weather-rain';rain.visible=false;rain.frustumCulled=false;rain.renderOrder=2;scene.add(rain);

  const headlights=[-1,1].map(side=>{
    const light=new THREE.SpotLight('#d6e8ff',0,72,.38,.72,1.4);
    light.name='weather-headlight-'+(side<0?'left':'right');light.castShadow=false;
    scene.add(light,light.target);return {side,light};
  });
  const heading=new THREE.Vector3(0,0,1),right=new THREE.Vector3(1,0,0),diskDirection=new THREE.Vector3();
  const fallbackPosition=new THREE.Vector3();

  function apply(preset) {
    if(disposed)return active;
    active=typeof preset==='string' ? resolveWeather(preset) : presets[preset?.id]??presets.daylight;
    const top=active.skyTop??theme.skyTop??original.top;
    const bottom=active.skyBottom??theme.skyBottom??original.bottom;
    skyMaterial.uniforms.top.value.set(top);skyMaterial.uniforms.bottom.value.set(bottom);
    if(scene.background?.isColor)scene.background.set(top);
    if(!scene.fog)scene.fog=new THREE.FogExp2(active.fog??theme.fog??bottom,active.fogDensity);
    scene.fog.color.set(active.fog??theme.fog??bottom);
    if(scene.fog.isFogExp2)scene.fog.density=active.fogDensity;
    sun.color.set(active.sunColor??theme.sunColor??original.sunColor);
    sun.intensity=active.sunIntensity??theme.sunIntensity??original.sunIntensity;
    hemisphere.color.set(active.hemisphereSky);
    hemisphere.groundColor.set(active.hemisphereGround??theme.hemisphereGround??original.hemisphereGround);
    hemisphere.intensity=active.hemisphereIntensity;
    renderer.toneMappingExposure=active.exposure;
    asphalt.roughness=active.roadRoughness;asphalt.metalness=active.roadMetalness;
    sunBall.visible=!active.rain;sunBall.material.color.set(active.diskColor);
    sunBall.scale.copy(original.diskScale).multiplyScalar(active.diskSize);
    diskDirection.fromArray(active.sunOffset).normalize().multiplyScalar(1100);
    rain.visible=active.rain;
    for(const {light} of headlights)light.intensity=active.nightFactor*115;
    return active;
  }

  function update(dt,position=fallbackPosition,forward) {
    if(disposed)return;
    const elapsed=Number.isFinite(dt) ? Math.max(0,Math.min(dt,.1)) : 0;
    if(forward&&Number.isFinite(forward.x)&&Number.isFinite(forward.z)&&Math.hypot(forward.x,forward.z)>.0001)heading.set(forward.x,0,forward.z).normalize();
    right.set(heading.z,0,-heading.x);
    sunBall.position.copy(camera.position).add(diskDirection);
    for(const {side,light} of headlights) {
      light.position.copy(position).addScaledVector(heading,2.2).addScaledVector(right,side*.72);light.position.y+=.8;
      light.target.position.copy(position).addScaledVector(heading,32).addScaledVector(right,side*2.1);light.target.position.y-=.25;
    }
    if(!active.rain)return;
    // Rain volume follows the player without drifting away over a long run.
    rain.position.copy(position);rain.position.y-=3;
    if(elapsed===0)return;
    for(let i=0;i<dropCount;i++) {
      const k=i*6;
      positions[k]-=elapsed*5;positions[k+1]-=elapsed*velocities[i];positions[k+2]-=elapsed*2.6;
      if(positions[k+1]<0)positions[k+1]+=ceiling;
      if(positions[k]<-span*.5)positions[k]+=span;
      if(positions[k+2]<-span*.5)positions[k+2]+=span;
      positions[k+3]=positions[k]-.24;positions[k+4]=positions[k+1]-1.8;positions[k+5]=positions[k+2]-.13;
    }
    rainPosition.needsUpdate=true;
  }

  function dispose() {
    if(disposed)return;disposed=true;
    scene.remove(rain);rainGeometry.dispose();rainMaterial.dispose();
    for(const {light} of headlights){scene.remove(light,light.target);light.dispose();}
    scene.background=original.background;scene.fog=original.fog;renderer.toneMappingExposure=original.exposure;
    sun.color.copy(original.sunColor);sun.intensity=original.sunIntensity;
    hemisphere.color.copy(original.hemisphereSky);hemisphere.groundColor.copy(original.hemisphereGround);hemisphere.intensity=original.hemisphereIntensity;
    skyMaterial.uniforms.top.value.copy(original.top);skyMaterial.uniforms.bottom.value.copy(original.bottom);
    sunBall.visible=original.diskVisible;sunBall.material.color.copy(original.diskColor);sunBall.scale.copy(original.diskScale);sunBall.position.copy(original.diskPosition);
    asphalt.roughness=original.roadRoughness;asphalt.metalness=original.roadMetalness;
  }

  apply(active);
  return {apply,update,dispose,get preset(){return active;}};
}
