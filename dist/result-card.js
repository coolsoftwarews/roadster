import { formatTime } from './game-logic.js?v=radio-1';
import { getTrack } from './tracks.js?v=cinematic-1';
import { getDifficulty } from './difficulty.js?v=radio-1';

const FONT = 'Arial, Helvetica, sans-serif';
const INK = '#fff5e7';
const MUTED = '#bdcdd6';
const BACKGROUND = '#09111a';

export const CARD_FORMATS = Object.freeze({
  landscape: Object.freeze({ width: 2400, height: 1350, label: 'Wide' }),
  square: Object.freeze({ width: 1600, height: 1600, label: 'Square' })
});

/** Wrap at grapheme boundaries, preserving long URLs and joined emoji in full. */
export function wrapCardText(context, text, width) {
  const segmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    const characters = segmenter
      ? Array.from(segmenter.segment(paragraph), item => item.segment)
      : Array.from(paragraph);
    let line = '';
    for (const character of characters) {
      if (line && context.measureText(line + character).width > width) {
        const space = line.lastIndexOf(' ');
        if (space > line.length * .45) {
          lines.push(line.slice(0, space + 1));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = '';
        }
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

/** Find a legible size for every character; no clipping or ellipsis. */
export function layoutCardDriver(context, driver, width = 1040, height = 126, startingSize = 36) {
  let size = startingSize;
  let lines;
  do {
    context.font = `600 ${size}px ${FONT}`;
    lines = wrapCardText(context, driver, width);
    if (lines.length * size * 1.2 <= height) break;
    size -= 1;
  } while (size > 8);
  return { lines, size, lineHeight: size * 1.2 };
}

function text(context, value, x, y, size, color = INK, weight = 600) {
  context.font = `${weight} ${size}px ${FONT}`;
  context.fillStyle = color;
  context.fillText(String(value), x, y);
}

function fittedText(context, value, x, y, width, size, color = INK, weight = 600) {
  const string = String(value);
  context.font = `${weight} ${size}px ${FONT}`;
  const measured = context.measureText(string).width;
  if (measured > width) size *= width / measured;
  text(context, string, x, y, size, color, weight);
}

function line(context, x1, y1, x2, y2, color, width = 1) {
  context.strokeStyle = color;
  context.lineWidth = width;
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

function roundRect(context, x, y, width, height, radius, fill) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

/** The route uses the same control points as the playable circuit. */
function drawRoute(context, track, x, y, width, height, color, lineWidth = 2) {
  const xs = track.controls.map(point => point[0]);
  const zs = track.controls.map(point => point[2]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = Math.min(width / (maxX - minX), height / (maxZ - minZ));
  const offsetX = x + (width - (maxX - minX) * scale) / 2;
  const points = track.controls.map(point => [
    offsetX + (point[0] - minX) * scale,
    y + height - (point[2] - minZ) * scale
  ]);
  context.beginPath();
  context.moveTo(...points[0]);
  for (let index = 0; index < points.length - 1; index++) {
    const before = points[Math.max(0, index - 1)];
    const start = points[index], end = points[index + 1];
    const after = points[Math.min(points.length - 1, index + 2)];
    context.bezierCurveTo(
      start[0] + (end[0] - before[0]) / 6,
      start[1] + (end[1] - before[1]) / 6,
      end[0] - (after[0] - start[0]) / 6,
      end[1] - (after[1] - start[1]) / 6,
      ...end
    );
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
  const finish = points.at(-1);
  context.fillStyle = INK;
  context.fillRect(finish[0] - lineWidth, finish[1] - lineWidth, lineWidth * 2, lineWidth * 2);
}

function drawBackground(context, width, height, accent) {
  const fill = context.createLinearGradient(0, 0, width, height);
  fill.addColorStop(0, '#172731');
  fill.addColorStop(.5, BACKGROUND);
  fill.addColorStop(1, '#071017');
  context.fillStyle = fill;
  context.fillRect(0, 0, width, height);
  const glow = context.createRadialGradient(width * .9, height * .3, 0, width * .9, height * .3, width * .7);
  glow.addColorStop(0, accent + '24');
  glow.addColorStop(1, accent + '00');
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
  context.fillStyle = accent;
  context.fillRect(0, 0, width, 5);
}

function drawBrand(context, x, y, accent) {
  text(context, 'R', x, y - 6, 38, INK, 'italic 900');
  text(context, '/', x + 24, y - 6, 38, accent, 'italic 900');
  text(context, 'ROADSTER RUN', x + 59, y + 1, 20, INK, 800);
}

function drawArtwork(context, artwork, track, box) {
  const { x, y, width, height } = box;
  const imageWidth = Number(artwork?.naturalWidth || artwork?.width);
  const imageHeight = Number(artwork?.naturalHeight || artwork?.height);
  let painted = false;
  if (Number.isFinite(imageWidth) && imageWidth > 0 && Number.isFinite(imageHeight) && imageHeight > 0) {
    const scale = Math.min(width / imageWidth, height / imageHeight);
    const drawWidth = imageWidth * scale, drawHeight = imageHeight * scale;
    // Contain the full launch artwork so the nose, wheels, and thrusters stay visible.
    try {
      context.drawImage(artwork, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
      painted = true;
    } catch { /* An unavailable image still produces a complete export. */ }
  }
  if (!painted) {
    const glow = context.createRadialGradient(x + width / 2, y + height / 2, 0, x + width / 2, y + height / 2, width / 2);
    glow.addColorStop(0, track.theme.accent + '30');
    glow.addColorStop(1, track.theme.accent + '00');
    context.fillStyle = glow;
    context.fillRect(x, y, width, height);
    for (let index = 0; index < 7; index++) {
      const lineY = y + height * (.22 + index * .1);
      line(context, x + 12, lineY, x + width - 12, lineY - 30, '#ffffff08');
    }
    drawRoute(context, track, x + width * .34, y + 20, width * .32, height - 56, track.theme.accent, 5);
    text(context, track.tagline, x + 20, y + height - 20, 12, MUTED, 700);
  }
}

const safeNumber = value => Number.isFinite(Number(value)) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Number(value))) : 0;
const count = value => Math.floor(safeNumber(value));

function drawMetrics(context, result, x, y, width, labelSize = 15, valueSize = 32) {
  const metrics = [
    ['OBSTACLES JUMPED', `${count(result.cleared)} / ${count(result.total)}`, 'Scoring jumps over hazards'],
    ['RAMP LANDINGS', `${count(result.ramps)} / ${count(result.totalRamps)}`, 'Unique ramps completed'],
    ['ALL SAFE LANDINGS', String(count(result.successfulJumps)), 'Ramp + thrust jumps']
  ];
  const column = width / metrics.length;
  metrics.forEach(([title, value, explanation], index) => {
    const metricX = x + column * index;
    if (index) line(context, metricX - 16, y, metricX - 16, y + 82, '#b4d1de2a');
    text(context, title, metricX, y, labelSize, MUTED, 700);
    fittedText(context, value, metricX, y + 27, column - 34, valueSize, INK, 600);
    fittedText(context, explanation, metricX, y + 70, column - 30, labelSize - 1, MUTED, 500);
  });
}

function drawDriver(context, result, x, y, width, height, accent, startingSize = 30) {
  text(context, 'DRIVER', x, y, 14, accent, 700);
  const driver = String(result.driver ?? '') || 'Anonymous driver';
  const layout = layoutCardDriver(context, driver, width, height, startingSize);
  context.font = `600 ${layout.size}px ${FONT}`;
  context.fillStyle = INK;
  layout.lines.forEach((row, index) => context.fillText(row, x, y + 23 + index * layout.lineHeight));
  return y + 23 + layout.lines.length * layout.lineHeight;
}

function drawTime(context, result, x, y, width, accent, size = 48) {
  text(context, 'FINISH TIME', x, y, 15, MUTED, 700);
  fittedText(context, formatTime(safeNumber(result.time)), x - 2, y + 25, width, size, INK, 500);
  let nextY = y + 29 + size;
  if (result.isBest) {
    roundRect(context, x - 3, nextY, width, 26, 5, accent);
    fittedText(context, 'NEW PERSONAL BEST', x + 6, nextY + 6, width - 18, 13, BACKGROUND, 800);
    nextY += 35;
  }
  if (Number.isFinite(result.previousBestTime) && result.previousBestTime > 0) {
    const prefix = result.isBest ? 'Previous best' : 'Personal best';
    fittedText(context, `${prefix} ${formatTime(result.previousBestTime)}`, x, nextY, width, 14, MUTED, 500);
  }
}

function drawFooter(context, width, y, margin, accent, square) {
  line(context, margin, y - 18, width - margin, y - 18, '#b4d1de24');
  text(context, 'YOUR NEXT RECORD AWAITS.', margin, y + 2, square ? 12 : 14, MUTED, 700);
  context.textAlign = 'right';
  text(context, 'roadster.coolsoftware.io', width - margin, y - 2, square ? 19 : 22, accent, 700);
  context.textAlign = 'left';
}

function paintWide(context, result, track, difficulty, artwork) {
  const accent = track.theme.accent;
  drawBackground(context, 1200, 675, accent);
  drawBrand(context, 48, 38, accent);
  text(context, `CIRCUIT ${track.number}  /  ${difficulty.toUpperCase()}`, 842, 47, 14, MUTED, 700);
  drawRoute(context, track, 1110, 28, 40, 57, accent, 1.8);
  line(context, 48, 91, 1152, 91, '#b4d1de24');

  fittedText(context, track.name.toUpperCase(), 48, 120, 540, 39, INK, 800);
  text(context, 'CIRCUIT COMPLETE', 48, 173, 15, accent, 700);
  const driverEnd = drawDriver(context, result, 48, 212, 540, 84, accent);
  drawArtwork(context, artwork, track, { x: 620, y: 122, width: 532, height: 353 });

  const scoreY = Math.max(296, driverEnd + 20);
  text(context, 'TOTAL SCORE', 48, scoreY, 15, MUTED, 700);
  fittedText(context, count(result.score).toLocaleString('en-US'), 40, scoreY + 22, 312, 107, INK, 800);
  drawTime(context, result, 374, scoreY + 5, 216, accent, 48);
  line(context, 48, 496, 1152, 496, '#b4d1de24');
  drawMetrics(context, result, 48, 518, 1104, 16, 36);
  drawFooter(context, 1200, 643, 48, accent, false);
}

function paintSquare(context, result, track, difficulty, artwork) {
  const accent = track.theme.accent;
  drawBackground(context, 800, 800, accent);
  drawBrand(context, 36, 32, accent);
  context.textAlign = 'right';
  text(context, `CIRCUIT ${track.number}`, 764, 41, 13, MUTED, 700);
  context.textAlign = 'left';
  line(context, 36, 81, 764, 81, '#b4d1de24');
  fittedText(context, track.name.toUpperCase(), 36, 105, 728, 38, INK, 800);
  text(context, `${difficulty.toUpperCase()}  /  CIRCUIT COMPLETE`, 36, 155, 14, accent, 700);
  const driverEnd = drawDriver(context, result, 36, 190, 728, 76, accent, 28);
  const artY = driverEnd + 15;
  drawArtwork(context, artwork, track, { x: 110, y: artY, width: 654, height: 431 - artY });
  drawRoute(context, track, 39, artY + 10, 52, 431 - artY - 20, accent, 2.5);

  text(context, 'TOTAL SCORE', 36, 456, 15, MUTED, 700);
  fittedText(context, count(result.score).toLocaleString('en-US'), 30, 475, 385, 88, INK, 800);
  drawTime(context, result, 468, 456, 296, accent, 52);
  line(context, 36, 609, 764, 609, '#b4d1de24');
  drawMetrics(context, result, 36, 633, 728, 14, 32);
  drawFooter(context, 800, 778, 36, accent, true);
}

/** Render a complete social card synchronously; supplied artwork must already be decoded. */
export function renderResultCard(canvas, result, options = {}) {
  const square = options.format === 'square';
  const format = CARD_FORMATS[square ? 'square' : 'landscape'];
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable.');
  context.save();
  context.scale(2, 2);
  context.textBaseline = 'top';
  context.textAlign = 'left';
  const track = getTrack(result.trackId);
  const difficulty = getDifficulty(result.difficultyId).name;
  const paint = square ? paintSquare : paintWide;
  paint(context, result, track, difficulty, options.artwork);
  context.restore();
  return canvas;
}
