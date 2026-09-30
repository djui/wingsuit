/**
 * Suit textures: procedurally drawn presets plus a custom uploaded image.
 * The whole suit (body and wings) is UV-mapped onto one square texture, so
 * a flag or image reads across the wings.
 */
import * as THREE from 'three';

export interface SuitPreset {
  id: string;
  name: string;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

const SIZE = 1024;
const STORAGE_KEY = 'wingsuit.suit';
const CUSTOM_KEY = 'wingsuit.suit.custom';

function stripes(ctx: CanvasRenderingContext2D, size: number, colors: string[], vertical = false, count = colors.length): void {
  const w = size / count;
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    if (vertical) ctx.fillRect(i * w, 0, w + 1, size);
    else ctx.fillRect(0, i * w, size, w + 1);
  });
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function camo(ctx: CanvasRenderingContext2D, size: number, palette: string[], seed: number): void {
  const rnd = seeded(seed);
  ctx.fillStyle = palette[0];
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = palette[1 + Math.floor(rnd() * (palette.length - 1))];
    ctx.beginPath();
    const cx = rnd() * size;
    const cy = rnd() * size;
    const r = 40 + rnd() * 120;
    ctx.moveTo(cx + r, cy);
    for (let a = 0; a < Math.PI * 2; a += 0.5) {
      const rr = r * (0.6 + rnd() * 0.6);
      ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
}

function cross(ctx: CanvasRenderingContext2D, size: number, bg: string, fg: string, thickness: number, offset = 0.5): void {
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = fg;
  const t = size * thickness;
  ctx.fillRect(0, size * offset - t / 2, size, t);
  ctx.fillRect(size * 0.38 - t / 2, 0, t, size);
}

export const SUIT_PRESETS: SuitPreset[] = [
  {
    id: 'classic',
    name: 'Classic',
    draw: (ctx, s) => {
      ctx.fillStyle = '#d8321e';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#1e64d8';
      ctx.beginPath();
      ctx.moveTo(0, s * 0.35);
      ctx.lineTo(s, s * 0.15);
      ctx.lineTo(s, s * 0.85);
      ctx.lineTo(0, s * 0.65);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, s * 0.48, s, s * 0.04);
    },
  },
  {
    id: 'stripes',
    name: 'Racing stripes',
    draw: (ctx, s) => {
      ctx.fillStyle = '#111318';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#ffb454';
      ctx.fillRect(s * 0.42, 0, s * 0.06, s);
      ctx.fillRect(s * 0.52, 0, s * 0.06, s);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, s * 0.1, s, s * 0.03);
      ctx.fillRect(0, s * 0.87, s, s * 0.03);
    },
  },
  {
    id: 'neon',
    name: 'Neon',
    draw: (ctx, s) => {
      const g = ctx.createLinearGradient(0, 0, s, s);
      g.addColorStop(0, '#00f0ff');
      g.addColorStop(0.5, '#7b2cff');
      g.addColorStop(1, '#ff2d95');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 6;
      for (let i = 0; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(0, (i / 12) * s);
        ctx.lineTo(s, (i / 12) * s + s * 0.2);
        ctx.stroke();
      }
    },
  },
  {
    id: 'carbon',
    name: 'Carbon',
    draw: (ctx, s) => {
      ctx.fillStyle = '#1b1d22';
      ctx.fillRect(0, 0, s, s);
      ctx.fillStyle = '#2b2e35';
      for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) ctx.fillRect(x, y, 8, 8);
      ctx.fillStyle = '#e63946';
      ctx.fillRect(0, s * 0.46, s, s * 0.08);
    },
  },
  { id: 'camo', name: 'Alpine camo', draw: (ctx, s) => camo(ctx, s, ['#3b4a3a', '#6b7a5a', '#232a22', '#8a9578'], 7) },
  { id: 'snowcamo', name: 'Snow camo', draw: (ctx, s) => camo(ctx, s, ['#e8ecf0', '#b8c2cc', '#7f8a96', '#ffffff'], 11) },
  { id: 'flag-ch', name: 'Switzerland', draw: (ctx, s) => cross(ctx, s, '#d52b1e', '#ffffff', 0.2) },
  { id: 'flag-no', name: 'Norway', draw: (ctx, s) => { cross(ctx, s, '#ba0c2f', '#ffffff', 0.22); cross(ctx, s, 'rgba(0,0,0,0)', '#00205b', 0.11); } },
  { id: 'flag-us', name: 'USA', draw: (ctx, s) => { stripes(ctx, s, Array.from({ length: 13 }, (_, i) => (i % 2 ? '#ffffff' : '#b22234'))); ctx.fillStyle = '#3c3b6e'; ctx.fillRect(0, 0, s * 0.4, s * (7 / 13)); ctx.fillStyle = '#fff'; for (let r = 0; r < 9; r++) for (let c = 0; c < (r % 2 ? 5 : 6); c++) { ctx.beginPath(); ctx.arc(s * 0.04 + c * s * 0.066 + (r % 2 ? s * 0.033 : 0), s * 0.03 + r * s * 0.06, s * 0.012, 0, Math.PI * 2); ctx.fill(); } } },
  { id: 'flag-de', name: 'Germany', draw: (ctx, s) => stripes(ctx, s, ['#000000', '#dd0000', '#ffce00']) },
  { id: 'flag-fr', name: 'France', draw: (ctx, s) => stripes(ctx, s, ['#0055a4', '#ffffff', '#ef4135'], true) },
  { id: 'flag-it', name: 'Italy', draw: (ctx, s) => stripes(ctx, s, ['#009246', '#ffffff', '#ce2b37'], true) },
  { id: 'flag-br', name: 'Brazil', draw: (ctx, s) => { ctx.fillStyle = '#009c3b'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#ffdf00'; ctx.beginPath(); ctx.moveTo(s / 2, s * 0.1); ctx.lineTo(s * 0.9, s / 2); ctx.lineTo(s / 2, s * 0.9); ctx.lineTo(s * 0.1, s / 2); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#002776'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.22, 0, Math.PI * 2); ctx.fill(); } },
  { id: 'flag-jp', name: 'Japan', draw: (ctx, s) => { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, s, s); ctx.fillStyle = '#bc002d'; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); ctx.fill(); } },
  { id: 'flag-za', name: 'South Africa', draw: (ctx, s) => { stripes(ctx, s, ['#de3831', '#ffffff', '#007a4d', '#ffffff', '#002395'], false); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 0.35, s / 2); ctx.lineTo(0, s); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ffb612'; ctx.beginPath(); ctx.moveTo(0, s * 0.12); ctx.lineTo(s * 0.28, s / 2); ctx.lineTo(0, s * 0.88); ctx.closePath(); ctx.fill(); } },
];

export interface SuitChoice {
  presetId: string;
  /** Data URL of a custom image, used when presetId === 'custom'. */
  customImage?: string;
}

export function loadSuitChoice(): SuitChoice {
  try {
    const presetId = localStorage.getItem(STORAGE_KEY) ?? 'classic';
    const customImage = localStorage.getItem(CUSTOM_KEY) ?? undefined;
    return { presetId, customImage };
  } catch {
    return { presetId: 'classic' };
  }
}

export function saveSuitChoice(choice: SuitChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice.presetId);
    if (choice.customImage) localStorage.setItem(CUSTOM_KEY, choice.customImage);
  } catch {
    /* quota or unavailable */
  }
}

/** Draws a preset (or custom image) into a canvas texture. */
export async function buildSuitTexture(choice: SuitChoice, existing?: THREE.CanvasTexture): Promise<THREE.CanvasTexture> {
  const canvas = existing?.image instanceof HTMLCanvasElement ? existing.image : document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, SIZE, SIZE);
  if (choice.presetId === 'custom' && choice.customImage) {
    const img = await loadImage(choice.customImage);
    // Cover-fit the image.
    const scale = Math.max(SIZE / img.width, SIZE / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
  } else {
    const preset = SUIT_PRESETS.find((p) => p.id === choice.presetId) ?? SUIT_PRESETS[0];
    preset.draw(ctx, SIZE);
  }
  // Subtle seam/panel lines so the suit does not read as a flat billboard.
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 3;
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((i / 8) * SIZE, 0);
    ctx.lineTo((i / 8) * SIZE, SIZE);
    ctx.stroke();
  }
  const tex = existing ?? new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Downscales an uploaded file to a data URL small enough for localStorage. */
export async function fileToDataUrl(file: File, max = 512): Promise<string> {
  const img = await loadImage(URL.createObjectURL(file));
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * scale);
  c.height = Math.round(img.height * scale);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed to load'));
    img.src = src;
  });
}

/** Small preview swatch for the menu. */
export function presetSwatch(preset: SuitPreset, size = 48): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  preset.draw(c.getContext('2d')!, size);
  return c;
}
