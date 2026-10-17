# Roadster model preparation

The primary assets are `dist/assets/models/roadster.glb` (desktop) and `roadster-mobile.glb`. `roadster-compatible.glb` provides the desktop geometry without browser compression requirements. Their original is a user-provided download and is deliberately not committed to this repository.

## Reproduce

From this directory:

```powershell
npm.cmd ci
node optimize.mjs 'C:\path\to\tesla_roadster_2020.glb'
node optimize.mjs 'C:\path\to\tesla_roadster_2020.glb' '../../dist/assets/models/roadster-mobile.glb' 0.10 0.005 mobile
node verify.mjs
node verify.mjs '../../dist/assets/models/roadster-mobile.glb'
node verify-preserved-surfaces.mjs 'C:\path\to\tesla_roadster_2020.glb' '../../dist/assets/models/roadster.glb'
node compatibility.mjs
```

Optional arguments are destination path, secondary-part triangle target ratio (default `0.10`), relative simplification error limit (default `0.005`), and profile (`desktop` by default, or `mobile`). Mesh boundaries and error limits prevent the requested ratios from being achieved on every primitive. The script verifies all original named nodes and parent relationships remain unchanged, decodes the result, and writes `optimization-report.json` or the named variant's report.

No flattening, mesh joining, node pruning, or material merging is performed. Optimization uses the first full-quality user-provided source. The alternative `tesla_roadster_2020 (3).glb` contains the same 608,850 triangles and hierarchy with smaller textures, so it provides no additional geometry benefit.

## Result

| | Original | Desktop | Mobile |
| --- | ---: | ---: | ---: |
| File bytes | 40,189,748 | 7,479,480 | 5,471,248 |
| Triangles | 608,850 | 274,200 | 180,811 |
| Nodes | 193 | 193 | 193 |
| Mesh primitives | 105 | 105 | 105 |
| Materials | 26 | 26 | 26 |

Desktop preserves the original topology for painted surfaces and main glass: 186,766 triangles across 11 mesh primitives. Their authored positions, normals and tangents survive exactly, apart from vertex reordering and identical-vertex welding. Mobile reduces those surfaces toward 50% of their triangles with a strict 0.03% relative error limit. Other glass uses a 0.05% error limit. Secondary details use the less restrictive parameters above.

Both variants preserve full-precision float32 vertex attributes. Meshopt compression is lossless; no position quantization or normal/tangent filtering is used. An earlier 97k-triangle version produced visible highlight pinching on the body and is intentionally not shipped. In particular, avoid `meshopt({level:'high'})`, which forces 8-bit normal encoding.

Normal maps use lossless WebP after resizing. Other maps use WebP quality 85. Desktop texture dimensions are at most 1024 pixels, except the subtly applied, repeated paint-flake normal map at 512 pixels. All mobile textures are at most 512 pixels. The original paint, glass, light, rubber, rim, interior and carbon-fibre material separation is preserved.

## Runtime

Use Three.js `GLTFLoader` with the vendored official meshoptimizer 1.3.0 decoder:

```js
import { MeshoptDecoder } from './vendor/meshopt_decoder.module.js';
loader.setMeshoptDecoder(MeshoptDecoder);
```

The decoder embeds its WebAssembly payload; no external WASM URL or network dependency is required. It retains the `ready`, `supported`, `decodeGltfBuffer`, and `decodeGltfBufferAsync` interface used by Three.js GLTFLoader r160. Its MIT license is at `dist/vendor/MESHOPT-LICENSE.txt`.

The GLBs require `EXT_meshopt_compression` and `EXT_texture_webp`. Three.js handles the WebP textures; a WebP-capable browser is required. Neither variant requires `KHR_mesh_quantization`.

### Compatibility asset

`node compatibility.mjs` reads the optimized desktop asset and creates `roadster-compatible.glb` (12,916,344 bytes). It retains all 274,200 triangles, 193 nodes, 105 mesh primitives and 26 materials, with identical positions, normals, tangents, indices, transforms and material bindings. It removes Meshopt compression and converts textures to PNG or JPEG, preserving their dimensions. Linear-channel maps, normals and transparency use PNG; opaque color maps use JPEG quality 94 with 4:4:4 sampling.

The compatibility asset has **no required glTF extensions** and needs neither WebAssembly nor WebP in the browser. The script loads its output with a decoder-free reader, verifies 2,910,330 geometry components byte-for-byte against the desktop source, and writes `roadster-compatible-report.json`. The source desktop asset is never overwritten. The larger compatibility download is intended as a fallback when the normal asset cannot load.

## Orientation and animation

In the decoded scene: +Y is up, +Z points to the front, and X is the car width. Bounds are approximately `[-0.92852, -0.01134, -2.24434]` to `[0.96257, 1.16785, 2.38157]`, in metres.

The four wheel pivot groups remain separate children of `RootNode`:

- `TR.DEF-Wheel.Ft.R`
- `TR.DEF-Wheel.Ft.L`
- `TR.DEF-Wheel.Bk.L`
- `TR.DEF-Wheel.Bk.R`

Each already has a -90-degree X rotation and a 100× local scale, canceled by the imported hierarchy's scale. Preserve the base quaternion. Roll is around the wheel's local X axis; steer the front wheels around world/RootNode Y, composing that yaw before the base quaternion. Calipers are separate `TR.DEF-WheelBrake.*` groups; steer front calipers with the front wheels, but do not roll them. Three.js may sanitize periods out of imported node names, so use its loaded names or GLTFLoader node associations rather than assuming original names survive verbatim.

Full source/output bounds, material names, wheel pivots, transforms, texture sizes and licensing metadata are in `optimization-report.json` and `roadster-mobile-report.json`. Published attribution is in `dist/assets/models/ATTRIBUTION.md`; also link the attribution from the game's credits.
