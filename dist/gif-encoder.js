// Original, dependency-free GIF89a encoder. A single adaptive palette prevents
// colours flickering between frames; all expensive work runs in gif-worker.js.

function paletteFor(frames) {
  const counts = new Uint32Array(32768);
  for (const frame of frames) {
    // Sampling every fourth pixel keeps palette building bounded for long clips.
    for (let offset = 0; offset < frame.rgba.length; offset += 16) {
      const pixels = frame.rgba;
      counts[((pixels[offset] >> 3) << 10) | ((pixels[offset + 1] >> 3) << 5) | (pixels[offset + 2] >> 3)]++;
    }
  }
  const colors = [];
  for (let index = 0; index < counts.length; index++) {
    if (counts[index]) colors.push({ r: ((index >> 10) & 31) * 8 + 4, g: ((index >> 5) & 31) * 8 + 4, b: (index & 31) * 8 + 4, weight: counts[index] });
  }
  const describe = values => {
    let minR = 255, minG = 255, minB = 255, maxR = 0, maxG = 0, maxB = 0, weight = 0;
    for (const color of values) {
      minR = Math.min(minR, color.r); minG = Math.min(minG, color.g); minB = Math.min(minB, color.b);
      maxR = Math.max(maxR, color.r); maxG = Math.max(maxG, color.g); maxB = Math.max(maxB, color.b);
      weight += color.weight;
    }
    const ranges = [maxR - minR, maxG - minG, maxB - minB];
    const channel = ['r', 'g', 'b'][ranges.indexOf(Math.max(...ranges))];
    return { values, weight, channel, priority: values.length > 1 ? Math.max(...ranges) * Math.sqrt(weight) : -1 };
  };
  const boxes = [describe(colors)];
  while (boxes.length < 256) {
    let selected = -1, priority = -1;
    for (let index = 0; index < boxes.length; index++) if (boxes[index].priority > priority) { selected = index; priority = boxes[index].priority; }
    if (selected < 0) break;
    const box = boxes[selected];
    box.values.sort((a, b) => a[box.channel] - b[box.channel]);
    let cumulative = 0, split = 1;
    for (; split < box.values.length; split++) {
      cumulative += box.values[split - 1].weight;
      if (cumulative >= box.weight / 2) break;
    }
    split = Math.min(split, box.values.length - 1);
    boxes[selected] = describe(box.values.slice(0, split));
    boxes.push(describe(box.values.slice(split)));
  }
  const palette = new Uint8Array(768);
  boxes.forEach((box, index) => {
    let r = 0, g = 0, b = 0;
    for (const color of box.values) { r += color.r * color.weight; g += color.g * color.weight; b += color.b * color.weight; }
    palette[index * 3] = Math.round(r / box.weight);
    palette[index * 3 + 1] = Math.round(g / box.weight);
    palette[index * 3 + 2] = Math.round(b / box.weight);
  });
  return { palette, size: boxes.length };
}

function indexPixels(rgba, palette, size, lookup) {
  const indexed = new Uint8Array(rgba.length / 4);
  for (let offset = 0, pixel = 0; offset < rgba.length; offset += 4, pixel++) {
    const key = ((rgba[offset] >> 3) << 10) | ((rgba[offset + 1] >> 3) << 5) | (rgba[offset + 2] >> 3);
    let match = lookup[key];
    if (match < 0) {
      const r = ((key >> 10) & 31) * 8 + 4, g = ((key >> 5) & 31) * 8 + 4, b = (key & 31) * 8 + 4;
      let closest = Infinity;
      for (let index = 0; index < size; index++) {
        const dr = r - palette[index * 3], dg = g - palette[index * 3 + 1], db = b - palette[index * 3 + 2];
        const distance = dr * dr * 2 + dg * dg * 3 + db * db;
        if (distance < closest) { closest = distance; match = index; }
      }
      lookup[key] = match;
    }
    indexed[pixel] = match;
  }
  return indexed;
}

/** GIF LZW uses least-significant-bit-first codes, growing from 9 to 12 bits. */
export function gifLzw(indexed) {
  const bytes = [];
  let dictionary = new Map(), nextCode = 258, width = 9, pending = 0, bits = 0;
  function write(code) {
    pending |= code << bits;
    bits += width;
    while (bits >= 8) { bytes.push(pending & 255); pending >>>= 8; bits -= 8; }
    // The decoder adds entries one output later than the encoder. Increase
    // width after writing this code, before adding the next dictionary entry.
    if (nextCode >= (1 << width) && width < 12) width++;
  }
  write(256);
  let prefix = indexed[0];
  for (let index = 1; index < indexed.length; index++) {
    const suffix = indexed[index], key = prefix * 256 + suffix;
    const found = dictionary.get(key);
    if (found !== undefined) { prefix = found; continue; }
    write(prefix);
    if (nextCode < 4096) dictionary.set(key, nextCode++);
    else { write(256); dictionary = new Map(); nextCode = 258; width = 9; }
    prefix = suffix;
  }
  write(prefix);
  write(257);
  if (bits) bytes.push(pending & 255);
  return Uint8Array.from(bytes);
}

/** frames: [{rgba: Uint8Array|Uint8ClampedArray, delay: milliseconds}]. */
export function encodeGif({ width, height, frames, loop = 0, comment = '' }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2048 || height > 2048) throw new TypeError('Invalid GIF dimensions.');
  if (!Array.isArray(frames) || !frames.length || frames.length > 60) throw new TypeError('A GIF needs between 1 and 60 frames.');
  if (frames.some(frame => !(frame.rgba instanceof Uint8Array || frame.rgba instanceof Uint8ClampedArray) || frame.rgba.length !== width * height * 4)) throw new TypeError('A GIF frame has invalid pixel data.');
  const { palette, size } = paletteFor(frames);
  const lookup = new Int16Array(32768).fill(-1);
  const chunks = [];
  const put = values => chunks.push(Uint8Array.from(values));
  const word = value => [value & 255, (value >> 8) & 255];
  const string = value => new TextEncoder().encode(value);
  function blocks(bytes) {
    for (let start = 0; start < bytes.length; start += 255) { put([Math.min(255, bytes.length - start)]); chunks.push(bytes.subarray(start, start + 255)); }
    put([0]);
  }
  chunks.push(string('GIF89a'));
  put([...word(width), ...word(height), 0xf7, 0, 0]);
  chunks.push(palette);
  put([0x21, 0xff, 11]); chunks.push(string('NETSCAPE2.0'));
  put([3, 1, ...word(Math.min(65535, Math.max(0, loop))), 0]);
  if (comment) { put([0x21, 0xfe]); blocks(string(comment)); }
  for (const frame of frames) {
    const delay = Math.min(65535, Math.max(2, Math.round((Number(frame.delay) || 1000 / 12) / 10)));
    put([0x21, 0xf9, 4, 4, ...word(delay), 0, 0]);
    put([0x2c, 0, 0, 0, 0, ...word(width), ...word(height), 0]);
    put([8]);
    blocks(gifLzw(indexPixels(frame.rgba, palette, size, lookup)));
  }
  put([0x3b]);
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
  return output;
}
