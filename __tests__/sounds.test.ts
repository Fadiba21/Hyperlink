jest.mock('react-native', () => ({
  NativeModules: { HyperlinkSounds: { play: jest.fn() } },
  Platform: { OS: 'android' },
}));

import { NativeModules } from 'react-native';
import { DEFAULT_SOUND_CONFIG, playUiSound, SOUND_TEMPLATES } from '../src/sounds';

test('uses DeafDeep by default and retains the existing templates', () => {
  expect(DEFAULT_SOUND_CONFIG).toEqual({ enabled: true, template: 'deafdeep', volume: 0.45 });
  expect(SOUND_TEMPLATES.map(({ id }) => id)).toEqual([
    'soft', 'crisp', 'wallet', 'deep', 'piano', 'harp', 'violin', 'cello', 'acoustic-guitar', 'deafdeep',
  ]);
});

test('exposes the user-provided sound pack with the exact DeafDeep label', () => {
  expect(SOUND_TEMPLATES.find(({ id }) => id === 'deafdeep')?.label).toBe('DeafDeep');
});

test.each(['piano', 'harp', 'violin', 'cello', 'acoustic-guitar', 'deafdeep'] as const)(
  'forwards %s to the native sound engine',
  (template) => {
    const play = NativeModules.HyperlinkSounds.play as jest.Mock;
    play.mockClear();
    playUiSound('confirm', { enabled: true, template, volume: 0.6 });
    expect(play).toHaveBeenCalledWith('confirm', template, 0.6);
  },
);
