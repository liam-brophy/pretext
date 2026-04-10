import { prepareWithSegments, layoutNextLine, type PreparedTextWithSegments, type LayoutCursor } from '@chenglou/pretext';
import { BODY_FONT, COLUMN } from '../setup';
import { PROSE } from '../prose';
import { drawJustified } from '../justify';

// ── Experiment: Organic Growing Tree ─────────────────────────────────────────
// The tree roots at the right edge of the column and grows upward + leftward.
// Branches are recursive quadratic beziers with seeded randomness and tapering
// stroke widths. Children start only when parent reaches 70% completion.
// At each line y, the leftmost branch point is found and used to narrow the
// available text width, leaving clear space between text and wood.

// ── Seeded PRNG (mulberry32) ──────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

interface Branch {
  sx: number; sy: number;
  cx: number; cy: number;   // quadratic bezier control point
  ex: number; ey: number;
  strokeWidth: number;
  t: number;           // growth progress 0 → 1
  speed: number;       // t/sec
  depth: number;
  children: Branch[];
}

const CANVAS_W = 576;
const CANVAS_H = 864;

// Tree root: right edge of text column, page bottom
const ROOT_X  = COLUMN.x + COLUMN.width;   // 504
const ROOT_Y  = CANVAS_H;                  // 864

const MAX_DEPTH   = 4;
const TRUNK_W     = 8;
const CHILD_START = 0.70;   // parent t before child begins
const TRUNK_SPEED = 0.04;   // t/sec for trunk
// Clearance added around each branch for text routing (px)
const TEXT_CLEARANCE = 22;

// angle = radians clockwise from straight-up (negative = leftward lean)
function buildBranch(
  rng: () => number,
  sx: number, sy: number,
  angle: number,
  length: number,
  depth: number,
  speed: number,
): Branch {
  // End point
  const endAngle = angle + (rng() - 0.5) * 0.6;
  const ex = sx + Math.sin(endAngle) * length;
  const ey = sy - Math.cos(endAngle) * length;

  // Control point: offset perpendicular to mid-direction for organic sway
  const midAngle = (angle + endAngle) / 2;
  const swayAmt  = length * (0.25 + rng() * 0.35);
  const swayDir  = midAngle + (rng() - 0.5) * 1.0;
  const mcx = (sx + ex) / 2 + Math.sin(swayDir) * swayAmt;
  const mcy = (sy + ey) / 2 - Math.cos(swayDir) * swayAmt;

  const b: Branch = {
    sx, sy, cx: mcx, cy: mcy, ex, ey,
    strokeWidth: TRUNK_W / Math.pow(2, depth * 0.85),
    t: 0,
    speed,
    depth,
    children: [],
  };

  if (depth < MAX_DEPTH) {
    const n           = depth === 0 ? 2 : (rng() > 0.4 ? 2 : 1);
    const childLen    = length * (0.52 + rng() * 0.22);
    const childSpeed  = speed * (1.05 + rng() * 0.25);
    const spreadBase  = 0.45 + rng() * 0.40;

    for (let i = 0; i < n; i++) {
      // First child spreads left (further into column), second less so
      const sign       = i === 0 ? -1 : 1;
      const childAngle = endAngle + sign * spreadBase * (0.7 + rng() * 0.4);
      b.children.push(buildBranch(rng, ex, ey, childAngle, childLen, depth + 1, childSpeed));
    }
  }
  return b;
}

function qPoint(b: Branch, t: number): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * b.sx + 2 * mt * t * b.cx + t * t * b.ex,
    mt * mt * b.sy + 2 * mt * t * b.cy + t * t * b.ey,
  ];
}

// ── Find leftmost branch x at a given y within ±tolerance ────────────────────
function minXAtY(b: Branch, targetY: number, tol: number, result: { x: number }) {
  if (b.t <= 0) return;
  const steps = 35;
  for (let i = 0; i <= steps; i++) {
    const st      = (i / steps) * b.t;
    const [bx, by] = qPoint(b, st);
    if (Math.abs(by - targetY) < tol) {
      const clearX = bx - b.strokeWidth - TEXT_CLEARANCE;
      if (clearX < result.x) result.x = clearX;
    }
  }
  for (const c of b.children) minXAtY(c, targetY, tol, result);
}

function updateBranch(b: Branch, dt: number, parentT: number) {
  if (parentT < CHILD_START) return;
  b.t = Math.min(1, b.t + b.speed * dt);
  for (const c of b.children) updateBranch(c, dt, b.t);
}

function drawBranch(ctx: CanvasRenderingContext2D, b: Branch) {
  if (b.t <= 0) return;
  const steps = 40;
  ctx.beginPath();
  ctx.moveTo(b.sx, b.sy);
  for (let i = 1; i <= steps; i++) {
    const [x, y] = qPoint(b, (i / steps) * b.t);
    ctx.lineTo(x, y);
  }
  ctx.lineWidth   = b.strokeWidth * (1 - b.t * 0.2); // slight taper as it grows
  ctx.strokeStyle = `rgba(36, 22, 8, ${0.88 - b.depth * 0.10})`;
  ctx.stroke();
  for (const c of b.children) drawBranch(ctx, c);
}

export function start(
  ctx: CanvasRenderingContext2D,
  _prepared: PreparedTextWithSegments | null,
  column: typeof COLUMN,
): () => void {
  const prepared = prepareWithSegments(PROSE, BODY_FONT);

  const rng   = mulberry32(0xf00dcafe);
  // Start with a slight leftward lean so branches enter the column
  const trunk = buildBranch(rng, ROOT_X, ROOT_Y, -0.18, 280, 0, TRUNK_SPEED);

  let lastTime = 0;
  let rafId    = 0;

  function frame(now: number) {
    const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.05) : 0;
    lastTime  = now;

    trunk.t = Math.min(1, trunk.t + trunk.speed * dt);
    for (const c of trunk.children) updateBranch(c, dt, trunk.t);

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // ── Draw tree ─────────────────────────────────────────────────────────────
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
    drawBranch(ctx, trunk);
    ctx.restore();

    // ── Layout text ───────────────────────────────────────────────────────────
    ctx.font         = BODY_FONT;
    ctx.textAlign    = 'left';
    ctx.fillStyle    = '#1c1612';
    ctx.textBaseline = 'alphabetic';

    let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };
    const bottom = column.y + column.height + column.lineHeight;
    const tol    = column.lineHeight * 0.65;

    for (let y = column.y + column.lineHeight; y <= bottom; y += column.lineHeight) {
      // Probe the tree at this y: find leftmost x (right-side boundary)
      const probe = { x: CANVAS_W + 1 }; // start beyond canvas — means no intrusion
      minXAtY(trunk, y - column.lineHeight * 0.3, tol, probe);

      // Clamp: intrusion only if the branch is inside the column
      const colRight    = column.x + column.width;
      const boundaryX   = Math.min(probe.x, colRight);
      const availW      = Math.max(0, boundaryX - column.x);

      if (availW < 60) {
        continue; // band blocked — skip without consuming text
      }

      const line = layoutNextLine(prepared, cursor, availW);
      if (!line) break;

      drawJustified(ctx, line.text, line.width, availW, column.x, y);
      cursor = line.end;
    }

    rafId = requestAnimationFrame(frame);
  }

  rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(rafId);
}
