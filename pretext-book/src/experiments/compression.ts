import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext';
import { BODY_FONT, COLUMN } from '../setup';
import { PROSE } from '../prose';
import { drawJustified } from '../justify';

// ── Experiment: Stopword Compression ─────────────────────────────────────────
// Every 3s, remove one stopword (not a proper noun) from the passage.
// Re-call prepareWithSegments and re-render. The text reflows naturally.
// A brief white flash marks the vacated position.

const REMOVAL_INTERVAL_MS = 3000;
const FLASH_DURATION_MS   = 300;

const STOPWORDS = new Set([
  'a','an','the','to','of','in','and','or','but','with','as','at','by',
  'for','from','is','it','its','was','on','that','this','be','are','were',
  'has','had','have','not','no','so','do','if','he','she','we','they',
  'his','her','their','there','then','than',
]);

// Token: either a word or a whitespace run
interface Token {
  text:     string;
  isSpace:  boolean;
  removed:  boolean;
}

function tokenize(text: string): Token[] {
  const parts = text.split(/(\s+)/);
  return parts.map(p => ({ text: p, isSpace: /^\s+$/.test(p), removed: false }));
}

function tokensToString(tokens: Token[]): string {
  return tokens.filter(t => !t.removed).map(t => t.text).join('');
}

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: typeof COLUMN,
): () => void {
  const tokens: Token[] = tokenize(PROSE);
  let prepared          = prepareWithSegments(PROSE, BODY_FONT);

  // Flash state: { timestamp } or null
  let flashAt: number | null = null;
  let lastRemovalTime        = performance.now();
  let rafId                  = 0;

  function removeNext(now: number) {
    // Find all removable word tokens (stopwords, not proper nouns)
    const candidates: number[] = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.isSpace || t.removed) continue;
      // Strip surrounding punctuation to get the bare word
      const bare = t.text.replace(/^[^a-zA-Z]+|[^a-zA-Z]+$/g, '').toLowerCase();
      if (!bare) continue;
      // Skip proper nouns (starts with capital)
      if (/^[A-Z]/.test(t.text.replace(/^[^a-zA-Z]+/, ''))) continue;
      if (STOPWORDS.has(bare)) candidates.push(i);
    }
    if (candidates.length === 0) return;

    // Remove the first remaining stopword occurrence
    const idx = candidates[0];
    tokens[idx].removed = true;

    // Also remove the adjacent whitespace that would double-up
    // Remove the space before the word if it exists
    if (idx > 0 && tokens[idx - 1].isSpace && !tokens[idx - 1].removed) {
      tokens[idx - 1].removed = true;
    } else if (idx + 1 < tokens.length && tokens[idx + 1].isSpace && !tokens[idx + 1].removed) {
      tokens[idx + 1].removed = true;
    }

    prepared   = prepareWithSegments(tokensToString(tokens), BODY_FONT);
    flashAt    = now;
    lastRemovalTime = now;
  }

  function frame(now: number) {
    if (now - lastRemovalTime >= REMOVAL_INTERVAL_MS) {
      removeNext(now);
    }

    ctx.clearRect(0, 0, 576, 864);

    // ── Flash overlay ─────────────────────────────────────────────────────────
    if (flashAt !== null) {
      const elapsed = now - flashAt;
      if (elapsed < FLASH_DURATION_MS) {
        const alpha = (1 - elapsed / FLASH_DURATION_MS) * 0.55;
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fillRect(column.x, column.y, column.width, column.height + column.lineHeight);
        ctx.restore();
      } else {
        flashAt = null;
      }
    }

    // ── Render text ───────────────────────────────────────────────────────────
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.fillStyle    = '#1c1612';
    ctx.textBaseline = 'alphabetic';

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y = column.y + column.lineHeight;
    const bottom = column.y + column.height + column.lineHeight;

    while (y <= bottom) {
      const line = layoutNextLine(prepared, cursor, column.width);
      if (!line) break;
      drawJustified(ctx, line.text, line.width, column.width, column.x, y);
      cursor = line.end;
      y     += column.lineHeight;
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
