import { defaultSettings } from '../src/store';
import { isLiveAutoEntryEnabled } from '../src/safety';

test('Live auto-entry is off by default', () => {
  expect(defaultSettings.liveAutoEntry).toBe(false);
  expect(defaultSettings.automationOn).toBe(false);
});

test('Live auto-entry requires Live mode, automation, and its separate opt-in', () => {
  expect(isLiveAutoEntryEnabled({ accountMode: 'live', automationOn: true, liveAutoEntry: true })).toBe(true);
  expect(isLiveAutoEntryEnabled({ accountMode: 'demo', automationOn: true, liveAutoEntry: true })).toBe(false);
  expect(isLiveAutoEntryEnabled({ accountMode: 'live', automationOn: false, liveAutoEntry: true })).toBe(false);
  expect(isLiveAutoEntryEnabled({ accountMode: 'live', automationOn: true, liveAutoEntry: false })).toBe(false);
});
