import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext';
import { BODY_FONT } from '../setup';
import { PROSE } from '../prose';
import { drawJustified } from '../justify';

// ── Experiment: Expanding Orb ─────────────────────────────────────────────────
// A flat black orb grows slowly over 20s.
// Text routes symmetrically around it: for each line, we compute a chord using
// an EXCLUSION radius (visual radius + 60px clearance) so there is visible
// white space between the ink edge and the text.

const DURATION_MS   = 20_000;
const MAX_R         = 140;  // visual radius
const CLEARANCE     = 60;   // extra buffer added to exclusion zone

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: import("../main").Column,
): () => void {
  const prepared = _prepared ?? prepareWithSegments(PROSE, BODY_FONT);

  const cx = column.x + column.width / 2;
  const cy = column.y + column.height * 0.45;

  let startTime = 0;
  let rafId = 0;

  function frame(now: number) {
    if (!startTime) startTime = now;
    const elapsed = (now - startTime) % (DURATION_MS * 1.4);

    const t       = Math.min(elapsed / DURATION_MS, 1);
    const ease    = 1 - Math.pow(1 - t, 4);
    const r       = MAX_R * ease;
    const rExcl   = r + CLEARANCE;   // exclusion zone for text routing

    ctx.clearRect(0, 0, 576, 864);

    // ── Draw flat black orb ───────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#111111';
    ctx.fill();

    // ── Layout text ───────────────────────────────────────────────────────────
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.fillStyle    = '#1c1612';
    ctx.textBaseline = 'alphabetic';

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

    const colLeft  = column.x;
    const colRight = column.x + column.width;
    const bottom   = column.y + column.height + column.lineHeight;

    for (let y = column.y + column.lineHeight; y <= bottom; y += column.lineHeight) {
      const lineMid = y - column.lineHeight * 0.35;
      const dy      = lineMid - cy;
      const chord2  = rExcl * rExcl - dy * dy;

      if (chord2 <= 0) {
        // No exclusion — full column width
        const line = layoutNextLine(prepared, cursor, column.width);
        if (!line) break;
        drawJustified(ctx, line.text, line.width, column.width, colLeft, y);
        cursor = line.end;
        continue;
      }

      const half      = Math.sqrt(chord2);
      const exclLeft  = cx - half;
      const exclRight = cx + half;

      const leftW  = Math.max(0, exclLeft  - colLeft);
      const rightW = Math.max(0, colRight  - exclRight);
      const MIN    = 48;

      const hasLeft  = leftW  >= MIN;
      const hasRight = rightW >= MIN;

      if (hasLeft && hasRight) {
        const lineL = layoutNextLine(prepared, cursor, leftW);
        if (!lineL) break;
        drawJustified(ctx, lineL.text, lineL.width, leftW, colLeft, y);
        cursor = lineL.end;

        const lineR = layoutNextLine(prepared, cursor, rightW);
        if (!lineR) break;
        drawJustified(ctx, lineR.text, lineR.width, rightW, exclRight, y);
        cursor = lineR.end;
      } else if (hasLeft) {
        const line = layoutNextLine(prepared, cursor, leftW);
        if (!line) break;
        drawJustified(ctx, line.text, line.width, leftW, colLeft, y);
        cursor = line.end;
      } else if (hasRight) {
        const line = layoutNextLine(prepared, cursor, rightW);
        if (!line) break;
        drawJustified(ctx, line.text, line.width, rightW, exclRight, y);
        cursor = line.end;
      }
      // else: fully blocked — advance y, cursor unchanged
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
