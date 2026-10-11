import { useCallback } from 'react';
import { PermissionsAndroid, Platform } from 'react-native';
import { startBackgroundMonitoring, stopBackgroundMonitoring } from '../background';
import { errorMessage } from '../format';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';

export function useAutomationPart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart) {
  const { authStep, setServiceOn, settingsRef, notify, patchSettings, connectTelegram } = k;
  /* ---------- background service / automation ---------- */
  const setAutomation = useCallback(async (on: boolean) => {
    try {
      if (on) {
        if (!settingsRef.current.selectedChatIds.length) throw new Error('Pilih minimal satu channel Telegram di Pengaturan.');
        if (Platform.OS === 'android' && Number(Platform.Version) >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        startBackgroundMonitoring();
        setServiceOn(true);
        patchSettings({ automationOn: true });
        if (authStep === 'idle' || authStep === 'closed') connectTelegram(true);
        notify(settingsRef.current.accountMode === 'demo' && settingsRef.current.demoAutoEntry ? 'Automation aktif · call masuk ke Demo' : settingsRef.current.accountMode === 'live' && settingsRef.current.liveAutoEntry ? 'Automation aktif · auto-entry Live diizinkan sesuai pengaman aktif' : 'Automation aktif · auto-entry Live mati', 'success');
      } else {
        stopBackgroundMonitoring(); setServiceOn(false); patchSettings({ automationOn: false });
        notify('Automation dijeda', 'info');
      }
    } catch (error) { notify(errorMessage(error), 'error'); patchSettings({ automationOn: false }); }
  }, [authStep, connectTelegram, notify, patchSettings, setServiceOn, settingsRef]);

  return { setAutomation };
}
export type AutomationPart = ReturnType<typeof useAutomationPart>;
