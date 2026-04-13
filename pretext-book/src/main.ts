import './style.css';
import { canvas, ctx, COLUMN, BODY_FONT, resizeCanvas } from './setup';
import { prepareWithSegments, type PreparedTextWithSegments } from '@chenglou/pretext';
import { PROSE } from './prose';

// ── Experiment contract ───────────────────────────────────────────────────────
export interface Column {
  x: number; y: number; width: number; height: number; lineHeight: number;
}
type ExperimentModule = {
  start: (
    ctx:      CanvasRenderingContext2D,
    prepared: PreparedTextWithSegments | null,
    column:   Column,
    text?:    string,
  ) => () => void;
};

const EXPERIMENTS: Record<string, () => Promise<ExperimentModule>> = {
  snake:     () => import('./experiments/snake'),
  orb:       () => import('./experiments/orb'),
  redaction: () => import('./experiments/redaction'),
  footnote:  () => import('./experiments/footnote'),
  marquee:   () => import('./experiments/marquee'),
};

// ── Page state ────────────────────────────────────────────────────────────────
let currentExpName = 'snake';
let cancelCurrent: (() => void) | null = null;
let pagePrepared:  PreparedTextWithSegments | null = null;
let pageText       = PROSE;

// Live column — recomputed on page resize, passed fresh to each experiment
let pageColumn: Column = { ...COLUMN };

function computeColumn(cssW: number, cssH: number): Column {
  // Proportional margins: ~1/6 of width, ~1/12 of height, with sensible minimums
  const mx = Math.max(60, Math.round(cssW / 6));
  const my = Math.max(48, Math.round(cssH / 12));
  return { x: mx, y: my, width: cssW - mx * 2, height: cssH - my * 2, lineHeight: 26 };
}

// ── Experiment runner ─────────────────────────────────────────────────────────
async function loadExperiment(name: string) {
  currentExpName = name;
  if (cancelCurrent) { cancelCurrent(); cancelCurrent = null; }
  ctx.clearRect(0, 0, canvas.width / (window.devicePixelRatio || 1), canvas.height / (window.devicePixelRatio || 1));

  const mod = await EXPERIMENTS[name]();
  cancelCurrent = mod.start(ctx, pagePrepared, pageColumn, pageText);

  document.querySelectorAll<HTMLButtonElement>('#nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.exp === name);
  });
}

// ── Page colour ───────────────────────────────────────────────────────────────
function setPageColor(color: string) {
  canvas.style.background = color;
  const hex = document.getElementById('paper-hex');
  if (hex) hex.textContent = color;
}

// ── Corner radius ─────────────────────────────────────────────────────────────
function setCornerRadius(r: number) {
  canvas.style.borderRadius = `${r}px`;
}

// ── Page size ─────────────────────────────────────────────────────────────────
const PAGE_SIZES: Record<string, [number, number]> = {
  'book':   [576,  864],
  'pocket': [480,  672],
  'a5':     [560,  794],
  'letter': [816, 1056],
  'square': [600,  600],
};

async function setPageSize(key: string) {
  const [w, h] = PAGE_SIZES[key];
  resizeCanvas(w, h);
  pageColumn = computeColumn(w, h);
  document.querySelectorAll<HTMLElement>('.size-btn').forEach(el => {
    el.classList.toggle('active', el.dataset.size === key);
  });
  await loadExperiment(currentExpName);
}

// ── Text editor ───────────────────────────────────────────────────────────────
const overlay   = document.getElementById('text-overlay')!;
const textarea  = document.getElementById('text-area') as HTMLTextAreaElement;
const applyBtn  = document.getElementById('text-apply')!;
const cancelBtn = document.getElementById('text-cancel')!;
const editBtn   = document.getElementById('edit-text-btn')!;

editBtn.addEventListener('click', () => {
  textarea.value = pageText;
  overlay.classList.remove('hidden');
  textarea.focus();
});

cancelBtn.addEventListener('click', () => overlay.classList.add('hidden'));

overlay.addEventListener('click', e => {
  if (e.target === overlay) overlay.classList.add('hidden');
});

applyBtn.addEventListener('click', async () => {
  const newText = textarea.value.trim();
  if (!newText) return;
  overlay.classList.add('hidden');
  applyBtn.textContent = 'Preparing…';
  applyBtn.setAttribute('disabled', '');

  ctx.font = BODY_FONT;
  pagePrepared = prepareWithSegments(newText, BODY_FONT);
  pageText     = newText;

  await loadExperiment(currentExpName);
  applyBtn.textContent = 'Apply';
  applyBtn.removeAttribute('disabled');
});

// ── Wire controls ─────────────────────────────────────────────────────────────
const paperColorInput = document.getElementById('paper-color') as HTMLInputElement;
paperColorInput.addEventListener('input', () => setPageColor(paperColorInput.value));

const radiusSlider = document.getElementById('radius-slider') as HTMLInputElement;
const radiusVal    = document.getElementById('radius-val')!;
radiusSlider.addEventListener('input', () => {
  const v = Number(radiusSlider.value);
  setCornerRadius(v);
  radiusVal.textContent = `${v} px`;
});

document.querySelectorAll<HTMLElement>('.size-btn').forEach(el => {
  el.addEventListener('click', () => setPageSize(el.dataset.size!));
});

document.querySelectorAll<HTMLButtonElement>('#nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.exp;
    if (name) loadExperiment(name);
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
await document.fonts.ready;
ctx.font     = BODY_FONT;
pagePrepared = prepareWithSegments(pageText, BODY_FONT);
pageColumn   = computeColumn(576, 864);
loadExperiment('snake');
