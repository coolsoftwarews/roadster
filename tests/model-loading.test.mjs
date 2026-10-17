import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchModelBytes, loadModelWithRecovery} from '../dist/model-loading.js';

function makeGlb() {
  const json = new TextEncoder().encode(JSON.stringify({asset: {version: '2.0'}, scenes: []}));
  const jsonLength = Math.ceil(json.length / 4) * 4;
  const bytes = new Uint8Array(20 + jsonLength);
  const header = new DataView(bytes.buffer);
  header.setUint32(0, 0x46546c67, true);
  header.setUint32(4, 2, true);
  header.setUint32(8, bytes.length, true);
  header.setUint32(12, jsonLength, true);
  header.setUint32(16, 0x4e4f534a, true);
  bytes.fill(0x20, 20);
  bytes.set(json, 20);
  return bytes;
}

test('model download reassembles streamed GLB bytes and reports actual progress', async () => {
  const bytes = makeGlb();
  const chunks = [bytes.slice(0, 3), bytes.slice(3, 17), bytes.slice(17)];
  const progress = [];
  let request;
  const data = await fetchModelBytes('/roadster.glb', {
    cache: 'reload',
    onProgress: event => progress.push(event),
    fetchImpl: async (url, options) => {
      request = {url, options};
      return new Response(new ReadableStream({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      }), {headers: {'content-length': String(bytes.length)}});
    },
  });
  assert.deepEqual(new Uint8Array(data), bytes);
  assert.equal(request.url, '/roadster.glb');
  assert.equal(request.options.cache, 'reload');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.deepEqual(progress, [3, 17, bytes.length].map(loaded => ({
    stage: 'download', loaded, total: bytes.length,
  })));
});

test('model download rejects a failed HTTP response', async () => {
  await assert.rejects(fetchModelBytes('/missing.glb', {
    fetchImpl: async () => new Response('Unavailable', {status: 503}),
  }), /download failed \(503\)/);
});

test('model download rejects an HTML fallback even when its HTTP status is 200', async () => {
  await assert.rejects(fetchModelBytes('/roadster.glb', {
    fetchImpl: async () => new Response('<!doctype html><html><body>Fallback page</body></html>', {
      status: 200, headers: {'content-type': 'text/html'},
    }),
  }), /not a complete GLB model/);
});

test('model download rejects truncated data whose GLB header declares more bytes', async () => {
  const original = makeGlb();
  await assert.rejects(fetchModelBytes('/partial.glb', {
    fetchImpl: async () => new Response(original.slice(0, -4)),
  }), /not a complete GLB model/);
});

test('model download aborts a stalled fetch and reports the timeout', async () => {
  let aborted = false;
  await assert.rejects(fetchModelBytes('/stalled.glb', {
    timeoutMs: 15,
    fetchImpl: async (_url, {signal}) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        aborted = true;
        reject(new DOMException('Aborted', 'AbortError'));
      }, {once: true});
    }),
  }), /download timed out/);
  assert.equal(aborted, true);
});

const candidates = [
  {url: '/roadster.glb', variant: 'quality'},
  {url: '/roadster-mobile.glb', variant: 'mobile'},
  {url: '/roadster-compat.glb', variant: 'compat'},
];

for (const successIndex of [1, 2]) {
  test(`model recovery uses ${candidates[successIndex].variant} after earlier failures and stops on success`, async () => {
    const attempts = [];
    const progress = [];
    const rig = {visual: {name: 'detailed Roadster'}, update() {}};
    const result = await loadModelWithRecovery(candidates, async (candidate, options) => {
      attempts.push({candidate, cache: options.cache});
      options.onProgress({stage: 'download', loaded: 12, total: 24});
      if (candidate !== candidates[successIndex]) throw new Error('Unavailable variant');
      return rig;
    }, event => progress.push(event));

    assert.equal(result, rig);
    assert.deepEqual(attempts, candidates.slice(0, successIndex + 1).map((candidate, index) => ({
      candidate, cache: index ? 'reload' : 'default',
    })));
    assert.deepEqual(progress.filter(event => event.loaded === 12).map(event => ({
      attempt: event.attempt, variant: event.variant,
    })), candidates.slice(0, successIndex + 1).map((candidate, attempt) => ({
      attempt, variant: candidate.variant,
    })));
    assert.deepEqual(progress.at(-1), {
      stage: 'ready', attempt: successIndex, variant: candidates[successIndex].variant,
    });
  });
}

test('model recovery preserves every failure in an AggregateError when all variants fail', async () => {
  const failures = candidates.map(candidate => new Error(`${candidate.variant} failed`));
  const attempted = [];
  await assert.rejects(loadModelWithRecovery(candidates, async candidate => {
    const index = candidates.indexOf(candidate);
    attempted.push(candidate);
    throw failures[index];
  }), error => {
    assert.ok(error instanceof AggregateError);
    assert.match(error.message, /detailed Roadster could not be loaded/);
    assert.deepEqual(error.errors, failures);
    return true;
  });
  assert.deepEqual(attempted, candidates);
});
