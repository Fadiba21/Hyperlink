/** Dependency-free vector icons: shapes on a 24x24 grid rendered with plain Views. */
export type Shape =
  | { t: 'b'; x: number; y: number; w: number; h: number; r?: number; rot?: number }
  | { t: 'o'; x: number; y: number; w: number; h: number; r?: number; sw: number }
  | { t: 'c'; cx: number; cy: number; r: number }
  | { t: 'k'; cx: number; cy: number; r: number; sw: number }
  | { t: 'g'; cx: number; cy: number; r: number; sw: number; rot: number }
  | { t: 'tri'; x: number; y: number; w: number; h: number; d: 'u' | 'd' | 'l' | 'r' };

const bar = (x: number, y: number, w: number, h: number, r = 1, rot = 0): Shape => ({ t: 'b', x, y, w, h, r, rot });
const cross = (cx: number, cy: number, len: number, th = 2, r1 = 45): Shape[] => [bar(cx - th / 2, cy - len / 2, th, len, 1, r1), bar(cx - th / 2, cy - len / 2, th, len, 1, -r1)];

export const ICON_SHAPES = {
  home: [bar(3, 3, 8, 8, 2), bar(13, 3, 8, 5, 2), bar(13, 10, 8, 11, 2), bar(3, 13, 8, 8, 2)],
  signals: [bar(4, 13, 4, 7), bar(10, 8, 4, 12), bar(16, 4, 4, 16)],
  wallet: [{ t: 'o', x: 3, y: 6, w: 18, h: 13, r: 3, sw: 2 }, { t: 'c', cx: 16.5, cy: 12.5, r: 1.6 }, bar(3, 9, 12, 2, 1)],
  settings: [bar(3, 6, 18, 2), bar(3, 11, 18, 2), bar(3, 16, 18, 2), { t: 'c', cx: 8, cy: 7, r: 3.2 }, { t: 'c', cx: 16, cy: 12, r: 3.2 }, { t: 'c', cx: 10, cy: 17, r: 3.2 }],
  send: [{ t: 'tri', x: 3, y: 4, w: 19, h: 16, d: 'r' }],
  brain: [bar(11, 2, 2, 20), bar(2, 11, 20, 2), bar(11, 4.5, 2, 15, 1, 45), bar(11, 4.5, 2, 15, 1, -45)],
  exchange: [bar(3, 7, 15, 2), { t: 'tri', x: 16, y: 4, w: 6, h: 8, d: 'r' }, bar(6, 15, 15, 2), { t: 'tri', x: 2, y: 12, w: 6, h: 8, d: 'l' }],
  shield: [bar(5, 3, 14, 10, 2), { t: 'tri', x: 5, y: 11, w: 14, h: 10, d: 'd' }],
  bolt: [bar(12.5, 1.5, 4, 11, 1, 24), bar(7.5, 11.5, 4, 11, 1, 24), bar(8, 9.8, 9, 3.6, 1, 0)],
  play: [{ t: 'tri', x: 6, y: 4, w: 14, h: 16, d: 'r' }],
  pause: [bar(6, 4, 4, 16), bar(14, 4, 4, 16)],
  stop: [bar(5, 5, 14, 14, 2)],
  refresh: [{ t: 'g', cx: 12, cy: 12, r: 8, sw: 2.4, rot: 0 }, { t: 'tri', x: 15.5, y: 1.5, w: 8, h: 8, d: 'r' }],
  check: [bar(2.5, 12.5, 9, 2.6, 1.3, 45), bar(6, 11, 16, 2.6, 1.3, -50)],
  warning: [{ t: 'k', cx: 12, cy: 12, r: 9.5, sw: 2 }, bar(11, 6.5, 2, 7, 1), { t: 'c', cx: 12, cy: 16.8, r: 1.3 }],
  error: [{ t: 'k', cx: 12, cy: 12, r: 9.5, sw: 2 }, bar(11, 6.5, 2, 7, 1), { t: 'c', cx: 12, cy: 16.8, r: 1.3 }],
  info: [{ t: 'k', cx: 12, cy: 12, r: 9.5, sw: 2 }, { t: 'c', cx: 12, cy: 7.8, r: 1.3 }, bar(11, 10.5, 2, 7, 1)],
  close: cross(12, 12, 20),
  eye: [{ t: 'o', x: 1.5, y: 6, w: 21, h: 12, r: 6, sw: 2 }, { t: 'c', cx: 12, cy: 12, r: 3 }],
  eyeOff: [{ t: 'o', x: 1.5, y: 6, w: 21, h: 12, r: 6, sw: 2 }, { t: 'c', cx: 12, cy: 12, r: 3 }, bar(11, 1.5, 2, 21, 1, 45)],
  up: [bar(10.5, 9, 3, 12, 1), { t: 'tri', x: 4.5, y: 3, w: 15, h: 9, d: 'u' }],
  down: [bar(10.5, 3, 3, 12, 1), { t: 'tri', x: 4.5, y: 12, w: 15, h: 9, d: 'd' }],
  lock: [bar(5, 11, 14, 10, 3), { t: 'o', x: 8, y: 3, w: 8, h: 12, r: 4, sw: 2.2 }],
  unlock: [bar(5, 11, 14, 10, 3), { t: 'o', x: 11, y: 3, w: 8, h: 12, r: 4, sw: 2.2 }],
  fingerprint: [{ t: 'g', cx: 12, cy: 11.5, r: 9, sw: 1.8, rot: 0 }, { t: 'g', cx: 12, cy: 11.5, r: 6.3, sw: 1.8, rot: 45 }, { t: 'g', cx: 12, cy: 11.5, r: 3.5, sw: 1.8, rot: 90 }, bar(11, 12, 2, 8, 1), bar(7.5, 15, 1.8, 4, 1, -22), bar(14.7, 15, 1.8, 4, 1, 22)],
  delete: [bar(4, 6, 16, 2), bar(9, 3, 6, 3), { t: 'o', x: 6, y: 9, w: 12, h: 12, r: 2, sw: 2 }],
  channel: [bar(3, 9, 5, 6, 1), { t: 'tri', x: 8, y: 4.5, w: 13, h: 15, d: 'l' }],
  key: [{ t: 'k', cx: 7.5, cy: 12, r: 4.8, sw: 2.4 }, bar(12, 10.8, 10, 2.4), bar(17.5, 12.5, 2.4, 4), bar(13.5, 12.5, 2.4, 3)],
  logout: [{ t: 'o', x: 3, y: 3, w: 9, h: 18, r: 2, sw: 2 }, bar(9, 11, 11, 2), { t: 'tri', x: 16.5, y: 7.5, w: 6, h: 9, d: 'r' }],
  chevron: [bar(7.5, 4.2, 2.6, 10, 1.3, -40), bar(7.5, 9.8, 2.6, 10, 1.3, 40)],
  sync: [{ t: 'g', cx: 12, cy: 12, r: 8, sw: 2.4, rot: 0 }, { t: 'tri', x: 15.5, y: 1.5, w: 8, h: 8, d: 'r' }],
  inbox: [{ t: 'o', x: 3, y: 4, w: 18, h: 16, r: 3, sw: 2 }, bar(3, 12.5, 18, 2)],
  add: [bar(11, 4, 2, 16), bar(4, 11, 16, 2)],
  remove: [bar(4, 11, 16, 2)],
  chart: [bar(4, 4, 2, 16), bar(4, 18, 17, 2), bar(8.5, 11, 3, 5, 1), bar(13, 7, 3, 9, 1), bar(17.5, 9, 3, 7, 1)],
  coin: [{ t: 'k', cx: 12, cy: 12, r: 9.5, sw: 2 }, bar(11, 5, 2, 14, 1), bar(8, 8, 8, 2, 1), bar(8, 14, 8, 2, 1)],
  clock: [{ t: 'k', cx: 12, cy: 12, r: 9.5, sw: 2 }, bar(11, 5, 2, 8, 1), bar(12, 11, 6, 2, 1, 35)],
  search: [{ t: 'k', cx: 10.5, cy: 10.5, r: 6.5, sw: 2.2 }, bar(15.5, 15.5, 7, 2.2, 1.1, 45)],
  layers: [{ t: 'tri', x: 3, y: 4, w: 18, h: 8, d: 'd' }, { t: 'tri', x: 3, y: 9, w: 18, h: 8, d: 'd' }, { t: 'tri', x: 3, y: 14, w: 18, h: 7, d: 'd' }],
  star: [bar(6.5, 6.5, 11, 11, 2), bar(6.5, 6.5, 11, 11, 2, 45), bar(10.8, 2, 2.4, 3, 1), bar(10.8, 19, 2.4, 3, 1)],
  trend: [bar(3, 16, 5, 2), bar(8, 12, 5, 2, 1, -35), bar(12, 8, 5, 2, 1, 35), bar(16, 5, 5, 2)],
  expand: [bar(3, 3, 7, 2), bar(3, 3, 2, 7), bar(14, 3, 7, 2), bar(19, 3, 2, 7), bar(3, 19, 7, 2), bar(3, 14, 2, 7), bar(14, 19, 7, 2), bar(19, 14, 2, 7)],
  bell: [{ t: 'o', x: 6, y: 4, w: 12, h: 12, r: 6, sw: 2 }, bar(4, 15, 16, 2.4, 1), { t: 'c', cx: 12, cy: 20, r: 1.9 }],
} as const satisfies Record<string, Shape[]>;
export type IconName = keyof typeof ICON_SHAPES;
