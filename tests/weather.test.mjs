import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../dist/vendor/three.module.min.js';
import {WEATHER_OPTIONS,normalizeWeather,resolveWeather,createWeather} from '../dist/weather.js';

test('weather choices normalize saved or URL values without accepting unsupported modes',()=>{
  assert.deepEqual(WEATHER_OPTIONS.map(mode=>mode.id),['auto','daylight','rainy','evening','sunrise','sundown']);
  assert.equal(normalizeWeather('  RAINY '),'rainy');
  for(const value of [undefined,null,{},'snow',''])assert.equal(normalizeWeather(value),'auto');
});

test('automatic atmosphere follows the selected local hour, including boundaries and overnight',()=>{
  for(const [hour,id] of [[0,'evening'],[4.99,'evening'],[5,'sunrise'],[7.99,'sunrise'],[8,'daylight'],[15.99,'daylight'],[16,'sundown'],[18.99,'sundown'],[19,'evening'],[23.99,'evening'],[29,'sunrise'],[-1,'evening']]) {
    assert.equal(resolveWeather('auto',{hour,random:()=>.5}).id,id,`hour ${hour}`);
  }
  assert.equal(resolveWeather('auto',{hour:NaN,random:()=>.5}).id,'daylight');
});

test('simulated rain is occasional and explicit choices are never overridden by the clock or random',()=>{
  assert.equal(resolveWeather('auto',{hour:12,random:()=>0}).id,'rainy');
  assert.equal(resolveWeather('auto',{hour:12,random:()=>.1799}).id,'rainy');
  assert.equal(resolveWeather('auto',{hour:12,random:()=>.18}).id,'daylight');
  for(const mode of WEATHER_OPTIONS.filter(mode=>mode.id!=='auto')) {
    const preset=resolveWeather(mode.id,{hour:0,random:()=>{throw new Error('Manual mode must not sample weather');}});
    assert.equal(preset.id,mode.id);assert.ok(preset.sunOffset.every(Number.isFinite));
    assert.ok(preset.nightFactor>=0&&preset.nightFactor<=1);
  }
});

function setup(){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#123456');scene.fog=new THREE.FogExp2('#789abc',.001);
  const sun=new THREE.DirectionalLight('#ffffff',2),hemisphere=new THREE.HemisphereLight('#ccccff','#887766',1.5);
  const skyMaterial=new THREE.ShaderMaterial({uniforms:{top:{value:new THREE.Color('#123456')},bottom:{value:new THREE.Color('#789abc')}}});
  const sunBall=new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshBasicMaterial({color:'#ffffcc'}));
  const asphalt=new THREE.MeshStandardMaterial({roughness:.91,metalness:0});
  const renderer={toneMappingExposure:1.02},camera=new THREE.PerspectiveCamera();
  scene.add(sun,hemisphere,sunBall);
  const baseline=scene.children.length;
  const controller=createWeather({THREE,scene,renderer,camera,sun,hemisphere,skyMaterial,sunBall,asphalt,theme:{sunIntensity:2.4}});
  return {scene,controller,asphalt,renderer,sun,baseline,skyMaterial,sunBall};
}

test('rain stays bounded during long drives, freezes on pause, and clears when another mode is selected',()=>{
  const {scene,controller,asphalt}=setup();
  controller.apply(resolveWeather('rainy'));
  const rain=scene.getObjectByName('weather-rain');const attribute=rain.geometry.attributes.position;
  const count=scene.children.length,initial=attribute.array.slice(),vertexCount=attribute.count;
  assert.ok(vertexCount>=2000&&vertexCount<=4000,'visible rain stays within a modest fixed particle budget');
  controller.update(0,new THREE.Vector3(150,12,260));
  assert.deepEqual(attribute.array,initial,'paused rain is unchanged');
  for(let i=0;i<2400;i++)controller.update(.1,new THREE.Vector3(i*4,12,i*6),new THREE.Vector3(.5,0,.5));
  assert.equal(attribute.count,vertexCount);assert.equal(scene.children.length,count);
  assert.ok(attribute.array.every(Number.isFinite));
  for(let i=0;i<attribute.array.length;i+=6){assert.ok(Math.abs(attribute.array[i])<=40);assert.ok(Math.abs(attribute.array[i+2])<=40);assert.ok(attribute.array[i+1]>=0&&attribute.array[i+1]<44);}
  assert.notDeepEqual(attribute.array,initial);assert.equal(rain.visible,true);assert.ok(asphalt.roughness<.5);
  controller.apply(resolveWeather('sunrise'));
  assert.equal(rain.visible,false);assert.ok(asphalt.roughness>.8);
  const frozen=attribute.array.slice();controller.update(1,new THREE.Vector3());assert.deepEqual(attribute.array,frozen);
  controller.dispose();
});

test('night lighting follows steering, preserves readable illumination, and disposes cleanly',()=>{
  const {scene,controller,sun,asphalt,renderer,baseline,skyMaterial,sunBall}=setup();
  controller.apply(resolveWeather('evening'));
  const light=scene.getObjectByName('weather-headlight-left');
  controller.update(.02,new THREE.Vector3(10,5,20),new THREE.Vector3(1,0,0));
  assert.ok(light.intensity>0);assert.equal(light.castShadow,false);
  assert.ok(light.target.position.x>light.position.x);assert.ok(light.target.position.y<light.position.y);
  assert.ok(sun.intensity>=1);assert.ok(renderer.toneMappingExposure>=1);
  assert.equal(sunBall.visible,true);
  controller.apply(resolveWeather('daylight'));assert.equal(light.intensity,0);assert.equal(sun.intensity,2.4);
  controller.dispose();controller.dispose();
  assert.equal(scene.children.length,baseline);assert.equal(asphalt.roughness,.91);assert.equal(asphalt.metalness,0);
  assert.equal(sun.intensity,2);assert.equal(scene.background.getHexString(),'123456');assert.equal(skyMaterial.uniforms.top.value.getHexString(),'123456');
});
