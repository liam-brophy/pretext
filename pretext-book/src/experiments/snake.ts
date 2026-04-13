import {
  prepareWithSegments, layoutNextLine,
  type PreparedTextWithSegments, type LayoutCursor,
} from '@chenglou/pretext';
import { BODY_FONT, canvas } from '../setup';
import { PROSE } from '../prose';
import { justifiedWordPositions } from '../justify';

// ── Experiment: Dragon / Creature ─────────────────────────────────────────────
// A segmented creature follows the mouse across the page. Each body segment
// trails the one in front with a spring, producing sinuous serpentine motion.
// Words near the creature are displaced radially away from each segment —
// characters ripple and part as the creature passes through them, then
// settle back when it moves on.

const SEGMENT_COUNT = 28;      // body segments
const SEGMENT_DIST  = 18;      // rest distance between segment centers (px)
const HEAD_R        = 13;      // head radius (px) — used for drawing + repulsion
const BODY_R_HEAD   = 11;      // segment radius at head
const BODY_R_TAIL   = 4;       // segment radius at tail
const REPULSE_DIST  = 52;      // how far each segment pushes text (px)
const MAX_DISP      = 36;      // maximum word displacement (px)
const LERP_FOLLOW   = 0.18;    // segment spring tightness (per frame, ~60fps)

// Creature colours — head to tail gradient
const HEAD_COLOR = '#2a1a08';
const SCALE_DARK = '#3d2510';
const SCALE_MID  = '#7a4a1a';
const SCALE_LITE = '#c8883a';

interface Segment { x: number; y: number; }

interface WordPos {
  word: string;
  ox: number;   // original justified x
  y:  number;   // baseline (fixed)
  w:  number;
}

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: import('../main').Column,
): () => void {
  const prepared = _prepared ?? prepareWithSegments(PROSE, BODY_FONT);

  // ── Pre-compute justified word positions ──────────────────────────────────
  ctx.font         = BODY_FONT;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';

  const allWords: WordPos[] = [];
  {
    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    let y      = column.y + column.lineHeight;
    const bot  = column.y + column.height + column.lineHeight;
    while (y <= bot) {
      const line = layoutNextLine(prepared, cursor, column.width);
      if (!line) break;
      for (const { word, x, w } of justifiedWordPositions(ctx, line.text, line.width, column.width, column.x)) {
        allWords.push({ word, ox: x, y, w });
      }
      cursor = line.end;
      y += column.lineHeight;
    }
  }

  // ── Creature state ────────────────────────────────────────────────────────
  // Initialise segments stacked at page centre bottom
  const cx0 = column.x + column.width / 2;
  const cy0 = column.y + column.height / 2;
  const segs: Segment[] = Array.from({ length: SEGMENT_COUNT }, (_, i) => ({
    x: cx0, y: cy0 + i * SEGMENT_DIST,
  }));

  // Target for the head: follows the mouse
  let mouseX = cx0;
  let mouseY = cy0;
  let dragging = false;

  // ── Input ─────────────────────────────────────────────────────────────────
  function toCanvasCoords(e: MouseEvent | TouchEvent): [number, number] {
    const rect   = canvas.getBoundingClientRect();
    const cssW   = rect.width;
    const cssH   = rect.height;
    // canvas logical size (pre-DPR)
    const logW   = canvas.width  / (window.devicePixelRatio || 1);
    const logH   = canvas.height / (window.devicePixelRatio || 1);
    const scaleX = logW / cssW;
    const scaleY = logH / cssH;
    let cx: number, cy: number;
    if ('touches' in e) {
      cx = (e.touches[0].clientX - rect.left) * scaleX;
      cy = (e.touches[0].clientY - rect.top)  * scaleY;
    } else {
      cx = (e.clientX - rect.left) * scaleX;
      cy = (e.clientY - rect.top)  * scaleY;
    }
    return [cx, cy];
  }

  function onMove(e: MouseEvent | TouchEvent) {
    if (!dragging && 'touches' in e) return;
    e.preventDefault();
    [mouseX, mouseY] = toCanvasCoords(e);
  }
  function onDown(e: MouseEvent | TouchEvent) {
    dragging = true;
    [mouseX, mouseY] = toCanvasCoords(e);
  }
  function onUp() { dragging = false; }

  canvas.addEventListener('mousemove',  onMove, { passive: false });
  canvas.addEventListener('mousedown',  onDown);
  canvas.addEventListener('mouseup',    onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false });
  canvas.addEventListener('touchmove',  onMove, { passive: false });
  canvas.addEventListener('touchend',   onUp);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function segRadius(i: number): number {
    const t = i / (SEGMENT_COUNT - 1);
    return BODY_R_HEAD + t * (BODY_R_TAIL - BODY_R_HEAD);
  }

  // Smoothstep falloff: 1 at 0, 0 at 1
  function falloff(d: number, maxD: number): number {
    const t = Math.min(1, d / maxD);
    return 1 - t * t * (3 - 2 * t);
  }

  // Colour lerp between two hex colours
  function lerpColor(a: string, b: string, t: number): string {
    const parse = (h: string) => [
      parseInt(h.slice(1,3),16),
      parseInt(h.slice(3,5),16),
      parseInt(h.slice(5,7),16),
    ];
    const [ar,ag,ab] = parse(a);
    const [br,bg,bb] = parse(b);
    return `rgb(${Math.round(ar+(br-ar)*t)},${Math.round(ag+(bg-ag)*t)},${Math.round(ab+(bb-ab)*t)})`;
  }

  function segColor(i: number): string {
    const t = i / (SEGMENT_COUNT - 1);
    if (t < 0.5) return lerpColor(HEAD_COLOR, SCALE_MID, t * 2);
    return lerpColor(SCALE_MID, SCALE_LITE, (t - 0.5) * 2);
  }

  // ── Draw one body segment as a rounded ellipse with scale texture ─────────
  function drawSegment(i: number, seg: Segment, prev: Segment | null) {
    const r = segRadius(i);
    const angle = prev ? Math.atan2(seg.y - prev.y, seg.x - prev.x) : 0;

    ctx.save();
    ctx.translate(seg.x, seg.y);
    ctx.rotate(angle + Math.PI / 2);

    // Main body ellipse
    const ew = r;
    const eh = r * 1.35;
    ctx.beginPath();
    ctx.ellipse(0, 0, ew, eh, 0, 0, Math.PI * 2);
    ctx.fillStyle = segColor(i);
    ctx.fill();

    // Scale highlight — small crescent arc near top of each segment
    if (r > 6) {
      ctx.beginPath();
      ctx.ellipse(0, -eh * 0.25, ew * 0.55, eh * 0.35, 0, Math.PI, Math.PI * 2);
      ctx.fillStyle = lerpColor(segColor(i), SCALE_DARK, 0.35);
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Draw head with eyes ───────────────────────────────────────────────────
  function drawHead(seg: Segment, next: Segment) {
    const angle = Math.atan2(seg.y - next.y, seg.x - next.x);
    ctx.save();
    ctx.translate(seg.x, seg.y);
    ctx.rotate(angle + Math.PI / 2);

    // Head shape — flattened ellipse
    ctx.beginPath();
    ctx.ellipse(0, 0, HEAD_R, HEAD_R * 1.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = HEAD_COLOR;
    ctx.fill();

    // Forehead highlight
    ctx.beginPath();
    ctx.ellipse(0, -HEAD_R * 0.3, HEAD_R * 0.55, HEAD_R * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = SCALE_DARK;
    ctx.fill();

    // Eyes
    const eyeOff = HEAD_R * 0.45;
    for (const ex of [-eyeOff, eyeOff]) {
      // Outer eye
      ctx.beginPath();
      ctx.arc(ex, -HEAD_R * 0.15, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#f0c050';
      ctx.fill();
      // Slit pupil
      ctx.beginPath();
      ctx.ellipse(ex, -HEAD_R * 0.15, 1.0, 2.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0a0502';
      ctx.fill();
    }

    // Tongue — forked, only when head is moving
    ctx.beginPath();
    ctx.moveTo(0, -HEAD_R * 1.1);
    ctx.lineTo(0, -HEAD_R * 1.55);
    ctx.moveTo(0, -HEAD_R * 1.45);
    ctx.lineTo(-4, -HEAD_R * 1.75);
    ctx.moveTo(0, -HEAD_R * 1.45);
    ctx.lineTo( 4, -HEAD_R * 1.75);
    ctx.strokeStyle = '#cc2020';
    ctx.lineWidth = 1.2;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.restore();
  }

  // ── Per-frame displacement of a single word ───────────────────────────────
  function wordDisplacement(wx: number, wy: number): [number, number] {
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < SEGMENT_COUNT; i++) {
      const seg = segs[i];
      const ddx = wx - seg.x;
      const ddy = wy - seg.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist < REPULSE_DIST && dist > 0.01) {
        const push  = falloff(dist, REPULSE_DIST) * MAX_DISP * (1 - i / SEGMENT_COUNT * 0.5);
        dx += (ddx / dist) * push;
        dy += (ddy / dist) * push;
      }
    }
    // Clamp total displacement
    const mag = Math.sqrt(dx * dx + dy * dy);
    if (mag > MAX_DISP) { dx = dx / mag * MAX_DISP; dy = dy / mag * MAX_DISP; }
    return [dx, dy];
  }

  // ── Render loop ───────────────────────────────────────────────────────────
  const logW = () => canvas.width  / (window.devicePixelRatio || 1);
  const logH = () => canvas.height / (window.devicePixelRatio || 1);

  let rafId = 0;

  function frame() {
    // ── Update segment chain ──────────────────────────────────────────────
    // Head chases mouse
    segs[0].x += (mouseX - segs[0].x) * LERP_FOLLOW * 1.6;
    segs[0].y += (mouseY - segs[0].y) * LERP_FOLLOW * 1.6;

    // Each subsequent segment follows the one in front, maintaining SEGMENT_DIST
    for (let i = 1; i < SEGMENT_COUNT; i++) {
      const prev = segs[i - 1];
      const cur  = segs[i];
      const ddx  = cur.x - prev.x;
      const ddy  = cur.y - prev.y;
      const dist = Math.sqrt(ddx * ddx + ddy * ddy);
      if (dist > SEGMENT_DIST) {
        const excess = (dist - SEGMENT_DIST) / dist;
        cur.x -= ddx * excess * LERP_FOLLOW * 3.5;
        cur.y -= ddy * excess * LERP_FOLLOW * 3.5;
      }
    }

    ctx.clearRect(0, 0, logW(), logH());

    // ── Draw text with per-word displacement ──────────────────────────────
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle    = '#1c1612';

    for (const { word, ox, y, w: _w } of allWords) {
      // Use word horizontal centre for distance calculation
      const [ddx, ddy] = wordDisplacement(ox, y - 8);
      ctx.fillText(word, ox + ddx, y + ddy);
    }

    // ── Draw body segments back → front ──────────────────────────────────
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Draw a spine line connecting all segments
    ctx.beginPath();
    ctx.moveTo(segs[0].x, segs[0].y);
    for (let i = 1; i < SEGMENT_COUNT; i++) ctx.lineTo(segs[i].x, segs[i].y);
    ctx.strokeStyle = SCALE_DARK;
    ctx.lineWidth   = 3;
    ctx.stroke();

    // Segments from tail to head so head renders on top
    for (let i = SEGMENT_COUNT - 1; i >= 1; i--) {
      drawSegment(i, segs[i], segs[i - 1]);
    }
    drawHead(segs[0], segs[1]);

    ctx.restore();

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener('mousemove',  onMove);
    canvas.removeEventListener('mousedown',  onDown);
    canvas.removeEventListener('mouseup',    onUp);
    canvas.removeEventListener('touchstart', onDown);
    canvas.removeEventListener('touchmove',  onMove);
    canvas.removeEventListener('touchend',   onUp);
  };
}
