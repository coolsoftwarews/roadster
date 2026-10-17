import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {TRACKS} from '../dist/tracks.js';
import {installTrackScenery} from '../dist/track-scenery.js';

function course(track){
  const curve=new THREE.CatmullRomCurve3(track.controls.map(p=>new THREE.Vector3(...p)),false,'centripetal');curve.arcLengthDivisions=2500;
  const length=curve.getLength(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const frame=s=>{const u=clamp(s/length,0,.99999),p=curve.getPointAt(u),t=curve.getTangentAt(u),a=curve.getTangentAt(clamp(u-.003,0,1)),b=curve.getTangentAt(clamp(u+.003,0,1));let diff=Math.atan2(b.x,b.z)-Math.atan2(a.x,a.z);while(diff>Math.PI)diff-=Math.PI*2;while(diff<-Math.PI)diff+=Math.PI*2;const curvature=diff/(length*.006);return {p,t,right:new THREE.Vector3(t.z,0,-t.x).normalize(),yaw:Math.atan2(t.x,t.z),curvature,bank:clamp(-curvature*6,-.11,.11)};};
  const samples=Array.from({length:351},(_,i)=>frame(length*i/350).p);
  const nearestTrack=(x,z)=>{let d=Infinity,y=0;for(const p of samples){const next=(x-p.x)**2+(z-p.z)**2;if(next<d){d=next;y=p.y;}}return {d:Math.sqrt(d),y};};
  const pointOn=(s,offset=0,height=0)=>{const f=frame(s);return f.p.clone().addScaledVector(f.right,offset).add(new THREE.Vector3(0,height+f.bank*offset,0));};
  return {frame,nearestTrack,pointOn,length};
}

for(const track of TRACKS){
  test(`${track.id}: scenery has finite geometry, bounded draw calls and working night lights`,()=>{
    const scene=new THREE.Scene(),root=installTrackScenery({scene,track,THREE,...course(track)});
    assert.equal(root.parent,scene);
    let drawCalls=0,triangles=0;const geometries=new Set(),materials=new Set(),textures=new Set();
    root.traverse(object=>{
      if(!object.isMesh)return;
      drawCalls++;geometries.add(object.geometry);
      triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
      for(const attr of Object.values(object.geometry.attributes))assert.ok(attr.array.every(Number.isFinite),'all vertices, normals, UVs and colors are finite');
      if(object.isInstancedMesh)assert.ok(object.instanceMatrix.array.every(Number.isFinite),'all instance transforms are finite');
      for(const material of Array.isArray(object.material)?object.material:[object.material]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
    });
    assert.ok(drawCalls>0&&drawCalls<65,`${drawCalls} scenery draw calls`);
    assert.ok(triangles<350000,`${Math.round(triangles)} scenery triangles`);
    root.userData.setNightIntensity(1);
    for(const light of root.userData.nightMaterials)assert.equal(light.material.emissiveIntensity,light.nightIntensity);
    root.userData.setNightIntensity(0);
    for(const light of root.userData.nightMaterials)assert.equal(light.material.emissiveIntensity,light.baseIntensity);
    const disposal={geometry:0,material:0,texture:0};
    for(const resource of geometries)resource.addEventListener('dispose',()=>disposal.geometry++);
    for(const resource of materials)resource.addEventListener('dispose',()=>disposal.material++);
    for(const resource of textures)resource.addEventListener('dispose',()=>disposal.texture++);
    root.userData.disposeScenery();
    assert.equal(root.parent,null);assert.equal(disposal.geometry,geometries.size);assert.equal(disposal.material,materials.size);assert.equal(disposal.texture,textures.size);
  });
}
