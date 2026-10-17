export const MONEY_SHOT_CAPTURE = Object.freeze({ width: 640, height: 360, fps: 12, maxFrames: 84 });

/** Retains one short clip in memory. Call capture synchronously after render(). */
export function createMoneyShotRecorder() {
  const { width, height, fps, maxFrames } = MONEY_SHOT_CAPTURE;
  const surface = document.createElement('canvas');
  surface.width = width; surface.height = height;
  const context = surface.getContext('2d', { alpha: false, willReadFrequently: true });
  let active = false, elapsed = 0, nextCapture = 0, lastCapture = 0;
  let recording = [], latest = null;
  let exportDimensions = null;

  function finish() {
    active = false;
    if (recording.length >= 3) latest = recording;
    recording = [];
    return Boolean(latest);
  }

  function capture(sourceCanvas, dtReal) {
    if (!active || !context || !sourceCanvas?.width || !sourceCanvas?.height) return;
    elapsed += Math.max(0, Math.min(.25, Number(dtReal) || 0));
    if (elapsed + 1e-7 < nextCapture) return;
    try {
      const scale = Math.min(width / sourceCanvas.width, height / sourceCanvas.height);
      const drawWidth = sourceCanvas.width * scale, drawHeight = sourceCanvas.height * scale;
      context.fillStyle = '#070d14'; context.fillRect(0, 0, width, height);
      context.drawImage(sourceCanvas, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      if (recording.length) recording[recording.length - 1].delay = Math.max(20, (elapsed - lastCapture) * 1000);
      recording.push({ rgba: context.getImageData(0, 0, width, height).data, delay: 1000 / fps });
      lastCapture = elapsed;
      nextCapture += 1 / fps;
      if (nextCapture <= elapsed) nextCapture = elapsed + 1 / fps;
      if (recording.length >= maxFrames) finish();
    } catch {
      // Recording failure must never interrupt steering or landing controls.
      finish();
    }
  }

  return {
    start() { active = Boolean(context); elapsed = 0; nextCapture = 0; lastCapture = 0; recording = []; },
    capture,
    finish,
    reset() { active = false; recording = []; latest = null; exportDimensions = null; },
    get available() { return Boolean(latest?.length); },
    get recording() { return active; },
    get exportDimensions() { return exportDimensions; },
    export(result) {
      if (!latest?.length) return Promise.reject(new Error('Complete a money shot during this race to save a GIF.'));
      if (typeof Worker !== 'function') return Promise.reject(new Error('GIF export is unavailable in this browser. You can still download your PNG card.'));
      // Copy before transferring: a new race or another export cannot detach or
      // change these frames, and a failed export can be retried.
      const frames = latest.map(frame => ({ rgba: frame.rgba.slice(), delay: frame.delay }));
      const snapshot = { driver: String(result?.driver || 'Roadster driver'), score: Number(result?.score) || 0 };
      return new Promise((resolve, reject) => {
        let worker;
        try { worker = new Worker(new URL('./gif-worker.js?v=money-long-1', import.meta.url), { type: 'module' }); }
        catch { reject(new Error('The GIF exporter could not start. Please try again.')); return; }
        const done = (error, bytes) => {
          clearTimeout(timeout); worker.terminate();
          if (error) reject(new Error(error));
          else resolve(new Blob([bytes], { type: 'image/gif' }));
        };
        const timeout = setTimeout(() => done('GIF export took too long. Please try again.'), 60000);
        worker.onerror = () => done('The GIF exporter could not finish. Please try again.');
        worker.onmessage = event => {
          if (!event.data.error) exportDimensions = { width: event.data.width, height: event.data.height };
          done(event.data.error, event.data.bytes);
        };
        try { worker.postMessage({ width, height, frames, result: snapshot }, frames.map(frame => frame.rgba.buffer)); }
        catch { done('The captured clip could not be sent to the GIF exporter. Please try again.'); }
      });
    }
  };
}
