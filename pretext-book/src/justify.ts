// ── Justified text rendering ──────────────────────────────────────────────────
// Stretches a line to `availableWidth` by distributing extra space evenly
// across word gaps. Lines that are too short (paragraph endings, dialogue)
// are drawn left-aligned instead.
//
// The threshold 0.78: if the natural line fills less than 78% of the column
// it is treated as a last / orphan line and not stretched.

const JUSTIFY_THRESHOLD = 0.78;

/**
 * Draw a single Pretext line, fully justified if it is a full line.
 * ctx.font, ctx.fillStyle, ctx.textBaseline must be set before calling.
 */
export function drawJustified(
  ctx: CanvasRenderingContext2D,
  text: string,
  measuredWidth: number,
  availableWidth: number,
  x: number,
  y: number,
): void {
  const isShort = measuredWidth < availableWidth * JUSTIFY_THRESHOLD;
  if (isShort) {
    ctx.fillText(text, x, y);
    return;
  }

  const words = text.split(' ');
  const gaps  = words.length - 1;
  if (gaps <= 0) {
    ctx.fillText(text, x, y);
    return;
  }

  const spaceW    = ctx.measureText(' ').width;
  const extraEach = (availableWidth - measuredWidth) / gaps;

  let cx = x;
  for (let i = 0; i < words.length; i++) {
    if (words[i]) ctx.fillText(words[i], cx, y);
    if (i < gaps) cx += ctx.measureText(words[i]).width + spaceW + extraEach;
  }
}

/**
 * Pre-compute the x position and measured width of every word in a line,
 * applying the same justification logic. Used by the redaction experiment
 * to build precise word bounding boxes.
 */
export function justifiedWordPositions(
  ctx: CanvasRenderingContext2D,
  text: string,
  measuredWidth: number,
  availableWidth: number,
  startX: number,
): Array<{ word: string; x: number; w: number }> {
  const allTokens = text.split(' ');
  const words     = allTokens.filter(w => w.length > 0);
  if (words.length === 0) return [];

  const gaps      = words.length - 1;
  const isShort   = measuredWidth < availableWidth * JUSTIFY_THRESHOLD;
  const spaceW    = ctx.measureText(' ').width;
  const extraEach = isShort || gaps === 0 ? 0 : (availableWidth - measuredWidth) / gaps;

  const result: Array<{ word: string; x: number; w: number }> = [];
  let x = startX;
  for (let i = 0; i < words.length; i++) {
    const w = ctx.measureText(words[i]).width;
    result.push({ word: words[i], x, w });
    if (i < gaps) x += w + spaceW + extraEach;
  }
  return result;
}
