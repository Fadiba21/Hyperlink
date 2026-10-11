import * as Keychain from 'react-native-keychain';
import { defaultSettings, loadState, saveState } from '../src/store';

const SERVICE = 'com.tradepilotnative.state';

describe('intro persistence', () => {
  beforeEach(async () => { await Keychain.resetGenericPassword({ service: SERVICE }); });

  test('a clean install gets first-run intro; pressing start persists it', async () => {
    const first = await loadState();
    expect(first.settings.introSeen).toBe(false);
    expect(first.settings.soundTemplate).toBe('deafdeep');
    await saveState({ ...first, settings: { ...first.settings, introSeen: true } });
    expect((await loadState()).settings.introSeen).toBe(true);
  });

  test('existing saved state without the new flag is treated as an existing install', async () => {
    await Keychain.setGenericPassword('state', JSON.stringify({ settings: { ...defaultSettings, accountMode: 'live' } }), { service: SERVICE });
    expect((await loadState()).settings.introSeen).toBe(true);
  });

  test('migrates a saved WND11 sound selection to DeafDeep', async () => {
    await Keychain.setGenericPassword('state', JSON.stringify({ settings: { ...defaultSettings, soundTemplate: 'wnd11' } }), { service: SERVICE });
    expect((await loadState()).settings.soundTemplate).toBe('deafdeep');
  });
});
