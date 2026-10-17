import { encodeGif } from './gif-encoder.js?v=money-shots-1';
import { layoutGifCaption } from './gif-caption.js?v=money-shots-1';

function brandFrames(width, height, frames, result) {
  // Append the caption below the actual game image. Nothing covers the car.
  if (typeof OffscreenCanvas !== 'function') return { width, height, frames };
  const output = new OffscreenCanvas(width, height + 62);
  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) return { width, height, frames };
  const caption = layoutGifCaption(context, result?.driver, width - 28);
  output.height = height + caption.height;
  for (const frame of frames) {
    context.putImageData(new ImageData(new Uint8ClampedArray(frame.rgba), width, height), 0, 0);
    context.fillStyle = '#09121a'; context.fillRect(0, height, width, caption.height);
    context.fillStyle = '#ff986c'; context.fillRect(0, height, width, 2);
    context.textAlign = 'left'; context.font = 'bold 12px Arial, sans-serif'; context.fillStyle = '#fff5e7';
    context.fillText('ROADSTER RUN / MONEY SHOT', 14, height + 19);
    context.textAlign = 'right';
    const score = Math.max(0, Math.round(Number(result?.score) || 0));
    context.fillText(`${score.toLocaleString('en-US')} PTS`, width - 14, height + 19);
    context.textAlign = 'left'; context.font = `${caption.size}px Arial, sans-serif`; context.fillStyle = '#afc3ce';
    caption.lines.forEach((line, index) => context.fillText(line, 14, height + 36 + index * caption.lineHeight));
    context.font = '10px Arial, sans-serif'; context.textAlign = 'right';
    context.fillText('roadster.coolsoftware.io', width - 14, output.height - 10);
    frame.rgba = context.getImageData(0, 0, output.width, output.height).data;
  }
  return { width: output.width, height: output.height, frames };
}

self.onmessage = event => {
  try {
    const { width, height, frames, result } = event.data;
    const branded = brandFrames(width, height, frames, result);
    const bytes = encodeGif({ ...branded, loop: 0, comment: `Roadster Run money shot | Driver: ${result?.driver || 'Roadster driver'} | Score: ${result?.score || 0} | https://roadster.coolsoftware.io` });
    self.postMessage({ bytes: bytes.buffer, width: branded.width, height: branded.height }, [bytes.buffer]);
  } catch (error) {
    self.postMessage({ error: error?.message || 'The GIF could not be created.' });
  }
};
