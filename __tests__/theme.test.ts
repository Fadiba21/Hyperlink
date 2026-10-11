import { getTheme } from '../src/theme';

test('Aurora theme provides distinct readable light and dark palettes', () => {
  const dark = getTheme(true, 'aurora');
  const light = getTheme(false, 'aurora');
  expect(dark.dark).toBe(true);
  expect(light.dark).toBe(false);
  expect(dark.primary).toBe('#76E0D2');
  expect(light.primary).toBe('#087D73');
  expect(dark.surface).not.toBe(light.surface);
});

test('Copper Studio theme is available in light and dark modes', () => {
  const dark = getTheme(true, 'copperStudio');
  const light = getTheme(false, 'copperStudio');
  expect(dark.primary).toBe('#F0B36B');
  expect(light.primary).toBe('#8E541E');
  expect(dark.surface).not.toBe(light.surface);
});
