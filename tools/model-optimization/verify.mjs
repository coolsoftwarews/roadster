import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from '../../dist/vendor/meshopt_decoder.module.js';
import { PropertyBinding } from '../../dist/vendor/three.module.min.js';

// Decode with the exact file shipped to the browser, not the npm-package copy.
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const assetURL = process.argv[2] ? pathToFileURL(path.resolve(process.argv[2])) : new URL('../../dist/assets/models/roadster.glb', import.meta.url);
const buffer = await fs.readFile(assetURL);
const document = await io.readBinary(buffer);
const root = document.getRoot();
let decodedComponents = 0;
for (const accessor of root.listAccessors()) {
  const array = accessor.getArray();
  assert(array, 'Decoded accessor must contain an array');
  for (const value of array) assert(Number.isFinite(value), 'Decoded accessor contains a non-finite value');
  decodedComponents += array.length;
}
const wheels = root.listNodes().filter(node => /^TR\.DEF-Wheel\.(Ft|Bk)\.[LR]$/.test(node.getName()));
assert.equal(wheels.length, 4);
for (const wheel of wheels) assert.equal(wheel.getParentNode().getName(), 'RootNode');
assert.equal(root.getAsset().extras.license, 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)');
console.log(JSON.stringify({
  decoder: { supported: MeshoptDecoder.supported, syncAPI: typeof MeshoptDecoder.decodeGltfBuffer, asyncAPI: typeof MeshoptDecoder.decodeGltfBufferAsync },
  bytes: buffer.length,
  sha256: createHash('sha256').update(buffer).digest('hex'),
  decodedComponents,
  wheels: wheels.map(node => ({ original: node.getName(), threeName: PropertyBinding.sanitizeNodeName(node.getName()) })),
}, null, 2));
