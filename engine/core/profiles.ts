export interface VisualProfile {
  id: string;
  cellWidth: number;
  minColumns: number;
  maxColumns: number;
  cellAspect: number;
  accent: [number, number, number];
  colour: boolean;
  densityPower: number;
  brightnessPower: number;
  edgeThreshold: number;
  exposure: number;
}
export const profiles: Record<string, VisualProfile> = {
  classic: {
    id: 'classic',
    cellWidth: 3.7,
    minColumns: 168,
    maxColumns: 390,
    cellAspect: 0.54,
    accent: [1, 0.075, 0.13],
    colour: false,
    densityPower: 0.73,
    brightnessPower: 0.49,
    edgeThreshold: 0.1,
    exposure: 1,
  },
  cinematic: {
    id: 'cinematic',
    cellWidth: 3.15,
    minColumns: 168,
    maxColumns: 520,
    cellAspect: 0.58,
    accent: [1, 0.3, 0.12],
    colour: true,
    densityPower: 0.75,
    brightnessPower: 0.49,
    edgeThreshold: 0.08,
    exposure: 1,
  },
  type: {
    id: 'type',
    cellWidth: 4,
    minColumns: 144,
    maxColumns: 420,
    cellAspect: 0.54,
    accent: [0.4, 0.73, 1],
    colour: false,
    densityPower: 0.73,
    brightnessPower: 0.49,
    edgeThreshold: 0.1,
    exposure: 1,
  },
};
export const glyphs = [
  ' ',
  '.',
  ',',
  ':',
  ';',
  'i',
  'l',
  't',
  'f',
  'x',
  'o',
  'O',
  '0',
  '#',
  '@',
  '|',
  '_',
  '/',
  '\\',
  '+',
  '*',
];
