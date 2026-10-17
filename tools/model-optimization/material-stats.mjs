import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]);
const stats = new Map();
for (const mesh of document.getRoot().listMeshes()) for(const primitive of mesh.listPrimitives()) {
  const material = primitive.getMaterial()?.getName();
  const triangles = (primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION').getCount()) / 3;
  stats.set(material, (stats.get(material)||0)+triangles);
}
console.log([...stats].sort((a,b)=>b[1]-a[1]));
