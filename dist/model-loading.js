// Only complete, validated GLBs are retained. The full asset URL includes its version.
export const MODEL_CACHE_NAME = 'roadster-models-v2';
const DEFAULT_STALL_TIMEOUT = 45000;
const DEFAULT_MAX_DURATION = 10 * 60 * 1000;

function modelError(message, code, details = {}) {
  return Object.assign(new Error(message), { code, ...details });
}

function isCompleteGlb(data) {
  if (!data || data.byteLength < 12) return false;
  try {
    const header = new DataView(data);
    return header.getUint32(0, true) === 0x46546c67 && header.getUint32(4, true) === 2 && header.getUint32(8, true) === data.byteLength;
  } catch { return false; }
}

function cacheKey(url) {
  try { return new URL(url, globalThis.location?.href).href; }
  catch { return String(url); }
}

function browserStorage() {
  try { return globalThis.caches; } catch { return null; }
}

function boundedCacheWork(work, timeoutMs, background = false) {
  let timer;
  const timeout = new Promise(resolve => {
    timer = setTimeout(() => resolve(null), timeoutMs);
    if (background) timer.unref?.();
  });
  return Promise.race([Promise.resolve().then(work).catch(() => null), timeout]).finally(() => clearTimeout(timer));
}

async function readCachedModel(storage, name, key, timeoutMs) {
  if (!storage?.open) return null;
  return boundedCacheWork(async () => {
    const cache = await storage.open(name);
    const response = await cache.match(key);
    if (!response) return null;
    let data;
    try { data = await response.arrayBuffer(); } catch { /* Evict unreadable entries too. */ }
    if (response.ok && isCompleteGlb(data)) return data;
    // Eviction must not hold up the network request if browser storage is slow.
    void Promise.resolve().then(() => cache.delete(key)).catch(() => {});
    return null;
  }, timeoutMs);
}

function saveCachedModel(storage, name, key, data) {
  if (!storage?.open || typeof Response !== 'function') return;
  // Quota, privacy settings, or a slow storage backend never delay model readiness.
  void boundedCacheWork(async () => {
    const cache = await storage.open(name);
    await cache.put(key, new Response(data, { headers: {
      'content-type': 'model/gltf-binary', 'content-length': String(data.byteLength)
    } }));
    return true;
  }, 2000, true);
}

/** timeoutMs measures inactivity; continuously arriving bytes can take up to maxDurationMs. */
export async function fetchModelBytes(url, {
  onProgress = () => {}, fetchImpl = globalThis.fetch,
  timeoutMs = DEFAULT_STALL_TIMEOUT, maxDurationMs = DEFAULT_MAX_DURATION,
  cache = 'default', cacheStorage, cacheName = MODEL_CACHE_NAME, cacheReadTimeoutMs = 500
} = {}) {
  const storage = cacheStorage === undefined ? browserStorage() : cacheStorage;
  const key = cacheKey(url);
  if (cache !== 'reload' && cache !== 'no-store') {
    const saved = await readCachedModel(storage, cacheName, key, cacheReadTimeoutMs);
    if (saved) {
      onProgress({ stage:'cached', loaded:saved.byteLength, total:saved.byteLength });
      return saved;
    }
  }

  const controller = new AbortController();
  let reader, stallTimer, deadlineTimer, abortError;
  let loaded = 0, total = 0, streamFinished = false, readerCancelled = false;
  let rejectDownload;
  const interrupted = new Promise((_, reject) => { rejectDownload = reject; });
  const cancelReader = () => {
    if (!reader || streamFinished || readerCancelled) return;
    readerCancelled = true;
    void Promise.resolve().then(() => reader.cancel()).catch(() => {}).finally(() => {
      try { reader.releaseLock(); } catch { /* A closing fetch may already release it. */ }
    });
  };
  const abortDownload = reason => {
    if (abortError) return;
    abortError = modelError(reason === 'stalled' ? 'Roadster download stalled; no new data arrived' : 'Roadster download reached its time limit', 'MODEL_NETWORK', { reason, loaded, total });
    controller.abort(abortError);
    cancelReader();
    rejectDownload(abortError);
  };
  const resetStallTimer = () => {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => abortDownload('stalled'), Math.max(1, timeoutMs));
  };
  const receive = async operation => {
    try { return await Promise.race([operation, interrupted]); }
    catch (error) {
      throw abortError || modelError('Roadster download was interrupted', 'MODEL_NETWORK', { reason:'network', loaded, total, cause:error });
    }
  };

  resetStallTimer();
  deadlineTimer = setTimeout(() => abortDownload('deadline'), Math.max(1, maxDurationMs));
  try {
    const response = await receive(Promise.resolve().then(() => fetchImpl(url, { signal:controller.signal, cache })));
    resetStallTimer();
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      const networkFailure = response.status === 408 || response.status === 429 || response.status >= 500;
      throw modelError(`Roadster download failed (${response.status})`, networkFailure ? 'MODEL_NETWORK' : 'MODEL_ASSET', { reason:'http', status:response.status, loaded, total });
    }
    total = Number(response.headers.get('content-length')) || 0;
    reader = response.body?.getReader();
    let data;
    if (reader) {
      const chunks = [];
      for (;;) {
        const { done, value } = await receive(reader.read());
        if (done) { streamFinished = true; break; }
        if (!value?.byteLength) continue;
        resetStallTimer();
        chunks.push(value);
        loaded += value.byteLength;
        onProgress({ stage:'download', loaded, total });
      }
      const bytes = new Uint8Array(loaded);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      data = bytes.buffer;
    } else {
      data = await receive(response.arrayBuffer());
      loaded = data.byteLength;
      onProgress({ stage:'download', loaded, total });
    }
    if (!isCompleteGlb(data)) throw modelError('Roadster download was not a complete GLB model', 'MODEL_ASSET', { reason:'invalid-glb', loaded, total });
    if (cache !== 'no-store') saveCachedModel(storage, cacheName, key, data);
    return data;
  } finally {
    clearTimeout(stallTimer);
    clearTimeout(deadlineTimer);
    cancelReader();
    if (reader && streamFinished) reader.releaseLock();
  }
}

export async function loadModelWithRecovery(candidates, load, onProgress = () => {}) {
  const failures = [];
  for (let attempt = 0; attempt < candidates.length; attempt++) {
    const candidate = candidates[attempt];
    const report = progress => onProgress({ ...progress, attempt, variant:candidate.variant });
    report({ stage:attempt ? 'retry' : 'download', loaded:0, total:0 });
    try {
      // A different model URL has its own valid cache entry; do not bypass it.
      const rig = await load(candidate, { onProgress:report, cache:'default' });
      report({ stage:'ready' });
      return rig;
    } catch (error) {
      // A slow or offline connection cannot be repaired by downloading larger variants.
      if (error?.code === 'MODEL_NETWORK') throw error;
      failures.push(error);
    }
  }
  throw new AggregateError(failures, 'The detailed Roadster could not be loaded');
}
