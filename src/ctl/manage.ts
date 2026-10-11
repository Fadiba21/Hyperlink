import { useCallback } from 'react';
import { Alert } from 'react-native';
import { baseOf, getExchange, type OpenOrder, type Position as ExPosition } from '../exchanges';
import { activeKeys } from '../security';
import { writeBlock } from '../safety';
import { closeQty, toTpSl, validateTpSl } from '../manage';
import { errorMessage } from '../format';
import type { Core } from './core';
import type { ExchangePart } from './exchange';
import type { DemoPart } from './demo';
import type { SignalsPart } from './signals';
import type { TelegramPart } from './telegram';
import type { AutomationPart } from './automation';

export function useManagePart(k: Core & ExchangePart & DemoPart & SignalsPart & TelegramPart & AutomationPart) {
  const { positions, setOpenOrders, setHistory, credsRef, settingsRef, notify, run, syncAccount, loadInstrument } = k;
  /* ---------- manage live positions ---------- */
  const confirm = (title: string, body: string, destructive: boolean, ok: string) => new Promise<boolean>((resolve) => {
    Alert.alert(title, body, [{ text: 'Batal', style: 'cancel', onPress: () => resolve(false) }, { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) }], { cancelable: true, onDismiss: () => resolve(false) });
  });

  const guardWrite = useCallback((): boolean => { const why = writeBlock(settingsRef.current); if (why) { notify(why, 'error'); return false; } return true; }, [notify]);

  const closeLivePosition = useCallback(async (pos: ExPosition, pct = 100) => {
    if (!guardWrite()) return;
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    const live = keys.env === 'mainnet';
    if (!(await confirm(`${pct >= 100 ? 'Tutup' : `Tutup ${pct}%`} ${pos.symbol} ${pos.side}?`, `Order market reduce-only di ${ex.label}${live ? ' (LIVE · uang asli)' : ''}.`, true, 'Tutup'))) return;
    await run(`close-${pos.symbol}-${pos.side}`, async () => {
      const inst = await loadInstrument(pos.symbol);
      const qty = closeQty(pos.size, pct, inst.qtyStep);
      await ex.closePosition(keys, pos, qty);
      notify(`${pos.symbol} ${pct >= 100 ? 'ditutup' : `ditutup ${pct}%`}`, 'success');
      setTimeout(() => syncAccount(true), 1200);
    });
  }, [run, notify, syncAccount, loadInstrument, guardWrite]);

  const closeAllLive = useCallback(async () => {
    if (!guardWrite()) return;
    const list = [...positions];
    if (!list.length) return;
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    if (!(await confirm(`Tutup SEMUA ${list.length} posisi?`, `Order market reduce-only di ${ex.label}${keys.env === 'mainnet' ? ' (LIVE · uang asli)' : ''}.`, true, 'Tutup semua'))) return;
    await run('close-all', async () => {
      const failed: string[] = [];
      for (const p of list) { try { await ex.closePosition(keys, p); } catch (e) { failed.push(`${p.symbol}: ${errorMessage(e)}`); } }
      notify(failed.length ? `Sebagian gagal — ${failed.join(' | ')}` : `${list.length} posisi ditutup.`, failed.length ? 'error' : 'success');
      setTimeout(() => syncAccount(true), 1200);
    });
  }, [positions, run, notify, syncAccount, guardWrite]);

  /** Sets/changes/removes SL & TP of a live position. Empty = keep, 0 = remove. */
  const setLiveTpSl = useCallback(async (pos: ExPosition, input: { stopLoss: string; takeProfit: string }): Promise<boolean> => {
    if (!guardWrite()) return false;
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    let ok = false;
    await run(`tpsl-${pos.symbol}-${pos.side}`, async () => {
      const inst = await loadInstrument(pos.symbol);
      const patch = toTpSl(input, inst.tickSize);
      if (!patch.stopLoss && !patch.takeProfit) throw new Error('Isi SL dan/atau TP (isi 0 untuk menghapus).');
      const mark = Number(pos.markPrice) || (await ex.lastPrice(keys.env, pos.symbol));
      const err = validateTpSl(pos.side, mark, { stopLoss: Number(pos.stopLoss) || undefined, takeProfit: Number(pos.takeProfit) || undefined }, { stopLoss: patch.stopLoss === undefined ? undefined : Number(patch.stopLoss), takeProfit: patch.takeProfit === undefined ? undefined : Number(patch.takeProfit) });
      if (err) throw new Error(err);
      await ex.setTpSl(keys, pos, patch);
      ok = true;
      notify(`SL/TP ${pos.symbol} diperbarui`, 'success');
      setTimeout(() => syncAccount(true), 1200);
    });
    return ok;
  }, [run, notify, syncAccount, loadInstrument, guardWrite]);

  const cancelLiveOrder = useCallback(async (order: OpenOrder) => {
    if (!guardWrite()) return;
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    if (!(await confirm(`Batalkan order ${baseOf(order.symbol)}?`, `${order.side === 'Buy' ? 'Beli' : 'Jual'} ${order.qty} @ ${order.price || 'market'} di ${ex.label}.`, true, 'Batalkan order'))) return;
    await run(`cancel-${order.id}`, async () => {
      await ex.cancelOrder(keys, order);
      setOpenOrders((list) => list.filter((x) => x.id !== order.id));
      notify(`Order ${baseOf(order.symbol)} dibatalkan`, 'success');
      setTimeout(() => syncAccount(true), 800);
    });
  }, [run, notify, syncAccount, guardWrite]);

  const setLiveLeverage = useCallback(async (pos: ExPosition, leverage: number): Promise<boolean> => {
    if (!guardWrite()) return false;
    const c = credsRef.current; const ex = getExchange(c.exchange); const keys = activeKeys(c);
    let ok = false;
    await run(`lev-${pos.symbol}-${pos.side}`, async () => {
      const inst = await loadInstrument(pos.symbol);
      if (!Number.isInteger(leverage) || leverage < 1 || leverage > inst.maxLeverage) throw new Error(`Leverage harus 1–${inst.maxLeverage}x untuk ${pos.symbol}.`);
      if (!(await confirm(`Ubah leverage ${pos.symbol} ke ${leverage}x?`, `Leverage lebih tinggi memperdekat harga likuidasi.${keys.env === 'mainnet' ? ' (LIVE · uang asli)' : ''}`, leverage > Number(pos.leverage), 'Ubah'))) return;
      await ex.setLeverage(keys, pos, leverage);
      ok = true;
      notify(`${baseOf(pos.symbol)} leverage ${leverage}x`, 'success');
      setTimeout(() => syncAccount(true), 1000);
    });
    return ok;
  }, [run, notify, syncAccount, loadInstrument, guardWrite]);

  const loadHistory = useCallback(async () => {
    await run('history', async () => { const c = credsRef.current; setHistory(await getExchange(c.exchange).closedTrades(activeKeys(c))); });
  }, [run]);

  return { confirm, guardWrite, closeLivePosition, closeAllLive, setLiveTpSl, cancelLiveOrder, setLiveLeverage, loadHistory };
}
export type ManagePart = ReturnType<typeof useManagePart>;
