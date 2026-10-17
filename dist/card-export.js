import { renderResultCard } from './result-card.js?v=cards-2';

let artworkPromise;

function loadArtwork() {
  if (!artworkPromise) {
    artworkPromise = new Promise(resolve => {
      if (typeof Image !== 'function') { resolve(null); return; }
      const image = new Image();
      const finish = value => {
        clearTimeout(timeout);
        image.onload = image.onerror = null;
        resolve(value);
      };
      const timeout = setTimeout(() => finish(null), 8000);
      image.decoding = 'async';
      image.onload = () => finish(image.naturalWidth ? image : null);
      image.onerror = () => finish(null);
      image.src = new URL('./assets/roadster-launch.png', import.meta.url).href;
    });
  }
  return artworkPromise;
}

function filenamePart(value, fallback, limit) {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, limit).replace(/-+$/g, '') || fallback;
}

/** Filename shortening never changes the identity displayed on the card. */
export function resultCardFilename(result, format = 'landscape') {
  const track = filenamePart(result.trackId, 'canyon', 24);
  const difficulty = filenamePart(result.difficultyId, 'easy', 12);
  const driver = filenamePart(result.driver, 'driver', 48);
  const score = Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0;
  return `roadster-${track}-${difficulty}-${driver}-${score}-${format === 'square' ? 'square' : 'landscape'}.png`;
}

export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('PNG encoding failed')), 'image/png');
    } catch (error) {
      reject(error);
    }
  });
}

function fileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function canCopyImage() {
  return typeof globalThis.ClipboardItem === 'function' && typeof globalThis.navigator?.clipboard?.write === 'function';
}

/** Owns the current export, including download URLs and stale async work. */
export function createCardExporter({ canvas, downloadLink, copyButton, formatSelect, status, metadata }) {
  let result = null;
  let generation = 0;
  let disposed = false;
  let currentBlob = null;
  let currentUrl = null;

  function release() {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    currentBlob = null;
    downloadLink.removeAttribute('href');
    downloadLink.removeAttribute('download');
    downloadLink.setAttribute('aria-disabled', 'true');
    downloadLink.setAttribute('tabindex', '-1');
    copyButton.disabled = true;
  }

  async function prepare() {
    if (disposed || !result) return false;
    const token = ++generation;
    const snapshot = { ...result };
    const format = formatSelect.value === 'square' ? 'square' : 'landscape';
    release();
    metadata.textContent = '';
    status.textContent = 'Preparing your card…';
    canvas.setAttribute('aria-busy', 'true');
    canvas.setAttribute('aria-label', `Race result for ${snapshot.driver}: ${snapshot.score} points`);
    try {
      // Show a fresh preview immediately while the optional artwork loads.
      renderResultCard(canvas, snapshot, { format, artwork: null });
      const artwork = await loadArtwork();
      if (disposed || token !== generation) return false;
      if (artwork) renderResultCard(canvas, snapshot, { format, artwork });
      const blob = await canvasToPng(canvas);
      if (disposed || token !== generation) return false;
      currentUrl = URL.createObjectURL(blob);
      currentBlob = blob;
      downloadLink.href = currentUrl;
      downloadLink.download = resultCardFilename(snapshot, format);
      downloadLink.setAttribute('aria-disabled', 'false');
      downloadLink.setAttribute('tabindex', '0');
      copyButton.disabled = !canCopyImage();
      copyButton.title = canCopyImage() ? 'Copy this PNG image' : 'Image copying is unavailable in this browser. Download the PNG instead.';
      metadata.textContent = `${canvas.width} × ${canvas.height} · PNG · ${fileSize(blob.size)}`;
      status.textContent = canCopyImage() ? 'Ready to download or copy.' : 'Your PNG is ready to download.';
      return true;
    } catch (error) {
      if (disposed || token !== generation) return false;
      release();
      status.textContent = 'The PNG could not be prepared. Choose a format to try again. You can still post your results to X.';
      console.warn('Result card export unavailable', error);
      return false;
    } finally {
      if (!disposed && token === generation) canvas.setAttribute('aria-busy', 'false');
    }
  }

  function preventUnavailableDownload(event) {
    if (!currentUrl) event.preventDefault();
  }

  async function copyImage() {
    if (disposed || !currentBlob) return;
    const token = generation;
    if (!canCopyImage()) {
      status.textContent = 'Image copying is unavailable here. Download the PNG instead.';
      return;
    }
    copyButton.disabled = true;
    status.textContent = 'Copying image…';
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': currentBlob })]);
      if (!disposed && token === generation) status.textContent = 'Image copied. Paste it into your post.';
    } catch {
      if (!disposed && token === generation) status.textContent = 'Image copying was blocked. Download the PNG and attach it to your post instead.';
    } finally {
      if (!disposed && token === generation) copyButton.disabled = !canCopyImage();
    }
  }

  const changeFormat = () => { void prepare(); };
  formatSelect.addEventListener('change', changeFormat);
  downloadLink.addEventListener('click', preventUnavailableDownload);
  copyButton.addEventListener('click', copyImage);
  release();

  return {
    show(nextResult) {
      if (disposed) return Promise.resolve(false);
      result = { ...nextResult };
      return prepare();
    },
    dispose() {
      disposed = true;
      generation++;
      release();
      canvas.setAttribute('aria-busy', 'false');
      formatSelect.removeEventListener('change', changeFormat);
      downloadLink.removeEventListener('click', preventUnavailableDownload);
      copyButton.removeEventListener('click', copyImage);
    }
  };
}
