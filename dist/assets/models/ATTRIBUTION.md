# Tesla Roadster 2020

- Original creator: [metarex.4d](https://sketchfab.com/metarex.4d).
- Original work: [Tesla Roadster 2020](https://sketchfab.com/3d-models/tesla-roadster-2020-1fbf29e297bd4a17ac39a00a378441d8).
- License: [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
- The original GLB was supplied by the Roadster Run project owner. Its embedded author, source, title, and license metadata are retained in `roadster.glb`, `roadster-mobile.glb`, and `roadster-compatible.glb`.
- Modifications for Roadster Run: secondary geometry simplified and vertex data losslessly compressed with Meshopt. Desktop retains the original painted-body and main-glass topology; mobile uses conservative body/glass simplification. Both retain full-precision authored normals of their retained vertices. Textures were resized to at most 1024 pixels on desktop (paint-flake map 512 pixels), or 512 pixels on mobile, and converted to WebP. Named nodes, separate wheel groups, and original materials were retained.
- The compatibility variant retains the desktop geometry exactly, removes Meshopt compression and converts the textures to PNG/JPEG without reducing their dimensions. It requires neither WebAssembly nor WebP in the browser.

This asset is used in an unofficial fan-made game. The model creator's attribution does not imply endorsement of the game.
