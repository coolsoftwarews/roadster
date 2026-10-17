import test from 'node:test';
import assert from 'node:assert/strict';
import {fetchModelBytes, loadModelWithRecovery, MODEL_CACHE_NAME} from '../dist/model-loading.js';

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
  }), error => error.code === 'MODEL_NETWORK' && error.reason === 'stalled');
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
      candidate, cache: 'default',
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

test('a continuously progressing stream can outlast the inactivity timeout', async () => {
  const bytes = makeGlb();
  const progress = [];
  let interval;
  const data = await fetchModelBytes('/slow-but-progressing.glb', {
    timeoutMs: 80, maxDurationMs: 1500, cacheStorage: null,
    onProgress: event => progress.push(event),
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        let offset = 0;
        interval = setInterval(() => {
          const next = Math.min(bytes.length, offset + 12);
          controller.enqueue(bytes.slice(offset, next));
          offset = next;
          if (offset === bytes.length) { clearInterval(interval); controller.close(); }
        }, 30);
      },
      cancel() { clearInterval(interval); }
    }))
  });
  assert.deepEqual(new Uint8Array(data), bytes);
  assert.ok(progress.length >= 4, 'the complete transfer spans multiple timeout windows');
});

test('a stalled body is cancelled without persisting its partial bytes', async () => {
  const bytes = makeGlb();
  let cancelled = false, written = false;
  const storage = { open:async () => ({ match:async () => undefined, put:async () => { written = true; } }) };
  await assert.rejects(fetchModelBytes('/body-stalled.glb', {
    timeoutMs: 20, cacheStorage: storage,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(bytes.slice(0, 24)); },
      cancel() { cancelled = true; }
    }), { headers:{ 'content-length':String(bytes.length) } })
  }), error => error.code === 'MODEL_NETWORK' && error.reason === 'stalled' && error.loaded === 24 && error.total === bytes.length);
  assert.equal(cancelled, true);
  assert.equal(written, false);
});

test('the absolute deadline bounds an endless progressing stream and clears its reader', async () => {
  let interval, cancelled = false;
  await assert.rejects(fetchModelBytes('/never-finishes.glb', {
    timeoutMs: 80, maxDurationMs: 70, cacheStorage: null,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) { interval = setInterval(() => controller.enqueue(new Uint8Array([1])), 10); },
      cancel() { clearInterval(interval); cancelled = true; }
    }))
  }), error => error.code === 'MODEL_NETWORK' && error.reason === 'deadline' && error.loaded > 0);
  assert.equal(cancelled, true);
});

test('stalled fetches are bounded even when the fetch implementation ignores abort', async () => {
  await assert.rejects(fetchModelBytes('/unresponsive.glb', {
    timeoutMs: 15, cacheStorage: null, fetchImpl: () => new Promise(() => {})
  }), error => error.code === 'MODEL_NETWORK' && error.reason === 'stalled');
});

function memoryCache() {
  const entries = new Map(), names = [], deleted = [];
  const cache = {
    async match(key) { return entries.get(key)?.clone(); },
    async put(key, response) { entries.set(key, response.clone()); },
    async delete(key) { deleted.push(key); return entries.delete(key); }
  };
  return { entries, names, deleted, storage:{ async open(name) { names.push(name); return cache; } } };
}

test('a validated model is reused from the versioned cache with its entire URL as key', async () => {
  const bytes = makeGlb(), saved = memoryCache();
  const url = 'https://roadster.example/assets/model.glb?v=asset-2';
  let downloads = 0;
  const options = { cacheStorage:saved.storage, fetchImpl:async () => { downloads++; return new Response(bytes); } };
  assert.deepEqual(new Uint8Array(await fetchModelBytes(url, options)), bytes);
  await new Promise(resolve => setImmediate(resolve));
  const progress = [];
  assert.deepEqual(new Uint8Array(await fetchModelBytes(url, { ...options, onProgress:event => progress.push(event) })), bytes);
  assert.equal(downloads, 1);
  assert.ok(saved.names.every(name => name === MODEL_CACHE_NAME));
  assert.deepEqual([...saved.entries.keys()], [url]);
  assert.deepEqual(progress, [{ stage:'cached', loaded:bytes.length, total:bytes.length }]);
  await fetchModelBytes(url.replace('asset-2', 'asset-3'), options);
  assert.equal(downloads, 2, 'a different asset version does not reuse old bytes');
});

test('invalid cached content is evicted and replaced only by a complete GLB', async () => {
  const bytes = makeGlb(), saved = memoryCache(), url = 'https://roadster.example/model.glb?v=2';
  for (const invalid of ['<!doctype html>fallback', bytes.slice(0, -4)]) {
    saved.entries.set(url, new Response(invalid));
    let downloads = 0;
    assert.deepEqual(new Uint8Array(await fetchModelBytes(url, {
      cacheStorage:saved.storage, fetchImpl:async () => { downloads++; return new Response(bytes); }
    })), bytes);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(downloads, 1);
    assert.deepEqual(new Uint8Array(await saved.entries.get(url).clone().arrayBuffer()), bytes);
  }
  assert.deepEqual(saved.deleted, [url, url]);
});

test('quota errors, denied cache access and unsupported storage do not prevent model readiness', async () => {
  const bytes = makeGlb();
  for (const cacheStorage of [null, {},
    { open:async () => { throw new Error('Storage denied'); } },
    { open:async () => ({ match:async () => undefined, put:async () => { throw new Error('Quota exceeded'); } }) }
  ]) {
    const data = await fetchModelBytes('/model.glb', { cacheStorage, fetchImpl:async () => new Response(bytes) });
    assert.deepEqual(new Uint8Array(data), bytes);
  }
  // Give rejected background writes a turn to surface any unhandled rejection.
  await new Promise(resolve => setImmediate(resolve));
});

test('a slow cache lookup or write never holds the model loader indefinitely', async () => {
  const bytes = makeGlb();
  const cacheStorage = { open:async () => ({ match:() => new Promise(() => {}), put:() => new Promise(() => {}) }) };
  const data = await fetchModelBytes('/model.glb', {
    cacheStorage, cacheReadTimeoutMs:15, fetchImpl:async () => new Response(bytes)
  });
  assert.deepEqual(new Uint8Array(data), bytes);
});

test('network, stalled, deadline, and server failures never trigger a fallback download storm', async () => {
  for (const options of [
    { fetchImpl:async () => { throw new TypeError('Network disconnected'); } },
    { fetchImpl:() => new Promise(() => {}), timeoutMs:10 },
    { fetchImpl:() => new Promise(() => {}), timeoutMs:100, maxDurationMs:10 },
    { fetchImpl:async () => new Response('Unavailable', { status:503 }) }
  ]) {
    let attempts = 0;
    await assert.rejects(loadModelWithRecovery(candidates, async candidate => {
      attempts++;
      return fetchModelBytes(candidate.url, { ...options, cacheStorage:null });
    }), error => error.code === 'MODEL_NETWORK');
    assert.equal(attempts, 1);
  }
});
