import test from 'node:test';
import assert from 'node:assert/strict';
import { canvasToImage, canvasToPng, createCardExporter, resultCardFilename } from '../dist/card-export.js';

const result = { trackId:'tokyo', difficultyId:'medium', driver:'Gabriel', score:850, time:67.7, cleared:4, total:24, ramps:3, totalRamps:5, successfulJumps:10 };
const flush = () => new Promise(resolve => setImmediate(resolve));

class Element extends EventTarget {
  constructor() { super(); this.attributes = new Map(); this.textContent = ''; this.disabled = false; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); delete this[name]; }
}

function controls() {
  const pending = [];
  const context = new Proxy({
    measureText(value) { return { width: [...String(value)].length * 14 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; }
  }, { get(target, key) { return key in target ? target[key] : () => {}; } });
  const canvas = new Element();
  canvas.getContext = () => context;
  const types = [];
  canvas.toBlob = (callback, type, quality) => { types.push({type,quality}); pending.push(callback); };
  const elements = { canvas, downloadLink:new Element(), copyButton:new Element(), formatSelect:new Element(), fileTypeSelect:new Element(), status:new Element(), metadata:new Element() };
  elements.formatSelect.value = 'landscape';
  elements.fileTypeSelect.value = 'jpeg';
  return { elements, pending, types };
}

test('download names identify a run without allowing paths or shortening the saved driver', () => {
  const snapshot = { ...result, driver:'https://driver.example/../../Aída?hello="world"' + '🚗'.repeat(100) };
  const original = snapshot.driver;
  const filename = resultCardFilename(snapshot, 'square');
  assert.match(filename, /^roadster-tokyo-medium-[a-z0-9-]+-850-square\.jpg$/);
  assert.ok(filename.length < 110);
  assert.equal(snapshot.driver, original);
  assert.match(resultCardFilename({ ...result, driver:'👩‍🚀' }), /-driver-850-landscape\.jpg$/);
  assert.match(resultCardFilename(result, 'square', 'png'), /-square\.png$/);
});

test('PNG conversion rejects empty encodes and tainted canvases', async () => {
  await assert.rejects(canvasToPng({ toBlob(callback) { callback(null); } }), /encoding failed/);
  await assert.rejects(canvasToPng({ toBlob() { throw new Error('tainted canvas'); } }), /tainted canvas/);
  const blob = new Blob(['PNG'], { type:'image/png' });
  assert.equal(await canvasToPng({ toBlob(callback) { callback(blob); } }), blob);
  await assert.rejects(canvasToImage({ toBlob(callback) { callback(blob); } }), /JPEG encoding failed/);
});

test('a slow previous encode cannot replace a new result, and exported URLs are released', async t => {
  const { elements, pending } = controls();
  const revoked = [];
  let urls = 0;
  t.mock.method(URL, 'createObjectURL', () => `blob:card-${++urls}`);
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  const exporter = createCardExporter(elements);
  const oldRender = exporter.show(result);
  await flush();
  const newRender = exporter.show({ ...result, score:1250 });
  await flush();
  assert.equal(pending.length, 2);
  pending[1](new Blob(['new JPEG'], { type:'image/jpeg' }));
  assert.equal(await newRender, true);
  const latestUrl = elements.downloadLink.href;
  pending[0](new Blob(['old JPEG'], { type:'image/jpeg' }));
  assert.equal(await oldRender, false);
  assert.equal(elements.downloadLink.href, latestUrl);
  assert.match(elements.downloadLink.download, /-1250-landscape\.jpg$/);
  assert.match(elements.metadata.textContent, / × .* · JPEG · /);
  assert.equal(elements.status.textContent, '');

  elements.formatSelect.value = 'square';
  elements.formatSelect.dispatchEvent(new Event('change'));
  assert.deepEqual(revoked, [latestUrl]);
  assert.equal(elements.downloadLink.href, undefined);
  assert.equal(elements.downloadLink.getAttribute('aria-disabled'), 'true');
  await flush();
  pending[2](new Blob(['square JPEG'], { type:'image/jpeg' }));
  await flush();
  assert.match(elements.downloadLink.download, /-square\.jpg$/);
  const squareUrl = elements.downloadLink.href;
  exporter.dispose();
  assert.deepEqual(revoked, [latestUrl, squareUrl]);
  assert.equal(elements.copyButton.disabled, true);
  assert.equal(await exporter.show(result), false);
});

test('clipboard denial offers download, and a stale clipboard operation cannot enable a pending card', async t => {
  const originals = ['navigator', 'ClipboardItem'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let rejectCopy;
  Object.defineProperty(globalThis, 'navigator', { configurable:true, value:{ clipboard:{ write:() => new Promise((_, reject) => { rejectCopy = reject; }) } } });
  Object.defineProperty(globalThis, 'ClipboardItem', { configurable:true, value:class { constructor(parts) { assert.ok(parts['image/png'] instanceof Promise); } } });
  t.after(() => {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  });
  const { elements, pending } = controls();
  elements.fileTypeSelect.value = 'png';
  const exporter = createCardExporter(elements);
  t.after(() => exporter.dispose());
  const initial = exporter.show(result);
  await flush();
  pending[0](new Blob(['PNG'], { type:'image/png' }));
  await initial;
  assert.equal(elements.copyButton.disabled, false);
  elements.copyButton.dispatchEvent(new Event('click'));
  rejectCopy(new Error('denied'));
  await flush();
  assert.match(elements.status.textContent, /Download the card/);
  assert.equal(elements.copyButton.disabled, false);

  elements.copyButton.dispatchEvent(new Event('click'));
  pending[1](new Blob(['copy PNG'], { type:'image/png' }));
  elements.formatSelect.value = 'square';
  elements.formatSelect.dispatchEvent(new Event('change'));
  rejectCopy(new Error('denied after format changed'));
  await flush();
  assert.equal(elements.copyButton.disabled, true);
  assert.equal(elements.status.textContent, 'Preparing your card…');
  pending[2](new Blob(['square PNG'], { type:'image/png' }));
  await flush();
  assert.equal(elements.copyButton.disabled, false);
});

test('JPEG is the small download default and PNG can be selected independently of shape', async () => {
  const { elements, pending, types } = controls();
  const exporter = createCardExporter(elements);
  const ready = exporter.show(result);
  await flush();
  assert.deepEqual(types[0], {type:'image/jpeg',quality:.9});
  pending[0](new Blob(['JPEG'], {type:'image/jpeg'}));
  await ready;
  elements.fileTypeSelect.value = 'png';
  elements.fileTypeSelect.dispatchEvent(new Event('change'));
  await flush();
  assert.equal(types[1].type, 'image/png');
  pending[1](new Blob(['PNG'], {type:'image/png'}));
  await flush();
  assert.match(elements.downloadLink.download, /-landscape\.png$/);
  assert.match(elements.metadata.textContent, /PNG/);
  exporter.dispose();
});

test('copying a JPEG download encodes PNG on demand without changing its download', async t => {
  const originals = ['navigator', 'ClipboardItem'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  let clipboardBlob;
  Object.defineProperty(globalThis, 'navigator', {configurable:true,value:{clipboard:{write:async items => { clipboardBlob = await items[0].parts['image/png']; }}}});
  Object.defineProperty(globalThis, 'ClipboardItem', {configurable:true,value:class { constructor(parts) { this.parts = parts; } }});
  t.after(() => { for (const [key, descriptor] of originals) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key]; } });
  const { elements, pending, types } = controls();
  const exporter = createCardExporter(elements);
  t.after(() => exporter.dispose());
  const ready = exporter.show(result);
  await flush();
  pending[0](new Blob(['JPEG'], {type:'image/jpeg'}));
  await ready;
  const download = elements.downloadLink.href;
  elements.copyButton.dispatchEvent(new Event('click'));
  assert.equal(types[1].type, 'image/png');
  pending[1](new Blob(['PNG'], {type:'image/png'}));
  await flush();
  assert.equal(clipboardBlob.type, 'image/png');
  assert.equal(elements.downloadLink.href, download);
  assert.match(elements.downloadLink.download, /\.jpg$/);
  assert.match(elements.status.textContent, /Image copied/);
});
