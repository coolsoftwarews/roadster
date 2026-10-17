import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';

// Tesla Roadster 2020 by metarex.4d, CC BY 4.0. See credits.html.
// Only this visual child changes; the outer car keeps the game's collision,
// flight, recovery and camera transforms.
const MODEL_URL = new URL('./assets/models/roadster.glb', import.meta.url).href;
const MOBILE_MODEL_URL = new URL('./assets/models/roadster-mobile.glb', import.meta.url).href;
const TARGET_LENGTH = 5.2;
const key = name => name.toLowerCase().replace(/[^a-z0-9]/g, '');

function preferredModelUrl() {
  const touchScreen = globalThis.matchMedia?.('(pointer: coarse)').matches;
  const smallScreen = globalThis.matchMedia?.('(max-width: 700px)').matches;
  const memory = globalThis.navigator?.deviceMemory;
  return touchScreen || smallScreen || (memory && memory <= 4) ? MOBILE_MODEL_URL : MODEL_URL;
}

function tuneMaterials(model, renderer) {
  const seen = new Set();
  model.traverse(mesh => {
    if (!mesh.isMesh) return;
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mesh.castShadow = !meshMaterials.every(m => m.name.toLowerCase() === 'glass_clear');
    mesh.receiveShadow = true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(material)) continue;
      seen.add(material);
      const name = material.name.toLowerCase();
      material.envMapIntensity = .85;
      if (name === 'car_main_paint') {
        material.side = THREE.FrontSide;
        material.color.set('#e5e9eb');
        material.metalness = .68;
        material.roughness = .22;
        material.clearcoat = 1;
        material.clearcoatRoughness = .13;
        if ('specularIntensity' in material) material.specularIntensity = 1;
      } else if (/glass_mid_tint|glass_tint_max/.test(name)) {
        // Tinted glazing needs no expensive scene transmission pass. The
        // reflective canopy is opaque; clear light covers remain transparent.
        material.color.set(name.includes('max') ? '#10202b' : '#1b303d');
        material.metalness = .35;
        material.roughness = .14;
        material.transparent = false;
        material.opacity = 1;
        material.depthWrite = true;
        material.transmission = 0;
        material.clearcoat = 1;
        material.clearcoatRoughness = .1;
      } else if (name === 'glass_clear') {
        material.transmission = 0;
        material.opacity = .14;
        material.transparent = true;
        material.depthWrite = false;
        material.roughness = .12;
      } else if (/thread|sidewall/.test(name)) {
        material.side = THREE.FrontSide;
        material.color.set('#41464a');
        material.metalness = 0;
        material.roughness = .85;
      } else if (/headlights_aho|headlights_main/.test(name)) {
        material.emissive.set('#d7ecff');
        material.emissiveIntensity = name.includes('aho') ? 2 : .65;
        material.roughness = .18;
      } else if (name === 'glass_rear_lights_dho') {
        material.emissive.set('#ff2414');
        material.emissiveIntensity = 1.3;
      } else if (name === 'glass_rear_lights_main') {
        material.emissive.set('#ee1811');
        material.emissiveIntensity = .3;
      } else if (name === 'mirror' || name === 'chrome') {
        material.metalness = .95;
        material.roughness = .16;
      } else if (name === 'rims') {
        material.side = THREE.FrontSide;
        material.color.set('#4c535b');
        material.metalness = .85;
        material.roughness = .27;
      }
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      }
      material.needsUpdate = true;
    }
  });
  return [...seen];
}

export async function loadDetailedRoadster(renderer, {url = preferredModelUrl()} = {}) {
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync(url);
  const source = gltf.scene;
  source.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(source);
  const size = bounds.getSize(new THREE.Vector3());
  if (!Number.isFinite(size.z) || size.z < .01) throw new Error('Invalid Roadster model bounds');
  const scale = TARGET_LENGTH / size.z;
  const center = bounds.getCenter(new THREE.Vector3());
  source.scale.multiplyScalar(scale);
  source.position.add(new THREE.Vector3(-center.x * scale, -bounds.min.y * scale + .025, -center.z * scale));
  const visual = new THREE.Group();
  visual.name = 'Detailed Roadster';
  visual.add(source);
  visual.updateMatrixWorld(true);
  const materials = tuneMaterials(source, renderer);
  const wheelRigs = [];
  // Store the references before attach() changes parentage. attach preserves
  // the nested exporter transforms and the wheel's original -90 degree roll.
  const named = new Map();
  source.traverse(node => named.set(key(node.name), node));
  for (const end of ['Ft', 'Bk']) for (const side of ['L', 'R']) {
    const wheel = named.get(key(`TR.DEF-Wheel.${end}.${side}`));
    const brake = named.get(key(`TR.DEF-WheelBrake.${end}.${side}`));
    if (!wheel) throw new Error(`Roadster wheel missing: ${end}.${side}`);
    const pivot = wheel.getWorldPosition(new THREE.Vector3());
    const wheelBox = new THREE.Box3().setFromObject(wheel);
    const radius = wheelBox.getSize(new THREE.Vector3()).y / 2;
    const steering = new THREE.Group();
    steering.position.copy(pivot);
    visual.add(steering);
    visual.updateMatrixWorld(true);
    steering.attach(wheel);
    if (brake) steering.attach(brake);
    wheelRigs.push({ wheel, steering, front: end === 'Ft', radius });
  }
  const brakeLights = materials.filter(m => m.name.toLowerCase() === 'glass_rear_lights_main');
  return {
    visual,
    update(dt, speed, steeringAngle = 0, braking = false) {
      for (const rig of wheelRigs) {
        rig.wheel.rotateX(speed * dt / Math.max(.1, rig.radius));
        if (rig.front) rig.steering.rotation.y = THREE.MathUtils.clamp(steeringAngle, -.3, .3);
      }
      for (const light of brakeLights) light.emissiveIntensity = braking ? 2.2 : .3;
    }
  };
}
