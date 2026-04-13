import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments } from '@chenglou/pretext';
import { BODY_FONT, canvas } from '../setup';
import { PROSE } from '../prose';
import { justifiedWordPositions } from '../justify';

// ── Experiment: Mouse-Driven Redaction ────────────────────────────────────────
// Pre-compute every word's bounding box using the same justification logic
// used to render. On mousemove, find the hovered word; all words up to and
// including it are rendered as filled black rectangles.

interface WordBox {
  text:  string;
  x:     number;   // justified left edge
  y:     number;   // baseline
  w:     number;   // measured width
  lineY: number;   // top of line band
}

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: import("../main").Column,
): () => void {
  const prepared = _prepared ?? prepareWithSegments(PROSE, BODY_FONT);

  ctx.font         = BODY_FONT;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';

  // ── Pre-compute justified word boxes ─────────────────────────────────────
  const words: WordBox[] = [];
  {
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y      = column.y + column.lineHeight;
    const bottom = column.y + column.height + column.lineHeight;

    while (y <= bottom) {
      const line = layoutNextLine(prepared, cursor, column.width);
      if (!line) break;

      const lineTop = y - column.lineHeight + 4;
      // justifiedWordPositions applies the same threshold logic as drawJustified
      const positions = justifiedWordPositions(
        ctx, line.text, line.width, column.width, column.x,
      );

      for (const { word, x, w } of positions) {
        words.push({ text: word, x, y, w, lineY: lineTop });
      }

      cursor = line.end;
      y     += column.lineHeight;
    }
  }

  // ── Mouse tracking ────────────────────────────────────────────────────────
  let hoveredIndex = -1;
  let rafId = 0;
  let dirty = true;

  function onMouseMove(e: MouseEvent) {
    const rect  = canvas.getBoundingClientRect();
    const scaleX = 576 / rect.width;
    const scaleY = 864 / rect.height;
    const mx     = (e.clientX - rect.left) * scaleX;
    const my     = (e.clientY - rect.top)  * scaleY;

    // First: try exact word hit
    let found = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (mx >= w.x && mx <= w.x + w.w && my >= w.lineY && my <= w.lineY + column.lineHeight) {
        found = i;
        break;
      }
    }
    // Fallback: rightmost word on the hovered line whose left edge is ≤ mx
    if (found === -1) {
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (my >= w.lineY && my <= w.lineY + column.lineHeight && mx >= w.x) found = i;
      }
    }

    if (found !== hoveredIndex) { hoveredIndex = found; dirty = true; }
  }

  canvas.addEventListener('mousemove', onMouseMove);

  // ── Render ────────────────────────────────────────────────────────────────
  function render() {
    if (!dirty) { rafId = requestAnimationFrame(render); return; }
    dirty = false;

    ctx.clearRect(0, 0, 576, 864);
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (hoveredIndex >= 0 && i <= hoveredIndex) {
        ctx.fillStyle = '#111111';
        ctx.fillRect(w.x - 1, w.lineY, w.w + 2, column.lineHeight - 2);
      } else {
        ctx.fillStyle = '#1c1612';
        ctx.fillText(w.text, w.x, w.y);
      }
    }

    rafId = requestAnimationFrame(render);
  }

  render();

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('mousemove', onMouseMove);
  };
}
