jest.mock('react-native', () => {
  class NativeEventEmitter {
    addListener() { return { remove: jest.fn() }; }
  }
  return {
    NativeModules: { TdLibModule: {} },
    NativeEventEmitter,
  };
});

import TdLib from 'react-native-tdlib';
import { startTelegram } from '../src/telegram';

const credentials = { telegramApiId: '12345', telegramApiHash: 'a'.repeat(32) } as any;

beforeEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

test('starts TDLib when there is no existing native client', async () => {
  const getState = jest.spyOn(TdLib as any, 'getAuthorizationState')
    .mockRejectedValueOnce(new Error('client not initialized'))
    .mockResolvedValue('authorizationStateWaitPhoneNumber');
  const start = jest.spyOn(TdLib as any, 'startTdLib').mockResolvedValue('started');
  const onState = jest.fn();

  await startTelegram(credentials, jest.fn(), onState);

  expect(start).toHaveBeenCalledTimes(1);
  expect(start).toHaveBeenCalledWith({ api_id: 12345, api_hash: 'a'.repeat(32) });
  expect(getState).toHaveBeenCalledTimes(2);
  expect(onState).toHaveBeenCalledWith('phone');
});

test('reuses an already running TDLib client without starting it again', async () => {
  const getState = jest.spyOn(TdLib as any, 'getAuthorizationState').mockResolvedValue('authorizationStateWaitPhoneNumber');
  const start = jest.spyOn(TdLib as any, 'startTdLib').mockResolvedValue('started');

  await startTelegram(credentials, jest.fn(), jest.fn());

  expect(getState).toHaveBeenCalledTimes(1);
  expect(start).not.toHaveBeenCalled();
});
