import { renderResultCard } from './result-card.js?v=ui-review-1';

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
export function resultCardFilename(result, format = 'landscape', fileType = 'jpeg') {
  const track = filenamePart(result.trackId, 'canyon', 24);
  const difficulty = filenamePart(result.difficultyId, 'easy', 12);
  const driver = filenamePart(result.driver, 'driver', 48);
  const score = Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0;
  return `roadster-${track}-${difficulty}-${driver}-${score}-${format === 'square' ? 'square' : 'landscape'}.${fileType === 'png' ? 'png' : 'jpg'}`;
}

export function canvasToImage(canvas, fileType = 'jpeg') {
  const mime = fileType === 'png' ? 'image/png' : 'image/jpeg';
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob?.size && blob.type === mime
        ? resolve(blob) : reject(new Error(`${fileType === 'png' ? 'PNG' : 'JPEG'} encoding failed`)), mime, .9);
    } catch (error) {
      reject(error);
    }
  });
}

export const canvasToPng = canvas => canvasToImage(canvas, 'png');

function fileSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function canCopyImage() {
  return typeof globalThis.ClipboardItem === 'function' && typeof globalThis.navigator?.clipboard?.write === 'function';
}

/** Owns the current export, including download URLs and stale async work. */
export function createCardExporter({ canvas, downloadLink, copyButton, formatSelect, fileTypeSelect, status, metadata }) {
  let result = null;
  let generation = 0;
  let disposed = false;
  let currentBlob = null;
  let pngPromise = null;
  let currentUrl = null;

  function release() {
    if (currentUrl) URL.revokeObjectURL(currentUrl);
    currentUrl = null;
    currentBlob = null;
    pngPromise = null;
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
    const fileType = fileTypeSelect?.value === 'png' ? 'png' : 'jpeg';
    const typeLabel = fileType.toUpperCase();
    const buttonLabel = downloadLink.querySelector?.('[data-card-download-label]');
    if (buttonLabel) buttonLabel.textContent = `Download ${typeLabel}`;
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
      const blob = await canvasToImage(canvas, fileType);
      if (disposed || token !== generation) return false;
      currentUrl = URL.createObjectURL(blob);
      currentBlob = blob;
      if (fileType === 'png') pngPromise = Promise.resolve(blob);
      downloadLink.href = currentUrl;
      downloadLink.download = resultCardFilename(snapshot, format, fileType);
      downloadLink.setAttribute('aria-disabled', 'false');
      downloadLink.setAttribute('tabindex', '0');
      copyButton.disabled = !canCopyImage();
      copyButton.title = canCopyImage() ? 'Copy the card as an image' : 'Image copying is unavailable in this browser. Download the card instead.';
      metadata.textContent = `${canvas.width} × ${canvas.height} · ${typeLabel} · ${fileSize(blob.size)}`;
      status.textContent = '';
      return true;
    } catch (error) {
      if (disposed || token !== generation) return false;
      release();
      status.textContent = 'The image could not be prepared. Choose another format to try again. You can still post your results to X.';
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
      status.textContent = 'Image copying is unavailable here. Download the card instead.';
      return;
    }
    copyButton.disabled = true;
    status.textContent = 'Copying image…';
    try {
      // Clipboard support is broadest for PNG, independent of the download format.
      // Passing the encode promise preserves the original click's user activation.
      pngPromise ??= canvasToPng(canvas);
      // A denied clipboard may reject before it consumes the encoder promise.
      void pngPromise.catch(() => {});
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })]);
      if (!disposed && token === generation) status.textContent = 'Image copied. Paste it into your post.';
    } catch {
      if (!disposed && token === generation) {
        pngPromise = null;
        status.textContent = 'Image copying was blocked. Download the card and attach it to your post instead.';
      }
    } finally {
      if (!disposed && token === generation) copyButton.disabled = !canCopyImage();
    }
  }

  const changeFormat = () => { void prepare(); };
  formatSelect.addEventListener('change', changeFormat);
  fileTypeSelect?.addEventListener('change', changeFormat);
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
      fileTypeSelect?.removeEventListener('change', changeFormat);
      downloadLink.removeEventListener('click', preventUnavailableDownload);
      copyButton.removeEventListener('click', copyImage);
    }
  };
}
