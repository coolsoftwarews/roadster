import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from '../../dist/vendor/meshopt_decoder.module.js';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const [source, output] = await Promise.all([io.read(process.argv[2]), io.read(process.argv[3])]);
const outputByName = new Map(output.getRoot().listMeshes().map(mesh => [mesh.getName(), mesh]));
const preserve = new Set(['car_main_paint', 'Glass_mid_tint']);
let meshes = 0, triangles = 0;
for (const mesh of source.getRoot().listMeshes()) {
  for (const [index, original] of mesh.listPrimitives().entries()) {
    if (!preserve.has(original.getMaterial()?.getName())) continue;
    const actual = outputByName.get(mesh.getName()).listPrimitives()[index];
    assert.equal(actual.getIndices().getCount(), original.getIndices().getCount(), mesh.getName());
    for (const attributeName of ['POSITION', 'NORMAL', 'TANGENT']) {
      const src = original.getAttribute(attributeName);
      const dst = actual.getAttribute(attributeName);
      if (!src) { assert(!dst); continue; }
      assert.equal(dst.getComponentType(), 5126, `${mesh.getName()} ${attributeName} must remain float32`);
      assert.equal(dst.getNormalized(), false);
      assert.deepEqual(vertexSet(dst), vertexSet(src), `${mesh.getName()} ${attributeName} values changed`);
    }
    meshes++;
    triangles += actual.getIndices().getCount() / 3;
  }
}
console.log(JSON.stringify({ preservedMeshes: meshes, preservedTriangles: triangles, checks: 'Original POSITION, NORMAL and TANGENT float32 values preserved exactly (ignoring vertex reordering and identical-vertex welding)' },null,2));
function vertexSet(accessor) {
  const values = accessor.getArray();
  const size = accessor.getElementSize();
  const output = new Set();
  for(let i=0;i<values.length;i+=size) output.add(Array.from(values.subarray(i,i+size)).join(','));
  return [...output].sort();
}
