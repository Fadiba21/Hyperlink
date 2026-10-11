import { useCallback } from 'react';
import { looksLikeCall } from '../signal';
import { getTelegramHistory, listTelegramChats, loginTelegram, logoutTelegram, refreshAuthState, startTelegram, verifyTelegramCode, verifyTelegramPassword } from '../telegram';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';

export function useTelegramPart(k: Core & ExchangePart & DemoPart & SignalsPart) {
  const { setSettings, setChatTitles, setStream, setChats, setAuthStep, credsRef, settingsRef, titlesRef, notify, run, patchSettings, analyzeText, pushStream, onIncoming } = k;
  /* ---------- Telegram ---------- */
  const loadChats = useCallback(async (quiet = false) => {
    await run('chats', async () => {
      const list = await listTelegramChats();
      setChats(list);
      setChatTitles((t) => { const next = { ...t }; list.forEach((c) => { next[String(c.id)] = c.title; }); return next; });
      if (!quiet) notify(list.length ? `${list.length} channel dimuat` : 'Belum ada channel', list.length ? 'success' : 'info');
    });
  }, [run, notify]);

  const connectTelegram = useCallback(async (quiet = false) => {
    await run('telegram', async () => {
      await startTelegram(credsRef.current, onIncoming, (step) => { setAuthStep(step); if (step === 'ready') { patchSettings({ telegramEnabled: true }); loadChats(true); } });
      if (!quiet) notify('Telegram siap · lanjut login', 'info');
    });
  }, [run, onIncoming, loadChats, notify, patchSettings]);

  const afterAuthSubmit = useCallback(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    try { const step = await refreshAuthState(); setAuthStep(step); if (step === 'ready') { patchSettings({ telegramEnabled: true }); loadChats(true); } } catch { /* event stream will update */ }
  }, [loadChats, patchSettings]);

  const sendPhone = useCallback(async (phone: string) => { await run('tg-auth', async () => { await loginTelegram(phone); setAuthStep('code'); notify('Kode dikirim · cek Telegram', 'info'); }); }, [run, notify]);
  const sendCode = useCallback(async (code: string) => { await run('tg-auth', async () => { await verifyTelegramCode(code); await afterAuthSubmit(); }); }, [run, afterAuthSubmit]);
  const sendPassword = useCallback(async (pw: string) => { await run('tg-auth', async () => { await verifyTelegramPassword(pw); await afterAuthSubmit(); }); }, [run, afterAuthSubmit]);
  const toggleChat = useCallback((id: number) => setSettings((s) => ({ ...s, selectedChatIds: s.selectedChatIds.includes(id) ? s.selectedChatIds.filter((x) => x !== id) : [...s.selectedChatIds, id] })), []);
  const disconnectTelegram = useCallback(async () => {
    await run('telegram', async () => { await logoutTelegram(); setAuthStep('closed'); setChats([]); patchSettings({ telegramEnabled: false, selectedChatIds: [] }); notify('Telegram keluar', 'info'); });
  }, [run, notify, patchSettings]);

  const scanHistory = useCallback(async () => {
    await run('scan', async () => {
      const ids = settingsRef.current.selectedChatIds;
      if (!ids.length) throw new Error('Pilih minimal satu channel terlebih dahulu.');
      let read = 0; let found = 0; let tried = 0;
      for (const id of ids) {
        const history = await getTelegramHistory(id, 40);
        read += history.length;
        for (const m of history) {
          if (found >= 8 || tried >= 20) break;
          if (!looksLikeCall(m.text)) continue;
          tried += 1;
          try { const r = await analyzeText(m.text, `${titlesRef.current[String(id)] || id} · riwayat`, m.date ? m.date * 1000 : undefined, false); found += 1; pushStream(m, false, `${r.symbol} ${r.direction}`); setStream((l) => l.map((x) => (x.id === `${m.chatId}:${m.messageId}` ? { ...x, result: 'accepted' } : x))); } catch { /* not a valid call */ }
        }
      }
      notify(`Scan selesai · ${found} call dari ${read} pesan`, found ? 'success' : 'info');
    });
  }, [run, analyzeText, notify, pushStream]);

  return { loadChats, connectTelegram, afterAuthSubmit, sendPhone, sendCode, sendPassword, toggleChat, disconnectTelegram, scanHistory };
}
export type TelegramPart = ReturnType<typeof useTelegramPart>;
