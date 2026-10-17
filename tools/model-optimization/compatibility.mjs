import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {getBounds,listTextureSlots} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';

// Decode at build time so this alternate asset needs neither WebAssembly nor
// WebP in the browser. Keep the desktop model's smooth body geometry exactly.
const here=path.dirname(fileURLToPath(import.meta.url));
const input=path.resolve(process.argv[2]||path.join(here,'../../dist/assets/models/roadster.glb'));
const output=path.resolve(process.argv[3]||path.join(here,'../../dist/assets/models/roadster-compatible.glb'));
if(input===output)throw new Error('The source model must not be overwritten.');
await MeshoptDecoder.ready;
const reader=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const document=await reader.read(input),root=document.getRoot();
const hierarchy=describeHierarchy(root);
const textureReport=[];
for(const texture of root.listTextures()){
  const image=texture.getImage();if(!image)continue;
  const before=texture.getSize(),slots=listTextureSlots(texture);
  const dataTexture=slots.some(slot=>/normal|occlusion|metallic|roughness/i.test(slot));
  const isOpaque=(await sharp(image).stats()).isOpaque;
  // Linear-channel maps and transparency are lossless; only opaque color maps
  // use JPEG. All source dimensions are retained (desktop maximum 1024px).
  const png=dataTexture||!isOpaque;
  const converted=await (png?sharp(image).png({compressionLevel:9}):sharp(image).jpeg({quality:94,chromaSubsampling:'4:4:4'})).toBuffer();
  texture.setImage(converted).setMimeType(png?'image/png':'image/jpeg').setURI('');
  textureReport.push({name:texture.getName(),slots,size:before,mime:texture.getMimeType(),bytes:converted.byteLength,lossless:png});
}
for(const extension of root.listExtensionsUsed()){
  if(['EXT_meshopt_compression','EXT_texture_webp'].includes(extension.extensionName))extension.dispose();
}
const asset=root.getAsset();asset.extras={...asset.extras,compatibility:'Derived from the detailed desktop model. Meshopt decompressed without changing any vertex attributes, indices, named nodes or materials. Texture dimensions retained; PNG for linear-channel/transparent maps and JPEG quality 94 for opaque color maps. Browser loading requires neither WebAssembly nor WebP.'};
// The writer and roundtrip reader intentionally have no Meshopt dependency.
const portableIO=new NodeIO().registerExtensions(ALL_EXTENSIONS);
await fs.mkdir(path.dirname(output),{recursive:true});
await portableIO.write(output,document);
const check=await portableIO.read(output),checkedRoot=check.getRoot();
if(JSON.stringify(describeHierarchy(checkedRoot))!==JSON.stringify(hierarchy))throw new Error('Named hierarchy changed.');
const originalMeshes=root.listMeshes(),checkedMeshes=checkedRoot.listMeshes();
if(originalMeshes.length!==checkedMeshes.length)throw new Error('Mesh count changed.');
let triangles=0,checkedComponents=0;
for(let meshIndex=0;meshIndex<originalMeshes.length;meshIndex++){
  const before=originalMeshes[meshIndex],after=checkedMeshes[meshIndex];
  if(before.getName()!==after.getName())throw new Error('Mesh name changed.');
  const primitives=before.listPrimitives(),roundtrip=after.listPrimitives();
  if(primitives.length!==roundtrip.length)throw new Error('Primitive count changed.');
  for(let p=0;p<primitives.length;p++){
    const a=primitives[p],b=roundtrip[p];
    if(a.getMaterial()?.getName()!==b.getMaterial()?.getName())throw new Error('Material binding changed.');
    triangles+=(a.getIndices()?.getCount()??a.getAttribute('POSITION').getCount())/3;
    for(const semantic of a.listSemantics())checkedComponents+=equalAccessor(a.getAttribute(semantic),b.getAttribute(semantic),`${before.getName()}/${semantic}`);
    if(a.getIndices())checkedComponents+=equalAccessor(a.getIndices(),b.getIndices(),`${before.getName()}/indices`);
  }
}
const required=checkedRoot.listExtensionsRequired().map(extension=>extension.extensionName);
if(required.some(name=>/meshopt|webp|draco|basisu/i.test(name)))throw new Error('Unexpected compressed format remains required.');
if(checkedRoot.listTextures().some(texture=>!['image/png','image/jpeg'].includes(texture.getMimeType())))throw new Error('Unexpected texture format remains.');
const report={source:path.basename(input),output:path.basename(output),bytes:(await fs.stat(output)).size,triangles,nodeCount:checkedRoot.listNodes().length,meshCount:checkedMeshes.length,materialCount:checkedRoot.listMaterials().length,requiredExtensions:required,usedExtensions:checkedRoot.listExtensionsUsed().map(extension=>extension.extensionName),bounds:getBounds(checkedRoot.listScenes()[0]),checkedComponents,textures:textureReport};
await fs.writeFile(path.join(here,'roadster-compatible-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));

function describeHierarchy(root){return root.listNodes().map(node=>({name:node.getName(),parent:node.getParentNode()?.getName()??null,translation:node.getTranslation(),rotation:node.getRotation(),scale:node.getScale()}));}
function equalAccessor(a,b,label){
  if(!b||a.getComponentType()!==b.getComponentType()||a.getType()!==b.getType()||a.getCount()!==b.getCount())throw new Error(`Accessor changed: ${label}`);
  const first=a.getArray(),second=b.getArray();
  if(!Buffer.from(first.buffer,first.byteOffset,first.byteLength).equals(Buffer.from(second.buffer,second.byteOffset,second.byteLength)))throw new Error(`Geometry changed: ${label}`);
  if(!second.every(Number.isFinite))throw new Error(`Nonfinite attribute: ${label}`);
  return second.length;
}
