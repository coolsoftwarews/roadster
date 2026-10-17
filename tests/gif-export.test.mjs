import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeGif } from '../dist/gif-encoder.js';
import { createMoneyShotRecorder, MONEY_SHOT_CAPTURE } from '../dist/money-shot-gif.js';
import { layoutGifCaption } from '../dist/gif-caption.js';

// Independent GIF reader exercises sub-blocks, dictionary resets and variable
// code widths. It deliberately uses decoded byte sequences, not encoder keys.
function readGif(bytes) {
  const word = offset => bytes[offset] | bytes[offset + 1] << 8;
  assert.equal(new TextDecoder().decode(bytes.subarray(0, 6)), 'GIF89a');
  const width = word(6), height = word(8), palette = bytes.slice(13, 13 + 768);
  let cursor = 13 + 768, delay = 0, loop = null, comment = '';
  const frames = [];
  function blocks() {
    const result = [];
    while (bytes[cursor]) {
      const length = bytes[cursor++];
      for (let index = 0; index < length; index++) result.push(bytes[cursor++]);
    }
    cursor++;
    return Uint8Array.from(result);
  }
  while (bytes[cursor] !== 0x3b) {
    const marker = bytes[cursor++];
    if (marker === 0x21) {
      const kind = bytes[cursor++];
      if (kind === 0xf9) { assert.equal(bytes[cursor++], 4); cursor++; delay = word(cursor) * 10; cursor += 4; }
      else if (kind === 0xff) { cursor += bytes[cursor] + 1; const data = blocks(); loop = data[1] | data[2] << 8; }
      else if (kind === 0xfe) comment += new TextDecoder().decode(blocks());
      else assert.fail(`Unexpected extension ${kind}`);
      continue;
    }
    assert.equal(marker, 0x2c);
    assert.equal(word(cursor + 4), width); assert.equal(word(cursor + 6), height);
    cursor += 9;
    const minimum = bytes[cursor++], clear = 1 << minimum, end = clear + 1, compressed = blocks();
    let dictionary, size, offset = 0, previous = null, clears = 0;
    const reset = () => { dictionary = Array.from({ length: clear }, (_, value) => [value]); dictionary.push(null, null); size = minimum + 1; previous = null; clears++; };
    reset();
    const pixels = [];
    while (offset + size <= compressed.length * 8) {
      let code = 0;
      for (let bit = 0; bit < size; bit++, offset++) code |= ((compressed[offset >> 3] >> (offset & 7)) & 1) << bit;
      if (code === clear) { reset(); continue; }
      if (code === end) break;
      const sequence = dictionary[code] || (code === dictionary.length && previous ? [...previous, previous[0]] : null);
      assert.ok(sequence, `Invalid LZW code ${code} with ${dictionary.length} entries`);
      pixels.push(...sequence);
      if (previous) {
        dictionary.push([...previous, sequence[0]]);
        if (dictionary.length === 1 << size && size < 12) size++;
      }
      previous = sequence;
    }
    assert.equal(pixels.length, width * height);
    frames.push({ pixels, delay, clears });
  }
  assert.equal(cursor, bytes.length - 1);
  return { width, height, palette, frames, loop, comment };
}

test('GIF is independently decodable across LZW width changes and resets', () => {
  const width = 192, height = 128;
  let seed = 42;
  const frames = Array.from({ length: 3 }, (_, index) => {
    const rgba = new Uint8Array(width * height * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      rgba[offset] = seed & 255; rgba[offset + 1] = (seed >> 8) & 255; rgba[offset + 2] = (seed >> 16) & 255; rgba[offset + 3] = 255;
    }
    return { rgba, delay: 80 + index * 10 };
  });
  const decoded = readGif(encodeGif({ width, height, frames, comment: 'Driver: Gabriel 🏎️', loop: 0 }));
  assert.equal(decoded.frames.length, 3);
  assert.deepEqual(decoded.frames.map(frame => frame.delay), [80, 90, 100]);
  assert.equal(decoded.loop, 0);
  assert.match(decoded.comment, /Gabriel 🏎️/);
  assert.ok(decoded.frames.every(frame => frame.clears > 2), 'Large varied frames must reset a full dictionary');
  assert.notDeepEqual(decoded.frames[0].pixels, decoded.frames[1].pixels);
});

test('global palette preserves primary colours and frame changes', () => {
  const frames = [[255, 0, 0], [0, 255, 0], [0, 0, 255]].map(rgb => ({ rgba: Uint8Array.from([...rgb, 255, ...rgb, 255]), delay: 83 }));
  const decoded = readGif(encodeGif({ width: 2, height: 1, frames }));
  decoded.frames.forEach((frame, frameIndex) => {
    const color = decoded.palette.subarray(frame.pixels[0] * 3, frame.pixels[0] * 3 + 3);
    color.forEach((component, index) => assert.ok(Math.abs(component - (index === frameIndex ? 255 : 0)) <= 4));
    assert.equal(frame.pixels[0], frame.pixels[1]);
  });
});

test('encoder rejects missing frames and malformed RGBA data', () => {
  assert.throws(() => encodeGif({ width: 640, height: 360, frames: [] }), /frames/);
  assert.throws(() => encodeGif({ width: 640, height: 360, frames: [{ rgba: new Uint8Array(1) }] }), /pixel/);
  assert.throws(() => encodeGif({ width: 0, height: 360, frames: [] }), /dimensions/);
});

test('GIF caption wraps all 255 driver characters without clipping or abbreviating', () => {
  const context = { font: '', measureText(value) { return { width: [...value].length * Number.parseInt(this.font) }; } };
  const identity = 'W'.repeat(250) + '🏎️!';
  const caption = layoutGifCaption(context, identity, 612);
  assert.equal(caption.lines.join(''), identity);
  assert.ok(caption.lines.length <= 4);
  assert.ok(caption.lines.every(line => context.measureText(line).width <= 612));
  assert.ok(caption.height >= 48 + caption.lines.length * caption.lineHeight);
  assert.ok(caption.size >= 9);
});

test('recorder bounds capture, keeps a complete prior clip, and resets between races', async () => {
  const previousDocument = globalThis.document;
  let captures = 0;
  const context = {
    fillRect() {}, drawImage() {},
    getImageData() { captures++; return { data: new Uint8ClampedArray(MONEY_SHOT_CAPTURE.width * MONEY_SHOT_CAPTURE.height * 4) }; }
  };
  globalThis.document = { createElement: () => ({ getContext: () => context }) };
  try {
    const recorder = createMoneyShotRecorder();
    assert.equal(recorder.available, false);
    await assert.rejects(recorder.export({}), /Complete a money shot/);
    recorder.start();
    for (let index = 0; index < 300; index++) recorder.capture({ width: 1920, height: 1080 }, 1 / 60);
    assert.equal(captures, 30);
    assert.equal(recorder.recording, false);
    assert.equal(recorder.available, true);
    recorder.start(); recorder.capture({ width: 1920, height: 1080 }, 1 / 60); recorder.finish();
    assert.equal(recorder.available, true, 'An interrupted shot must retain the last usable clip');
    recorder.reset(); assert.equal(recorder.available, false); assert.equal(recorder.recording, false);
  } finally { globalThis.document = previousDocument; }
});

test('export uses a race-safe snapshot and reports the encoded GIF dimensions', async () => {
  const previousDocument = globalThis.document, previousWorker = globalThis.Worker;
  let pixels = new Uint8ClampedArray(MONEY_SHOT_CAPTURE.width * MONEY_SHOT_CAPTURE.height * 4).fill(24);
  let sent, transferred, terminated = false;
  globalThis.document = { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {}, getImageData: () => ({ data: pixels.slice() }) }) }) };
  globalThis.Worker = class {
    postMessage(message, transfer) {
      sent = message; transferred = transfer;
      queueMicrotask(() => this.onmessage({ data: { bytes: new TextEncoder().encode('GIF89a').buffer, width: 640, height: 422 } }));
    }
    terminate() { terminated = true; }
  };
  try {
    const recorder = createMoneyShotRecorder();
    recorder.start();
    for (let index = 0; index < 4; index++) recorder.capture({ width: 640, height: 360 }, 1 / 12);
    recorder.finish();
    const result = { driver: 'Gabriel', score: 1200 };
    const exporting = recorder.export(result);
    recorder.reset(); result.driver = 'Another driver'; pixels.fill(0);
    const blob = await exporting;
    assert.equal(blob.type, 'image/gif');
    assert.equal(sent.result.driver, 'Gabriel');
    assert.equal(sent.frames.length, 4);
    assert.equal(sent.frames[0].rgba[0], 24);
    assert.equal(transferred.length, 4);
    assert.equal(terminated, true);
    assert.deepEqual(recorder.exportDimensions, { width: 640, height: 422 });
  } finally { globalThis.document = previousDocument; globalThis.Worker = previousWorker; }
});
