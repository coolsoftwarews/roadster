import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { getBounds, reorder, simplifyPrimitive, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

// Keep every named node and its parent relationship. In particular, wheel pivots
// must remain separate from the body so the runtime can steer and roll them.
const here = path.dirname(fileURLToPath(import.meta.url));
const input = process.argv[2];
if (!input) throw new Error('Usage: node optimize.mjs <source.glb> [destination.glb] [ratio=0.10] [error=0.005] [desktop|mobile]');
const output = process.argv[3] || path.resolve(here, '../../dist/assets/models/roadster.glb');
if (path.resolve(input) === path.resolve(output)) throw new Error('The source must not be overwritten.');
const ratio = Number(process.argv[4] || 0.10);
const error = Number(process.argv[5] || 0.005);
const profile = process.argv[6] || 'desktop';
if (!['desktop','mobile'].includes(profile)) throw new Error('Unknown optimization profile');
const textureMax = profile === 'mobile' ? 512 : 1024;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder,
  'meshopt.decoder': MeshoptDecoder,
});
const document = await io.read(input);
const originalNodes = document.getRoot().listNodes().map(node => ({ node, name: node.getName(), parent: node.getParentNode() }));
const baseline = await summarize(document, input);
console.log(`Source: ${baseline.bytes} bytes, ${baseline.triangles} triangles, ${baseline.nodeCount} nodes`);
// Glossy large body panels reveal interpolation changes caused by aggressive
// decimation. Keep their original triangles, normals and tangent frames.
const preserveMaterials = new Set(['car_main_paint', 'Glass_mid_tint']);
await document.transform(weld());
for (const mesh of document.getRoot().listMeshes()) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial()?.getName() || '';
    if (preserveMaterials.has(material) && profile === 'desktop') continue;
    const glass = material.startsWith('Glass');
    const bodySurface = preserveMaterials.has(material);
    simplifyPrimitive(primitive, {
      simplifier: MeshoptSimplifier,
      ratio: bodySurface ? 0.5 : glass ? 0.25 : ratio,
      error: bodySurface ? 0.0003 : glass ? 0.0005 : error,
    });
  }
}
// This micro-scale flake map is repeated 20 times on the paint and its strength
// is below 0.03. 512px avoids a 2MB noise texture without changing body normals.
const paintNormal = document.getRoot().listMaterials().find(material => material.getName() === 'car_main_paint')?.getNormalTexture();
paintNormal?.setName('roadster-paint-flake-normal');
await document.transform(
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], pattern: /^roadster-paint-flake-normal$/, lossless: true, effort: 80 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureMax, textureMax], pattern: /^(?!roadster-paint-flake-normal$)/, slots: /normalTexture/, lossless: true, effort: 80 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [textureMax, textureMax], slots: /^(?!normalTexture).*$/, quality: 85, effort: 80 }),
  reorder({ encoder: MeshoptEncoder, target: 'size' }),
);
// Avoid the meshopt() convenience transform: its 'high' mode applies lossy
// 8-bit octahedral normal filtering, which produces visible highlight wobble.
// QUANTIZE without a quantize() transform is lossless compression of the
// existing float32 attributes. No parent/mesh quantization transforms are added.
document.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
  method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
});
for (const { node, name, parent } of originalNodes) {
  if (node.isDisposed() || node.getName() !== name || node.getParentNode() !== parent) {
    throw new Error(`Hierarchy changed at ${name}`);
  }
}
const asset = document.getRoot().getAsset();
asset.extras = {
  ...asset.extras,
  modifications: `${profile === 'desktop' ? 'Secondary geometry simplified; original painted body and main glass topology preserved.' : 'Secondary geometry simplified, with conservative simplification of body/main glass capped at 0.03% relative error.'} Vertex attributes losslessly compressed with Meshopt, preserving full-precision authored normals and positions of retained vertices. Textures resized to at most ${textureMax}px (paint flake map 512px) and converted to WebP. Original named hierarchy and materials retained.`,
};
await fs.mkdir(path.dirname(output), { recursive: true });
await io.write(output, document);
const finalDocument = await io.read(output);
const result = await summarize(finalDocument, output);
if (result.wheels.length !== 4) throw new Error('Expected four independent wheel groups.');
if (result.nodeCount !== baseline.nodeCount) throw new Error('Node count changed in roundtrip.');
if (result.textures.some(texture => Math.max(...texture.size) > textureMax)) throw new Error(`Texture exceeds ${textureMax}px limit.`);
const report = { input: baseline, output: result, settings: { profile, ratio, error, preservedMaterials: profile === 'desktop' ? [...preserveMaterials] : [], mainSurfaces: profile === 'mobile' ? { ratio: 0.5, error: 0.0003 } : 'preserved', otherGlass: { ratio: 0.25, error: 0.0005 }, geometryCompression: 'lossless Meshopt, no quantization or filtering', textureMax, paintNormalMax: 512, normalTextureCompression: 'lossless WebP', otherTextureQuality: 85 } };
const reportPath = path.join(here, path.basename(output) === 'roadster.glb' ? 'optimization-report.json' : `${path.basename(output, '.glb')}-report.json`);
await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ bytes: result.bytes, triangles: result.triangles, nodeCount: result.nodeCount, materialCount: result.materialCount, bounds: result.bounds, requiredExtensions: result.requiredExtensions, report: reportPath }, null, 2));

async function summarize(doc, file) {
  const root = doc.getRoot();
  const wheelPattern = /^TR\.DEF-Wheel\.(Ft|Bk)\.[LR]$/;
  const wheels = root.listNodes().filter(node => wheelPattern.test(node.getName())).map(node => ({
    name: node.getName(),
    parent: node.getParentNode()?.getName(),
    translation: node.getTranslation(),
    rotation: node.getRotation(),
    scale: node.getScale(),
    worldMatrix: node.getWorldMatrix(),
    bounds: getBounds(node),
    children: node.listChildren().map(child => child.getName()),
  }));
  const meshes = root.listMeshes().map(mesh => ({ name: mesh.getName(), triangles: mesh.listPrimitives().reduce((sum, prim) => sum + (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3, 0) }));
  return {
    file: path.basename(file),
    bytes: (await fs.stat(file)).size,
    triangles: meshes.reduce((sum, mesh) => sum + mesh.triangles, 0),
    nodeCount: root.listNodes().length,
    meshCount: meshes.length,
    materialCount: root.listMaterials().length,
    materials: root.listMaterials().map(material => material.getName()),
    bounds: getBounds(root.listScenes()[0]),
    wheels,
    textures: root.listTextures().map(texture => ({ name: texture.getName(), mime: texture.getMimeType(), size: texture.getSize(), bytes: texture.getImage()?.byteLength })),
    extensions: root.listExtensionsUsed().map(extension => extension.extensionName),
    requiredExtensions: root.listExtensionsRequired().map(extension => extension.extensionName),
    asset: root.getAsset(),
    largestMeshes: meshes.sort((a,b) => b.triangles - a.triangles).slice(0,15),
  };
}
