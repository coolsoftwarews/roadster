import fs from 'node:fs';
const file = process.argv[2];
const bin = fs.readFileSync(file);
const gltf = JSON.parse(bin.subarray(20, 20 + bin.readUInt32LE(12)).toString());
const parents = new Map();
for (let i=0;i<(gltf.nodes||[]).length;i++) for (const c of gltf.nodes[i].children||[]) parents.set(c,i);
let triangles=0;
for (const mesh of gltf.meshes||[]) for(const p of mesh.primitives) triangles += (p.indices !== undefined ? gltf.accessors[p.indices].count : gltf.accessors[p.attributes.POSITION].count)/3;
console.log(JSON.stringify({file, bytes:bin.length,asset:gltf.asset,extensionsUsed:gltf.extensionsUsed,extensionsRequired:gltf.extensionsRequired,triangles,nodeCount:gltf.nodes?.length,meshCount:gltf.meshes?.length,materialCount:gltf.materials?.length,nodes:gltf.nodes?.map((n,i)=>({i,parent:parents.get(i),...n})).filter(n=>/^TR\.DEF-Wheel\.(Ft|Bk)\.[LR]$/.test(n.name||'')),images:gltf.images?.map(im=>({...im,bytes:gltf.bufferViews[im.bufferView]?.byteLength})),animations:gltf.animations?.map(a=>({name:a.name,channels:a.channels.length}))},null,2));
