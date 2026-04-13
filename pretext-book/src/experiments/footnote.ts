import {
  prepareWithSegments, layoutNextLine,
  type PreparedTextWithSegments, type LayoutCursor,
} from '@chenglou/pretext';
import { BODY_FONT, canvas } from '../setup';
import { PROSE } from '../prose';
import { drawJustified, justifiedWordPositions } from '../justify';

// ── Experiment: Inline Footnote Expansion ────────────────────────────────────
// Superscript numbers are placed after sentence endings. Hovering one opens
// a citation box that grows in the gap below that line, pushing all subsequent
// lines down by the animated box height. Un-hovering springs the box closed
// and the lines slide back. No Pretext re-layout needed — lines below the
// active note are simply translated by the current box height each frame.

const BOX_MAX_H   = 56;    // px: max height of the citation box
const BOX_INSET   = 10;    // px: horizontal inset inside column
const ANIM_LERP   = 0.14;  // lerp factor per frame (spring close feel)
const NOTE_FONT   = 'italic 12px Lora';
const SUPER_FONT  = 'bold 10px Lora';

// Fake academic citations for the ASOUE passage
const CITATIONS = [
  'Snicket, L. (1999). The Bad Beginning. HarperCollins Children\'s Books, p. 1.',
  'Handler, D. (1999). "On Misfortune and Children." The Paris Review, No. 148, p. 34.',
  'Baudelaire, C. (1857). Les Fleurs du Mal. Trans. R. Howard. David R. Godine, 1982.',
  'Snicket, L. (2001). The Miserable Mill. HarperCollins Children\'s Books, p. 204.',
  'Handler, D. (2006). Horseradish: Bitter Truths You Can\'t Avoid. HarperCollins, p. 29.',
];

interface LineData {
  y:     number;
  text:  string;
  width: number;
}

interface NoteMarker {
  lineIdx:  number;
  lineY:    number;
  noteX:    number;  // x position of the superscript numeral
  noteY:    number;  // y position of the superscript numeral (top baseline)
  citation: string;
  num:      number;
}

// Wrap text into lines that fit maxWidth, returns array of line strings
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      out.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) out.push(cur);
  return out;
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

  // ── Pre-compute all lines ─────────────────────────────────────────────────
  const lines: LineData[] = [];
  {
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y     = column.y + column.lineHeight;
    const bot = column.y + column.height + column.lineHeight;

    while (y <= bot) {
      const line = layoutNextLine(prepared, cursor, column.width);
      if (!line) break;
      lines.push({ y, text: line.text, width: line.width });
      cursor = line.end;
      y     += column.lineHeight;
    }
  }

  // ── Locate superscript positions after sentence endings ───────────────────
  // Walk all word positions to find sentence-ending words and record their
  // right edge x so the superscript can be drawn just above that point.
  const notes: NoteMarker[] = [];
  let citIdx    = 0;
  let lastNoteLi = -5;

  for (let li = 0; li < lines.length && notes.length < 5; li++) {
    const { y, text, width } = lines[li];
    const positions = justifiedWordPositions(ctx, text, width, column.width, column.x);

    for (let wi = 0; wi < positions.length && notes.length < 5; wi++) {
      const { word, x, w } = positions[wi];
      // Sentence-ending word: ends with . ! ? or ." etc.
      if (/[.!?]['"\u201d]?$/.test(word) && li - lastNoteLi >= 4) {
        const noteX = x + w + 1;
        // Raised position: near top of current line band
        const noteY = y - column.lineHeight + 3;
        notes.push({
          lineIdx:  li,
          lineY:    y,
          noteX,
          noteY,
          citation: CITATIONS[citIdx % CITATIONS.length],
          num:      citIdx + 1,
        });
        citIdx++;
        lastNoteLi = li;
      }
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────
  let activeNote = -1;   // index into notes[], or -1
  let expandedH  = 0;    // current animated box height
  let rafId      = 0;

  function onMouseMove(e: MouseEvent) {
    const rect  = canvas.getBoundingClientRect();
    const sx    = 576 / rect.width;
    const sy    = 864 / rect.height;
    const mx    = (e.clientX - rect.left) * sx;
    const my    = (e.clientY - rect.top)  * sy;

    let found = -1;
    for (let i = 0; i < notes.length; i++) {
      const n = notes[i];
      // Shift note y if it's below an already-active expansion
      const yShift = (activeNote >= 0 && n.lineIdx > notes[activeNote].lineIdx)
        ? expandedH : 0;
      const hx = n.noteX;
      const hy = n.noteY + yShift;
      if (mx >= hx - 2 && mx <= hx + 14 && my >= hy && my <= hy + 14) {
        found = i;
        break;
      }
    }
    if (found !== activeNote) activeNote = found;
  }

  canvas.addEventListener('mousemove', onMouseMove);

  // ── Render ────────────────────────────────────────────────────────────────
  function frame() {
    const targetH = activeNote >= 0 ? BOX_MAX_H : 0;
    expandedH    += (targetH - expandedH) * ANIM_LERP;
    if (Math.abs(expandedH - targetH) < 0.4) expandedH = targetH;

    ctx.clearRect(0, 0, 576, 864);
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.fillStyle    = '#1c1612';
    ctx.textBaseline = 'alphabetic';

    const splitLi = activeNote >= 0 ? notes[activeNote].lineIdx : -1;

    // ── Draw passage lines ─────────────────────────────────────────────────
    for (let li = 0; li < lines.length; li++) {
      const { y, text, width } = lines[li];
      const drawY = li > splitLi && splitLi >= 0 ? y + expandedH : y;
      ctx.fillStyle = '#1c1612';
      drawJustified(ctx, text, width, column.width, column.x, drawY);
    }

    // ── Draw citation box ─────────────────────────────────────────────────
    if (activeNote >= 0 && expandedH > 1) {
      const note = notes[activeNote];
      const bx   = column.x + BOX_INSET;
      const bw   = column.width - BOX_INSET * 2;
      const by   = note.lineY + 4;
      const bh   = expandedH - 6;

      // Background
      ctx.fillStyle = '#f5ede0';
      ctx.fillRect(bx, by, bw, bh);

      // Border
      ctx.save();
      ctx.strokeStyle = '#b09070';
      ctx.lineWidth   = 1;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.restore();

      // Small top-left tick pointing to superscript
      ctx.save();
      ctx.fillStyle   = '#b09070';
      ctx.beginPath();
      ctx.moveTo(Math.min(note.noteX + 4, bx + bw - 12), by);
      ctx.lineTo(Math.min(note.noteX + 4, bx + bw - 12) + 8, by);
      ctx.lineTo(Math.min(note.noteX + 4, bx + bw - 12) + 4, by - 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Citation text (fade in after box is 30% open)
      const textAlpha = Math.max(0, Math.min(1, (expandedH - BOX_MAX_H * 0.35) / (BOX_MAX_H * 0.4)));
      if (textAlpha > 0.01 && bh > 14) {
        ctx.save();
        ctx.globalAlpha  = textAlpha;
        ctx.font         = NOTE_FONT;
        ctx.fillStyle    = '#3a2a1a';
        ctx.textBaseline = 'top';
        const noteLines  = wrapText(ctx, note.citation, bw - 16);
        const noteLineH  = 16;
        for (let i = 0; i < noteLines.length; i++) {
          const ty = by + 8 + i * noteLineH;
          if (ty + noteLineH < by + bh) ctx.fillText(noteLines[i], bx + 8, ty);
        }
        ctx.restore();
      }
    }

    // ── Draw superscript numerals ─────────────────────────────────────────
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      // Shift if below the active expansion
      const yShift = (splitLi >= 0 && note.lineIdx > splitLi) ? expandedH : 0;
      ctx.font         = SUPER_FONT;
      ctx.fillStyle    = activeNote === i ? '#7a1a00' : '#8a5a2a';
      ctx.textBaseline = 'top';
      ctx.fillText(String(note.num), note.noteX, note.noteY + yShift);
    }

    // Reset context state
    ctx.font         = BODY_FONT;
    ctx.textBaseline = 'alphabetic';

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('mousemove', onMouseMove);
  };
}
