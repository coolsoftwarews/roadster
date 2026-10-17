// Small deterministic texture tiles shared by every building/tree in a scene.
// DataTexture keeps generation independent of the DOM and avoids image downloads.
export function createScenerySurfaces(THREE){
  const textures=[];
  const clamp=(v,a=0,b=255)=>Math.max(a,Math.min(b,v));
  const noise=(x,y,salt=0)=>{let n=Math.imul(x+salt,374761393)+Math.imul(y-salt,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
  function cloud(x,y,cells,salt){
    const gx=x/128*cells,gy=y/128*cells,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
    const sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),sample=(dx,dy)=>noise((ix+dx)%cells,(iy+dy)%cells,salt);
    const a=sample(0,0)*(1-sx)+sample(1,0)*sx,b=sample(0,1)*(1-sx)+sample(1,1)*sx;return a*(1-sy)+b*sy;
  }
  function tile(w,h,pixel,{repeat=[1,1],linear=false}={}){
    const data=new Uint8Array(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const sample=pixel(x,y),i=(y*w+x)*4;
      data[i]=clamp(sample[0]);data[i+1]=clamp(sample[1]??sample[0]);data[i+2]=clamp(sample[2]??sample[0]);data[i+3]=255;
    }
    const texture=new THREE.DataTexture(data,w,h,THREE.RGBAFormat);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps=true;texture.anisotropy=4;texture.repeat.set(...repeat);texture.colorSpace=linear?THREE.NoColorSpace:THREE.SRGBColorSpace;texture.needsUpdate=true;textures.push(texture);return texture;
  }
  const plaster=tile(256,256,(x,y)=>{
    const grain=(noise(x,y)-.5)*16,stain=Math.sin(x*.18)*Math.sin(x*.047+y*.016)*3;
    return [238+grain+stain,237+grain+stain,233+grain+stain];
  },{repeat:[3,3]});
  const stone=tile(256,256,(x,y)=>{
    const row=Math.floor(y/32),seam=y%32<1||(x+(row%2)*32)%64<1;
    const v=seam?185:231+(noise(x,y,91)-.5)*22+noise(Math.floor((x+(row%2)*32)/64),row,7)*8;
    return [v,v-2,v-5];
  },{repeat:[3,4]});
  const bark=tile(128,128,(x,y)=>{
    const groove=Math.sin(x*.61+Math.sin(y*.05)*.8)*Math.sin(x*.14),ring=y%16<2?-17:0;
    const v=218+groove*22+(noise(x,y,31)-.5)*20+ring;return [v,v-4,v-10];
  },{repeat:[2,3]});
  const foliage=tile(128,128,(x,y)=>{
    // Uneven leaf masses at independent scales avoid grid/diamond motifs when
    // wrapped around a canopy. Gentle albedo variation needs no bump map.
    const v=225+(cloud(x,y,7,41)-.5)*24+(cloud(x,y,23,83)-.5)*16+(noise(x,y,53)-.5)*5;
    return [v,v,v-3];
  });
  const palm=tile(128,128,(x,y)=>{
    const rib=Math.abs(Math.sin((x-64)*.9+y*.11)),center=Math.exp(-(((x-64)/5)**2))*24;
    const v=202+rib*33+center+(noise(x,y,3)-.5)*8;return [v-8,v,v-12];
  });
  const glass=tile(256,64,(x,y)=>{
    const pane=Math.floor(x/32),edge=x%32<2||x%32>29||y<2||y>61;
    if(edge)return [75,83,86];
    const variation=noise(pane,0,145),reflection=20*Math.sin(y*.055+pane*.7)+7*Math.sin(x*.038+y*.032);
    const v=181+variation*51+reflection;
    return [v-15,v-2,v+7];
  });
  const glassRoughness=tile(256,64,(x,y)=>{
    const pane=Math.floor(x/32),edge=x%32<2||x%32>29||y<2||y>61;return [edge?220:95+noise(pane,0,17)*87];
  },{linear:true});
  const roof=tile(128,128,(x,y)=>{
    const row=Math.floor(y/16),seam=y%16<2||(x+(row%2)*8)%16<1;
    const v=(seam?155:226)+(noise(x,y,76)-.5)*24;return [v,v-4,v-8];
  },{repeat:[4,4]});
  const sand=tile(256,256,(x,y)=>{
    const ripple=Math.sin(y*.15+Math.sin(x*.03)*2)*5,v=235+(noise(x,y,9)-.5)*20+ripple;
    return [v,v-2,v-8];
  },{repeat:[4,4]});
  const grass=tile(128,128,(x,y)=>{
    const v=216+Math.sin(x*.15)*Math.cos(y*.1)*13+(noise(x,y,29)-.5)*28;return [v-4,v,v-7];
  },{repeat:[6,6]});
  // Tileable, crossed wave frequencies produce subtle moving normal detail.
  const waterNormal=tile(128,128,(x,y)=>{
    const u=x/128*Math.PI*2,v=y/128*Math.PI*2;
    const dx=.23*Math.cos(u*5+v*2)+.13*Math.cos(u*11-v*7)+.055*Math.cos(u*23+v*17);
    const dy=.09*Math.cos(u*5+v*2)-.18*Math.cos(u*11-v*7)+.06*Math.cos(u*23+v*17);
    const inv=1/Math.hypot(dx,dy,1);return [(dx*inv*.5+.5)*255,(dy*inv*.5+.5)*255,(inv*.5+.5)*255];
  },{linear:true});
  function waterMaterial(color){
    const clock={value:0};
    const mat=new THREE.MeshStandardMaterial({color,vertexColors:true,normalMap:waterNormal,normalScale:new THREE.Vector2(.6,.6),roughness:.24,metalness:.1,envMapIntensity:1.05});
    mat.userData.waveClock=clock;
    mat.onBeforeCompile=shader=>{
      shader.uniforms.sceneryWaveTime=clock;
      shader.fragmentShader='uniform float sceneryWaveTime;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('vNormalMapUv','(vNormalMapUv + vec2(sceneryWaveTime * .006, sceneryWaveTime * .003))'));
    };
    mat.customProgramCacheKey=()=>'roadster-water-ripples-1';
    return mat;
  }
  return {plaster,stone,bark,foliage,palm,glass,glassRoughness,roof,sand,grass,waterNormal,waterMaterial,textures,dispose(){for(const texture of textures)texture.dispose();}};
}
