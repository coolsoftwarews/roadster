/** Fit the complete driver identity below a clip, including long URLs/emoji. */
export function layoutGifCaption(context, value, width) {
  const driver = String(value || 'Roadster driver');
  const characters = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(driver), part => part.segment)
    : [...driver];
  let size = 11, lines;
  do {
    context.font = `${size}px Arial, sans-serif`;
    lines = [''];
    for (const character of characters) {
      if (lines.at(-1) && context.measureText(lines.at(-1) + character).width > width) lines.push('');
      lines[lines.length - 1] += character;
    }
    if (lines.length <= 4 || size <= 9) break;
    size--;
  } while (true);
  const lineHeight = size + 3;
  return { lines, size, lineHeight, height: 48 + lines.length * lineHeight };
}
