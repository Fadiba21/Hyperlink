import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Controller } from '../controller';
import { Dial } from '../Dial';
import { Segmented } from '../Segmented';
import { errorMessage, money, price } from '../format';
import { getExchange, type Env, type ExchangeId, type Instrument, type MarketTicker } from '../exchanges';
import type { MarginMode } from '../domain';
import { qtyStepFor } from '../demo';
import { useLiveQuote } from '../liveFeed';
import { levelFromRoi, qtyForAllocation, roiAt, summarize } from '../orderMath';
import { baseTicker, toPair } from '../pairs';
import { CoinIcon, PairPicker, cachedCoinImage } from '../PairPicker';
import { useTheme } from '../theme';
import { Btn, Card, Field, Pill, Slider, Txt } from '../ui';

const showQty = (value: number) => Number.isFinite(value) && value > 0 ? value.toFixed(8).replace(/\.?0+$/, '') : '';
const numberOf = (text: string) => Number(text.trim().replace(',', '.'));
const DEMO_MAX_LEVERAGE = 100;
const COMMIT_MS = 80;
const fmtLevel = (v: number) => String(Number(v.toPrecision(8)));

/**
 * Slider with a labelled readout. The thumb and readout follow the finger from local state; the parent is told at most
 * every COMMIT_MS (and once on the last value), so the big order form is not re-rendered on every pixel of a drag.
 */
const LevelSlider = memo(function LevelSlider({ label, value, min, max, unit, format, color, hint, onCommit }: { label: string; value: number; min: number; max: number; unit: string; format?: (n: number) => string; color?: string; hint?: string; onCommit: (n: number) => void }) {
  const t = useTheme();
  const [local, setLocal] = useState(value);
  const live = useRef(false);
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<number | null>(null);
  const commitRef = useRef(onCommit); commitRef.current = onCommit;
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!live.current) setLocal(value); }, [value]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); if (idle.current) clearTimeout(idle.current); }, []);
  const flush = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (pending.current !== null) { const v = pending.current; pending.current = null; last.current = Date.now(); commitRef.current(v); }
  };
  const change = (n: number) => {
    live.current = true; setLocal(n); pending.current = n;
    const wait = COMMIT_MS - (Date.now() - last.current);
    if (wait <= 0) flush(); else if (!timer.current) timer.current = setTimeout(flush, wait);
    // the Slider has no release callback, so treat 220ms without movement as "released"
    if (idle.current) clearTimeout(idle.current);
    idle.current = setTimeout(() => { flush(); live.current = false; }, 220);
  };
  const text = local > 0 ? (format ? format(local) : `${local}${unit}`) : 'Off';
  return <View style={{ marginTop: 10 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <Txt variant="labelSmall" color={t.onSurfaceVariant}>{label}</Txt>
      <Txt variant="label" color={local > 0 ? color || t.onSurface : t.onSurfaceVariant}>{text}</Txt>
    </View>
    <Slider value={local} min={min} max={max} onChange={change} format={format} />
    {hint ? <Txt variant="labelSmall" color={t.onSurfaceVariant}>{hint}</Txt> : null}
  </View>;
});

type ManualOrderCardProps = {
  ctl: Controller;
  tickers: MarketTicker[];
  exchangeId: ExchangeId;
  env: Env;
  bottom: number;
  tickerLoading?: boolean;
  tickerError?: string;
  initialSymbol?: string;
  inSheet?: boolean;
};

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}><Txt variant="bodySmall" color={t.onSurfaceVariant}>{label}</Txt><Txt variant="label" color={color}>{value}</Txt></View>;
}

/**
 * Exchange-style manual order. LIVE: pairs, quotes, rules and streaming price come from the selected exchange.
 * DEMO: pairs and quotes come from CoinGecko (the paper account never touches an exchange).
 */
export function ManualOrderCard({ ctl, tickers, exchangeId, env, bottom, tickerLoading = false, tickerError = '', initialSymbol, inSheet = false }: ManualOrderCardProps) {
  const t = useTheme();
  const isDemo = ctl.settings.accountMode === 'demo';
  const exchange = useMemo(() => getExchange(exchangeId), [exchangeId]);
  const sourceLabel = isDemo ? 'CoinGecko' : exchange.label;
  const [symbol, setSymbol] = useState(() => initialSymbol ? toPair(initialSymbol) : isDemo ? ctl.settings.demoSymbol : '');
  const [pairPicker, setPairPicker] = useState(false);
  const [pickerUsed, setPickerUsed] = useState(false);
  const [side, setSide] = useState<'Buy' | 'Sell'>('Buy');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [marginMode, setMarginMode] = useState<MarginMode>(ctl.settings.marginMode);
  const [leverage, setLeverage] = useState(5);
  const [allocPct, setAllocPct] = useState(10);
  const [qtyManual, setQtyManual] = useState('');
  const [qtyDirty, setQtyDirty] = useState(false);
  const [limitPrice, setLimitPrice] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [instrumentError, setInstrumentError] = useState('');
  const [loadingInstrument, setLoadingInstrument] = useState(false);
  const [innerWidth, setInnerWidth] = useState(0);

  // Demo always prices from CoinGecko, so keep the paper engine on that source while this card is in use.
  useEffect(() => { if (isDemo && ctl.settings.demoPriceSource !== 'coingecko') ctl.patchSettings({ demoPriceSource: 'coingecko' }); }, [isDemo, ctl.settings.demoPriceSource, ctl.patchSettings]);

  // Live: first listed pair when nothing is chosen. Demo: keep the paper symbol. Never swap a market-originated symbol.
  useEffect(() => {
    if (initialSymbol) return;
    if (isDemo) { if (!symbol) setSymbol(ctl.settings.demoSymbol || 'BTCUSDT'); return; }
    if (!tickers.some((row) => row.symbol === symbol)) setSymbol(tickers[0]?.symbol || '');
  }, [tickers, symbol, exchangeId, env, initialSymbol, isDemo, ctl.settings.demoSymbol]);

  const ticker = tickers.find((row) => row.symbol === symbol);
  const streamed = useLiveQuote(exchangeId, env, symbol, !isDemo && Boolean(ticker));
  const demoTicker = ctl.tickers.find((row) => row.symbol === symbol);
  const demoQuote = ctl.prices[symbol] || demoTicker?.last || 0;
  const quote = isDemo ? demoQuote : streamed || ticker?.last || 0;
  const change24h = (isDemo ? demoTicker?.change24h : ticker?.change24h) || 0;
  const pairListed = isDemo ? Boolean(symbol) : Boolean(ticker);
  const available = isDemo ? ctl.demo.balance : Number(ctl.account?.available) || 0;
  const base = baseTicker(symbol || 'BTCUSDT');

  // Demo quotes: fetch immediately and keep fresh while the card is open.
  useEffect(() => {
    if (!isDemo || !symbol) return undefined;
    ctl.refreshPrices([symbol]);
    const id = setInterval(() => ctl.refreshPrices([symbol]), 20000);
    return () => clearInterval(id);
  }, [isDemo, symbol, ctl.refreshPrices]);

  // Live instrument rules (tick/step/min notional/max leverage).
  useEffect(() => {
    let active = true;
    setInstrument(null); setInstrumentError('');
    if (isDemo || !symbol || !ticker) { setLoadingInstrument(false); if (!isDemo && symbol && tickers.length > 0 && !ticker) setInstrumentError(`${symbol} tidak terdaftar sebagai pair perpetual aktif di ${exchange.label}.`); return () => { active = false; }; }
    setLoadingInstrument(true);
    exchange.instrument(env, symbol).then((value) => {
      if (!active) return;
      setInstrument(value);
      setLeverage((old) => Math.min(old, Math.max(1, value.maxLeverage || old)));
    }).catch((error) => { if (active) setInstrumentError(errorMessage(error)); }).finally(() => { if (active) setLoadingInstrument(false); });
    return () => { active = false; };
  }, [exchange, env, symbol, Boolean(ticker), tickers.length, isDemo]);

  const maxLeverage = isDemo ? DEMO_MAX_LEVERAGE : Math.max(1, instrument?.maxLeverage || 20);
  const step = isDemo ? qtyStepFor(quote || 1) : Number(instrument?.qtyStep) || 0;
  const entryRef = orderType === 'limit' && numberOf(limitPrice) > 0 ? numberOf(limitPrice) : quote;

  // Auto-size from the margin dial until the user types a quantity by hand (derived, so no second render pass).
  const autoQty = useMemo(() => showQty(qtyForAllocation(available, allocPct, leverage, entryRef, step)), [available, allocPct, leverage, entryRef, step]);
  const quantity = qtyDirty ? qtyManual : autoQty;

  useEffect(() => { setLimitPrice((cur) => (orderType === 'limit' && !cur && quote > 0 ? String(Number((quote * (side === 'Buy' ? 0.998 : 1.002)).toPrecision(8))) : cur)); }, [orderType, quote, side]);
  useEffect(() => { if (!isDemo) setOrderType('market'); }, [isDemo]);
  const firstMode = useRef(true);
  useEffect(() => {
    if (firstMode.current) { firstMode.current = false; return; }
    if (initialSymbol) return;
    setSymbol((cur) => (isDemo ? (cur || ctl.settings.demoSymbol) : (tickers.some((r) => r.symbol === cur) ? cur : '')));
    setQtyManual(''); setQtyDirty(false); setLimitPrice('');
  }, [isDemo]);

  const qty = numberOf(quantity) || 0;
  const sl = numberOf(stopLoss) || 0; const tp = numberOf(takeProfit) || 0;
  const sum = useMemo(() => summarize({ entry: entryRef, qty, leverage, side, sl: sl || undefined, tp: tp || undefined }), [entryRef, qty, leverage, side, sl, tp]);
  const slWrongSide = sl > 0 && entryRef > 0 && (side === 'Buy' ? sl >= entryRef : sl <= entryRef);
  const tpWrongSide = tp > 0 && entryRef > 0 && (side === 'Buy' ? tp <= entryRef : tp >= entryRef);
  const marginNeeded = sum.margin + sum.fee;
  const problems: string[] = [];
  if (!symbol) problems.push('Pilih pair.');
  else if (!pairListed) problems.push(`${symbol} tidak tersedia di ${sourceLabel}.`);
  if (!(entryRef > 0)) problems.push(`Menunggu harga ${sourceLabel}…`);
  if (!(qty > 0)) problems.push('Isi quantity atau putar dial margin.');
  if (!isDemo && instrument) {
    if (qty > 0 && qty < Number(instrument.minQty)) problems.push(`Qty minimum ${instrument.minQty}.`);
    if (sum.notional > 0 && sum.notional < instrument.minNotional) problems.push(`Nilai posisi minimum ${instrument.minNotional} USDT.`);
  }
  if (!isDemo && !(sl > 0)) problems.push('Stop Loss wajib untuk order Live.');
  if (slWrongSide) problems.push(`Stop Loss harus ${side === 'Buy' ? 'di bawah' : 'di atas'} harga entry.`);
  if (tpWrongSide) problems.push(`Take Profit harus ${side === 'Buy' ? 'di atas' : 'di bawah'} harga entry.`);
  if (available > 0 && marginNeeded > available * 1.0001) problems.push(`Margin $${money(marginNeeded)} melebihi saldo tersedia $${money(available)}.`);
  const ready = problems.length === 0;
  const sideColor = side === 'Buy' ? t.success : t.error;

  const reset = (next: string) => { setSymbol(next); setQtyManual(''); setQtyDirty(false); setLimitPrice(''); setStopLoss(''); setTakeProfit(''); };
  const submit = () => {
    if (!ready) return;
    if (isDemo) ctl.demoOpenManual(side === 'Buy' ? 'LONG' : 'SHORT', qty, leverage, marginMode, { orderType, entry: orderType === 'limit' ? limitPrice : undefined, stopLoss, takeProfit }, symbol);
    else ctl.openManualOrder({ symbol, side, quantity: qty, leverage, marginMode, stopLoss, takeProfit });
  };
  // Slider commits read the latest context through a ref so the callbacks stay stable (memoised sliders don't re-render).
  const ctx = useRef({ entryRef, side, leverage, quote });
  ctx.current = { entryRef, side, leverage, quote };
  const setLevel = useCallback((kind: 'tp' | 'sl', roi: number) => {
    const set = kind === 'tp' ? setTakeProfit : setStopLoss;
    if (!(roi > 0)) { set(''); return; }
    const c = ctx.current;
    const v = levelFromRoi(c.entryRef, c.side, c.leverage, roi, kind);
    if (v > 0) set(fmtLevel(v));
  }, []);
  const commitSl = useCallback((n: number) => setLevel('sl', n), [setLevel]);
  const commitTp = useCallback((n: number) => setLevel('tp', n), [setLevel]);
  const commitLimit = useCallback((n: number) => {
    const c = ctx.current;
    if (!(c.quote > 0) || !(n > 0)) return;
    setLimitPrice(fmtLevel(c.quote * (1 + (c.side === 'Buy' ? -n : n) / 1000)));
  }, []);
  const onLeverage = useCallback((v: number) => setLeverage(v), []);
  const onMargin = useCallback((v: number) => { setAllocPct(v); setQtyDirty(false); }, []);
  const fmtLev = useCallback((v: number) => `${v}×`, []);
  const fmtPct = useCallback((v: number) => `${v}%`, []);
  const slRoi = sl > 0 && entryRef > 0 ? Math.max(0, Math.round(-roiAt(entryRef, side, leverage, sl))) : 0;
  const tpRoi = tp > 0 && entryRef > 0 ? Math.max(0, Math.round(roiAt(entryRef, side, leverage, tp))) : 0;
  const limitOff = orderType === 'limit' && quote > 0 && numberOf(limitPrice) > 0 ? Math.max(0, Math.min(50, Math.round(Math.abs(numberOf(limitPrice) - quote) / quote * 1000))) : 0;
  const slMax = Math.max(5, Math.min(95, Math.floor(100 - leverage * 0.5) - 1));
  const dialSize = Math.max(112, Math.min(150, innerWidth > 0 ? (innerWidth - 10) / 2 : 130));
  const levColor = leverage >= 50 ? t.error : leverage >= 20 ? t.warning : t.primary;

  return <>
    {pickerUsed ? <PairPicker visible={pairPicker} onClose={() => setPairPicker(false)} onPick={(picked) => { reset(picked); setPairPicker(false); }} source={isDemo ? 'coingecko' : 'exchange'} exchangeId={exchangeId} env={env} active={symbol} bottom={bottom} /> : null}
    <Card tone="high" style={{ padding: inSheet ? 14 : 16, marginBottom: inSheet ? 4 : 12 }}>
      <View onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width)}>
        {/* header: pair, price, change */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Btn label={symbol ? `${base}/USDT` : tickerLoading ? 'Memuat…' : 'Pilih pair'} variant="tonal" icon="chevron" onPress={() => { setPickerUsed(true); setPairPicker(true); }} style={{ flexShrink: 1 }} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {!isDemo && streamed > 0 ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.success }} /> : null}
              <Txt variant="titleLarge" numberOfLines={1}>{quote > 0 ? `$${price(quote)}` : '—'}</Txt>
            </View>
            <Txt variant="labelSmall" color={change24h >= 0 ? t.success : t.error}>{quote > 0 ? `${change24h >= 0 ? '+' : ''}${(change24h * 100).toFixed(2)}% 24j` : ' '}</Txt>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <CoinIcon base={base} image={cachedCoinImage(base)} size={22} />
          <Pill label={isDemo ? 'DEMO' : 'LIVE'} tone={isDemo ? 'info' : 'warn'} />
          <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1} style={{ flex: 1 }}>Data {sourceLabel}{isDemo ? ' · akun simulasi' : env === 'mainnet' ? ' · uang asli' : ' · testnet'}</Txt>
          {loadingInstrument ? <ActivityIndicator size="small" color={t.primary} /> : null}
        </View>
        {tickerError && !isDemo ? <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 6 }}>{tickerError}</Txt> : null}
        {instrumentError ? <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 6 }}>{instrumentError}</Txt> : null}

        {/* side / margin mode / type */}
        <View style={{ marginTop: 14 }}>
          <Segmented<'Buy' | 'Sell'> value={side} onChange={setSide} height={46} options={[{ id: 'Buy', label: 'Buy / Long', color: t.success, textColor: t.onSuccess }, { id: 'Sell', label: 'Sell / Short', color: t.error, textColor: t.surface }]} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <View style={{ flex: 1 }}><Segmented<MarginMode> value={marginMode} onChange={setMarginMode} height={38} options={[{ id: 'Cross', label: 'Cross' }, { id: 'Isolated', label: 'Isolated' }]} /></View>
          <View style={{ flex: 1 }}><Segmented<'market' | 'limit'> value={orderType} onChange={setOrderType} height={38} options={[{ id: 'market', label: 'Market' }, { id: 'limit', label: 'Limit', disabled: !isDemo }]} /></View>
        </View>
        {!isDemo ? <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>Live memakai market order; proteksi SL dipasang lewat adapter exchange.</Txt> : null}
        {orderType === 'limit' ? <>
          <Field label="Harga limit" value={limitPrice} onChangeText={setLimitPrice} keyboardType="decimal-pad" helper={quote > 0 ? `Harga sekarang $${price(quote)} · ${side === 'Buy' ? 'di bawah' : 'di atas'} harga ini` : undefined} />
          <LevelSlider label={`Jarak dari harga sekarang (${side === 'Buy' ? 'di bawah' : 'di atas'})`} value={limitOff} min={1} max={50} unit="" format={(n) => `${(n / 10).toFixed(1)}%`} onCommit={commitLimit} />
        </> : null}

        {/* analog dials */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
          <View style={{ alignItems: 'center' }}>
            <Dial label="LEVERAGE" value={Math.min(leverage, maxLeverage)} min={1} max={maxLeverage} onChange={onLeverage} format={fmtLev} size={dialSize} color={levColor} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <Dial label="MARGIN" value={allocPct} min={1} max={100} onChange={onMargin} format={fmtPct} size={dialSize} />
          </View>
        </View>
        <Field label={`Quantity (${base})`} value={quantity} onChangeText={(v) => { setQtyManual(v); setQtyDirty(true); }} keyboardType="decimal-pad" helper={available > 0 ? `Saldo tersedia $${money(available)} · margin ${allocPct}% × ${leverage}×` : isDemo ? undefined : 'Sinkron akun di tab Posisi untuk mengisi qty otomatis.'} />

        {/* TP / SL with ROI shortcuts */}
        <View style={{ marginTop: 4 }}>
          <Field label={isDemo ? 'Stop Loss (opsional)' : 'Stop Loss (wajib)'} value={stopLoss} onChangeText={setStopLoss} keyboardType="decimal-pad" helper={sl > 0 && entryRef > 0 ? `ROI ${roiAt(entryRef, side, leverage, sl).toFixed(1)}%${sum.maxLoss !== null ? ` · rugi maks $${money(sum.maxLoss)}` : ''}` : undefined} />
          <LevelSlider label="Stop Loss · ROI rugi" value={slRoi} min={0} max={slMax} unit="% ROI" format={(n) => `−${n}% ROI`} color={t.error} onCommit={commitSl} />
          <Field label="Take Profit (opsional)" value={takeProfit} onChangeText={setTakeProfit} keyboardType="decimal-pad" helper={tp > 0 && entryRef > 0 ? `ROI +${roiAt(entryRef, side, leverage, tp).toFixed(1)}%${sum.maxProfit !== null ? ` · untung $${money(sum.maxProfit)}` : ''}` : undefined} />
          <LevelSlider label="Take Profit · ROI untung" value={tpRoi} min={0} max={300} unit="% ROI" format={(n) => `+${n}% ROI`} color={t.success} onCommit={commitTp} />
        </View>

        {/* summary */}
        <View style={{ marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: t.surfaceContainer }}>
          <Row label="Nilai posisi" value={sum.notional > 0 ? `$${money(sum.notional)}` : '—'} />
          <Row label="Margin dibutuhkan" value={sum.margin > 0 ? `$${money(sum.margin)}` : '—'} />
          <Row label="Perkiraan fee (taker 0,06%)" value={sum.fee > 0 ? `$${money(sum.fee)}` : '—'} />
          <Row label={`Likuidasi ≈ (${marginMode})`} value={sum.liq > 0 && sum.notional > 0 ? `$${price(sum.liq)}` : '—'} color={t.warning} />
          {sum.rr ? <Row label="Risk : Reward" value={`1 : ${sum.rr.toFixed(2)}`} color={sum.rr >= 1 ? t.success : t.warning} /> : null}
          {!isDemo && instrument ? <Row label={`Aturan ${exchange.label}`} value={`min ${instrument.minQty} · ≥ ${instrument.minNotional} USDT`} /> : null}
        </View>
        {problems.length > 0 && qty > 0 ? <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 8 }}>{problems[0]}</Txt> : null}
        <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>{isDemo ? 'Order Demo dieksekusi di akun simulasi dengan harga CoinGecko.' : 'Live tetap melewati aturan risiko dan satu langkah konfirmasi sebelum dikirim.'}</Txt>
        <Btn label={`${isDemo ? 'Tinjau' : 'Tinjau order LIVE'} ${side === 'Buy' ? 'LONG' : 'SHORT'}${isDemo ? ' Demo' : ''}${orderType === 'limit' ? ' · limit' : ''}`} icon={isDemo ? 'play' : 'bolt'} variant="filled" disabled={!ready} onPress={submit} style={ready ? { backgroundColor: sideColor } : undefined} />
      </View>
    </Card>
  </>;
}
