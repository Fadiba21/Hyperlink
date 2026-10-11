import { useCallback, useEffect } from 'react';
import { baseOf } from '../exchanges';
import { stopBackgroundMonitoring } from '../background';
import { activeAlerts, makeAlert } from '../alerts';
import { parseDemo, serializeDemo } from '../demo';
import { setCoinGeckoKey } from '../coingecko';
import { errorMessage, money } from '../format';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';
import type { AutomationPart } from './automation';
import type { ManagePart } from './manage';
import type { ReplayPart } from './replay';
import type { OrdersPart } from './orders';

export function useSafetyPart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart & AutomationPart & ManagePart & ReplayPart & OrdersPart) {
  const { credentials, setServiceOn, settingsRef, demoRef, pricesRef, demoDone, notify, alertUser, patchSettings, commitDemo, refreshPrices } = k;
  /* ---------- safety, alerts, backup ---------- */
  const setKillSwitch = useCallback((on: boolean) => {
    patchSettings({ safetyKill: on });
    if (on && settingsRef.current.automationOn) { stopBackgroundMonitoring(); setServiceOn(false); patchSettings({ automationOn: false }); }
    alertUser(on ? 'Kill-switch aktif · order Live baru diblokir, automation dijeda' : 'Kill-switch dimatikan', on ? 'error' : 'info');
  }, [patchSettings, alertUser]);

  const addPriceAlert = useCallback(async (symbol: string, target: number): Promise<boolean> => {
    try {
      await refreshPrices([symbol], true);
      const alert = makeAlert(symbol, target, pricesRef.current[symbol]);
      if (activeAlerts(settingsRef.current.alerts).length >= 30) throw new Error('Maksimal 30 alert aktif.');
      patchSettings({ alerts: [alert, ...settingsRef.current.alerts].slice(0, 50) });
      notify(`Alert ${baseOf(symbol)} ${alert.dir === 'above' ? '≥' : '≤'} $${money(target)} dipasang`, 'success');
      return true;
    } catch (error) { notify(errorMessage(error), 'error'); return false; }
  }, [refreshPrices, patchSettings, notify]);
  const removeAlert = useCallback((id: string) => patchSettings({ alerts: settingsRef.current.alerts.filter((a) => a.id !== id) }), [patchSettings]);

  const exportDemo = useCallback(() => serializeDemo(demoRef.current), []);
  const importDemo = useCallback((text: string): boolean => {
    try { commitDemo(parseDemo(text)); demoDone.current.clear(); notify('Akun demo dipulihkan dari backup', 'success'); return true; }
    catch (error) { notify(errorMessage(error), 'error'); return false; }
  }, [commitDemo, notify]);

  useEffect(() => { setCoinGeckoKey(credentials.coingeckoKey); }, [credentials.coingeckoKey]);

  return { setKillSwitch, addPriceAlert, removeAlert, exportDemo, importDemo };
}
export type SafetyPart = ReturnType<typeof useSafetyPart>;
