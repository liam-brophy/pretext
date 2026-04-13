// ── Canvas ────────────────────────────────────────────────────────────────────
const DPR = window.devicePixelRatio || 1;

export const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Initial size: 576×864px (6×9 in at 96 dpi)
const CSS_W = 576;
const CSS_H = 864;

canvas.style.width  = `${CSS_W}px`;
canvas.style.height = `${CSS_H}px`;
canvas.width  = CSS_W * DPR;
canvas.height = CSS_H * DPR;

export const ctx = canvas.getContext('2d')!;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
ctx.textAlign    = 'left';
ctx.textBaseline = 'alphabetic';

// ── Resize helper ─────────────────────────────────────────────────────────────
// Call whenever the page dimensions change. Canvas resize resets the 2d
// context transform, so we reapply DPR scale + text defaults here.
export function resizeCanvas(cssW: number, cssH: number): void {
  canvas.style.width  = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
  canvas.width  = Math.round(cssW * DPR);
  canvas.height = Math.round(cssH * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
}

// ── Column ────────────────────────────────────────────────────────────────────
// Default column for the 6×9 page. main.ts recomputes this on resize and
// passes the live value to each experiment's start() call.
export const COLUMN = {
  x:          96,
  y:          72,
  width:      408,
  height:     720,
  lineHeight: 26,
} as const;

// ── Font ──────────────────────────────────────────────────────────────────────
export const BODY_FONT = '16px Lora';
