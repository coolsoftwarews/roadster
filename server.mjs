import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('dist');
const types = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.txt':'text/plain', '.glb':'model/gltf-binary', '.webp':'image/webp'};
http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent((req.url || '/').split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, content) => {
    if (err) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, {'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(content);
  });
}).listen(4183, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4183'));
