import type { PreparedTextWithSegments } from '@chenglou/pretext';
import { BODY_FONT, COLUMN } from '../setup';
import { PROSE } from '../prose';

// ── Experiment: Marquee ───────────────────────────────────────────────────────
// Each line slot on the page is an independent horizontal ribbon of the full
// prose text, scrolling left at a unique random speed. The column clip region
// creates a 408px-wide window into each ribbon; the text is always continuous
// and fills from margin to margin. As lines diverge in speed, different words
// are visible on each row — the page ripples.

const MIN_SPEED = 8;   // px/sec
const MAX_SPEED = 40;  // px/sec

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: typeof COLUMN,
): () => void {
  // ── Build word ribbon ──────────────────────────────────────────────────────
  // Flatten prose to one continuous string (paragraph breaks → double space)
  const flat = PROSE.replace(/\n+/g, '  ').replace(/  +/g, '  ');

  ctx.font = BODY_FONT;
  const spaceW = ctx.measureText(' ').width;

  // Split into individual words (non-space runs)
  const rawWords = flat.split(/\s+/).filter(w => w.length > 0);
  const wordW    = rawWords.map(w => ctx.measureText(w).width);

  // Pre-compute left edge (pixel position) of each word within the ribbon
  const wordLeft: number[] = [];
  let x = 0;
  for (let i = 0; i < rawWords.length; i++) {
    wordLeft.push(x);
    x += wordW[i] + spaceW;
  }
  const totalWidth = x; // full ribbon pixel width

  // ── Per-slot setup ─────────────────────────────────────────────────────────
  const slotsH = column.height + column.lineHeight;
  const slots  = Math.floor(slotsH / column.lineHeight);

  const rng    = mulberry32(0xb00b1e55);
  // Each slot gets a unique speed, assigned once
  const speeds: number[] = Array.from({ length: slots }, () =>
    MIN_SPEED + rng() * (MAX_SPEED - MIN_SPEED)
  );
  // All slots start at offset 0 — the beginning of the prose is at the left margin
  const offsets: number[] = new Array(slots).fill(0);

  let lastTime = 0;
  let rafId    = 0;

  // Binary search: first word index where wordLeft[i] >= target
  function firstWordAt(target: number): number {
    let lo = 0, hi = rawWords.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (wordLeft[mid] < target) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  function frame(now: number) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime  = now;

    // Advance offsets
    for (let s = 0; s < slots; s++) {
      offsets[s] = (offsets[s] + speeds[s] * dt) % totalWidth;
    }

    ctx.clearRect(0, 0, 576, 864);

    // Clip to column rect
    ctx.save();
    ctx.beginPath();
    ctx.rect(column.x, column.y, column.width, column.height + column.lineHeight);
    ctx.clip();

    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.fillStyle    = '#1c1612';
    ctx.textBaseline = 'alphabetic';

    for (let s = 0; s < slots; s++) {
      const y = column.y + column.lineHeight + s * column.lineHeight;
      if (y > column.y + column.height + column.lineHeight) break;

      const offset = offsets[s];
      // We need to draw words whose position in the ribbon falls within
      // [offset - wordMaxW, offset + column.width + wordMaxW] (with wrap).
      // Two passes: primary copy and wrap-around copy.

      for (let pass = 0; pass < 2; pass++) {
        const shift = pass === 0 ? 0 : totalWidth;
        // Ribbon window: words with wordLeft ∈ [offset - ..., offset + column.width]
        const winStart = offset - 60 + shift;

        // Find first word in window
        let wi = firstWordAt(winStart - 200);
        if (wi > 0) wi = Math.max(0, wi - 2); // step back a bit to be safe

        for (; wi < rawWords.length; wi++) {
          const wx = column.x + (wordLeft[wi] + shift) - offset;
          if (wx > column.x + column.width + 80) break;
          if (wx + wordW[wi] < column.x - 10) continue;
          ctx.fillText(rawWords[wi], wx, y);
        }
        // No second pass needed if totalWidth is much larger than column.width
        // but we do it for correctness when near the end of the ribbon
        if (totalWidth > column.width * 4) break;
      }
    }

    ctx.globalAlpha = 1;
    ctx.restore();

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
