import { clamp } from './math';

export type PresentationMode = 'ascii' | 'solid' | 'hybrid' | 'tear' | 'glitch';
export interface Presentation {
  mode?: PresentationMode;
  progress?: number;
  amount?: number;
}
export const presentationModes: PresentationMode[] = ['ascii', 'solid', 'hybrid', 'tear', 'glitch'];
export function presentationCell(
  x: number,
  y: number,
  cols: number,
  rows: number,
  time: number,
  options: Presentation = {},
) {
  const mode = options.mode ?? 'ascii',
    progress = clamp(options.progress ?? 0),
    amount = clamp(options.amount ?? 0);
  const nx = x / cols,
    ny = y / rows;
  let sourceX = x,
    shift = 0,
    solid = mode === 'solid',
    lip = false,
    substitute = false;
  if (mode === 'hybrid')
    solid = clamp(nx * 0.52 + ny * 0.48 + Math.sin(x * 0.27 + y * 0.19) * 0.07) >= progress;
  if (mode === 'tear') {
    const seam = Math.abs(
      ny - (0.26 + 0.46 * Math.sin(nx * 5.2 + time * 1.05)) + Math.sin(nx * 17 + time * 2.8) * 0.05,
    );
    const field =
      0.5 +
      0.5 *
        Math.sin(nx * 9.1 + ny * 6.4 + time * 0.6) *
        Math.sin(ny * 12.8 - nx * 4.1 + time * 0.85);
    const cut = field * 0.32 + seam * 1.55 + Math.abs(nx - 0.5) * Math.abs(ny - 0.42) * 0.35;
    solid = cut < progress * 1.72;
    lip = Math.abs(cut - progress * 1.72) < 0.075 && progress > 0.07 && progress < 0.96;
    if (Math.sin(y * 0.73 + time * 29) + Math.sin(x * 0.19 + time * 8) > 1.68)
      shift = (Math.floor(time * 21 + y) % 5) - 2;
  }
  if (mode === 'glitch') {
    if (
      amount > 0.04 &&
      Math.sin(y * 1.63 + time * 31) + Math.sin(time * 9.1) > 1.92 - amount * 1.35
    )
      sourceX = clamp(x + Math.floor(Math.sin(y * 0.4 + time * 17) * 7), 0, cols - 1);
    substitute = amount > 0.18 && Math.sin(x * 0.91 + y * 0.37 + time * 47) > 1.04 - amount * 0.2;
  }
  sourceX = clamp(sourceX - shift, 0, cols - 1);
  return { sourceX, solid, lip, substitute };
}
