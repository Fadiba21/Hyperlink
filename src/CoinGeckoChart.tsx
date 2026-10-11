import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { C_BOLL, C_EMA, C_MA25, C_MA7, C_VWAP, ChartCanvas, type ChartKind, type CrossPoint, type Indicators } from './ChartCanvas';
import { windowStats } from './chartMath';
import { useChartContext } from './chartContext';
import { DepthSheet } from './Depth';
import { CoinIcon, PairPicker, cachedCoinImage } from './PairPicker';
import { Segmented } from './Segmented';
import { baseTicker, chartLevels, toPair, windowRange } from './pairs';
import { coinGeckoCandles, coinGeckoLivePrices, coinGeckoUniverse, compactUsd, type CoinGeckoCoin } from './coingecko';
import type { Candle } from './domain';
import { price as fmtPrice } from './format';
import { getExchange, type CandleInterval, type Env, type ExchangeId } from './exchanges';
import { useLiveQuote } from './liveFeed';
import { useTheme } from './theme';
import { BottomSheet, Btn, Icon, Pill, Press, Txt, type IconName } from './ui';

type PriceSource = 'coingecko' | 'exchange';
type CoinGeckoRange = '24h' | '7d' | '14d' | '30d' | '90d' | '180d' | '365d';
type ChartPreset = { id: string; label: string; short: string; interval?: CandleInterval; range?: CoinGeckoRange; windowMs: number };
const D = 86400000;
const CG_PRESETS: ChartPreset[] = [
  { id: '24h', label: '24 jam', short: '24J', range: '24h', windowMs: D },
  { id: '7d', label: '7 hari', short: '7H', range: '7d', windowMs: 7 * D },
  { id: '14d', label: '14 hari', short: '14H', range: '14d', windowMs: 14 * D },
  { id: '30d', label: '30 hari', short: '1B', range: '30d', windowMs: 30 * D },
  { id: '90d', label: '3 bulan', short: '3B', range: '90d', windowMs: 90 * D },
  { id: '180d', label: '6 bulan', short: '6B', range: '180d', windowMs: 180 * D },
  { id: '365d', label: '1 tahun', short: '1T', range: '365d', windowMs: 365 * D },
];
const EXCHANGE_PRESETS: ChartPreset[] = [
  { id: '1m', label: '1 menit', short: '1m', interval: '1m', windowMs: 6 * 3600000 },
  { id: '3m', label: '3 menit', short: '3m', interval: '3m', windowMs: 12 * 3600000 },
  { id: '5m', label: '5 menit', short: '5m', interval: '5m', windowMs: 24 * 3600000 },
  { id: '15m', label: '15 menit', short: '15m', interval: '15m', windowMs: 7 * D },
  { id: '30m', label: '30 menit', short: '30m', interval: '30m', windowMs: 14 * D },
  { id: '1h', label: '1 jam', short: '1J', interval: '1h', windowMs: 30 * D },
  { id: '2h', label: '2 jam', short: '2J', interval: '2h', windowMs: 60 * D },
  { id: '4h', label: '4 jam', short: '4J', interval: '4h', windowMs: 90 * D },
  { id: '12h', label: '12 jam', short: '12J', interval: '12h', windowMs: 180 * D },
  { id: '1d', label: '1 hari', short: '1H', interval: '1d', windowMs: 365 * D },
  { id: '1w', label: '1 minggu', short: '1M', interval: '1w', windowMs: 365 * D },
];
async function requestCandles(source: PriceSource, exchangeId: ExchangeId, env: Env, symbol: string, preset: ChartPreset, force = false): Promise<Candle[]> {
  if (source === 'coingecko') return coinGeckoCandles(symbol, preset.range || '24h', force);
  return getExchange(exchangeId).candles(env, symbol, Date.now() - preset.windowMs, preset.interval || '1h');
}

const DEFAULT_COUNT = 70;
const INLINE_H = 300;

function Tool({ icon, label, active, onPress }: { icon: IconName; label?: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Press onPress={onPress} radius={12}><View style={{ height: 34, minWidth: 34, paddingHorizontal: label ? 10 : 0, borderRadius: 12, backgroundColor: active ? t.secondaryContainer : t.surfaceHigh, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name={icon} size={16} color={active ? t.onSecondaryContainer : t.onSurfaceVariant} />{label ? <Txt variant="labelSmall" color={active ? t.onSecondaryContainer : t.onSurface}>{label}</Txt> : null}</View></Press>;
}
function Toggle({ label, color, active, onPress }: { label: string; color?: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return <Press onPress={onPress} radius={16}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 13, borderRadius: 16, backgroundColor: active ? t.secondaryContainer : t.surfaceHigh, borderWidth: active ? 0 : 1, borderColor: t.outlineVariant }}>{color ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} /> : null}<Txt variant="label" color={active ? t.onSecondaryContainer : t.onSurface}>{label}</Txt></View></Press>;
}
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useTheme();
  return <View style={{ flex: 1, minWidth: 0 }}><Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{label}</Txt><Txt variant="label" color={color} numberOfLines={1}>{value}</Txt></View>;
}
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export function MarketChart({ symbol, lastPrice, source: sourceProp, exchangeId, env, bottom = 0, onSymbolChange, onSourceChange }: {
  symbol: string; lastPrice: number; source: PriceSource; exchangeId: ExchangeId; env: Env; bottom?: number; onSymbolChange?: (symbol: string) => void; onSourceChange?: (source: PriceSource) => void;
}) {
  const t = useTheme();
  const { height: screenH } = useWindowDimensions();
  const chartCtx = useChartContext();
  const [source, setSource] = useState<PriceSource>(sourceProp);
  const [activeSymbol, setActiveSymbol] = useState(symbol);
  const [presetId, setPresetId] = useState(sourceProp === 'exchange' ? '1h' : '24h');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [quote, setQuote] = useState(lastPrice);
  const [loading, setLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [candleError, setCandleError] = useState('');
  const [assetPicker, setAssetPicker] = useState(false);
  const [indSheet, setIndSheet] = useState(false);
  const [depthOpen, setDepthOpen] = useState(false);
  const [full, setFull] = useState(false);
  const [kind, setKind] = useState<ChartKind>('candle');
  const [ind, setInd] = useState<Indicators>({ ma: false, ema: false, boll: false, vwap: false, vol: true, rsi: false, macd: false });
  const [showLevels, setShowLevels] = useState(true);
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [offset, setOffset] = useState(0);
  const [cross, setCross] = useState<CrossPoint>(null);
  const [alertText, setAlertText] = useState('');
  const [coin, setCoin] = useState<CoinGeckoCoin | null>(null);
  const toggleInd = (k: keyof Indicators) => setInd((o) => ({ ...o, [k]: !o[k] }));
  const presets = source === 'exchange' ? EXCHANGE_PRESETS : CG_PRESETS;
  const preset = presets.find((p) => p.id === presetId) || presets[0];
  const provider = source === 'exchange' ? getExchange(exchangeId).label : 'CoinGecko';
  const streamed = useLiveQuote(exchangeId, env, activeSymbol, source === 'exchange');
  const incoming = useRef(lastPrice); incoming.current = lastPrice;
  const base = baseTicker(activeSymbol);
  const call = chartCtx.latestCall;
  const levels = showLevels ? chartLevels(activeSymbol, call, chartCtx.positions) : [];
  const fav = chartCtx.favorites.map(toPair).includes(activeSymbol);
  const stats = windowStats(candles);
  const win = windowRange(candles.length, count, offset);
  const shown = cross && candles.length ? candles.slice(win.from, win.to)[cross.i] : null;
  const maxCount = Math.max(20, Math.min(400, candles.length));

  useEffect(() => { setActiveSymbol(symbol); }, [symbol]);
  useEffect(() => { setSource(sourceProp); }, [sourceProp]);
  useEffect(() => { setPresetId(source === 'exchange' ? '1h' : '24h'); }, [source, exchangeId, env]);
  useEffect(() => { if (streamed > 0 && source === 'exchange') setQuote(streamed); }, [streamed, source]);
  useEffect(() => { setOffset(0); setCross(null); }, [activeSymbol, presetId, source]);

  // quote
  const priorFeed = useRef(`${source}:${exchangeId}:${env}`);
  useEffect(() => {
    let alive = true;
    const feedKey = `${source}:${exchangeId}:${env}`;
    const changedFeed = priorFeed.current !== feedKey; priorFeed.current = feedKey;
    const parent = activeSymbol === symbol && !changedFeed ? incoming.current : 0;
    setQuote(parent); setQuoteError('');
    const load = async () => {
      try {
        const fresh = source === 'exchange' ? await getExchange(exchangeId).lastPrice(env, activeSymbol) : (await coinGeckoLivePrices([activeSymbol]))[0]?.last || 0;
        if (alive && fresh > 0) { setQuote(fresh); setQuoteError(''); }
      } catch (error) { if (alive) setQuoteError(error instanceof Error ? error.message : `Quote ${provider} tidak tersedia.`); }
    };
    if (!(parent > 0)) load();
    const id = setInterval(load, source === 'exchange' ? 15000 : 60000);
    return () => { alive = false; clearInterval(id); };
  }, [activeSymbol, source, exchangeId, env, symbol, provider]);

  // candles
  useEffect(() => {
    let alive = true;
    setCandles([]); setLoading(true); setCandleError(''); setCross(null);
    requestCandles(source, exchangeId, env, activeSymbol, preset).then((data) => {
      if (!alive) return;
      setCandles(data); if (!data.length) setCandleError(`Candle ${provider} belum tersedia untuk aset ini.`);
    }).catch((e: unknown) => { if (alive) setCandleError(e instanceof Error ? e.message : `Candle ${provider} tidak tersedia.`); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeSymbol, preset, source, exchangeId, env, provider]);

  // CoinGecko fundamentals (rank, market cap, volume, % changes)
  useEffect(() => {
    let alive = true;
    coinGeckoUniverse().then((list) => { if (alive) setCoin(list.find((c) => c.symbol.toUpperCase() === base) || null); }).catch(() => { if (alive) setCoin(null); });
    return () => { alive = false; };
  }, [base]);

  const refresh = () => {
    setLoading(true); setCandleError('');
    requestCandles(source, exchangeId, env, activeSymbol, preset, true).then((d) => { setCandles(d); if (!d.length) setCandleError(`Candle ${provider} belum tersedia untuk aset ini.`); })
      .catch((e: unknown) => setCandleError(e instanceof Error ? e.message : `Candle ${provider} tidak tersedia.`)).finally(() => setLoading(false));
  };
  const selectAsset = (value: string) => { const next = toPair(value); if (!next) return; setActiveSymbol(next); onSymbolChange?.(next); setAssetPicker(false); };
  const changeSource = (next: PriceSource) => { if (next === source) return; setSource(next); onSourceChange?.(next); };
  const zoom = (f: number) => setCount((c) => Math.max(12, Math.min(maxCount, Math.round(c * f))));
  const pan = (dir: number) => setOffset((o) => Math.max(0, Math.min(Math.max(0, candles.length - count), o + dir * Math.max(3, Math.round(count / 3)))));
  const view = ({ count: c, offset: o }: { count: number; offset: number }) => { setCount(c); setOffset(o); };
  const resetView = () => { setCount(DEFAULT_COUNT); setOffset(0); };
  const submitAlert = async () => { const v = Number(alertText.replace(',', '.')); if (v > 0 && await chartCtx.addAlert(activeSymbol, v)) setAlertText(''); };

  const dayChange = coin && source === 'coingecko' ? coin.ch24h : stats ? stats.changePct : null;
  const periodUp = (stats?.changePct ?? 0) >= 0;
  const ohlc = shown || candles[candles.length - 1];

  const canvas = (h: number) => candles.length > 1
    ? <ChartCanvas candles={candles} lastPrice={quote} kind={kind} levels={levels} ind={ind} count={count} offset={offset} height={h} cross={cross} onView={view} onCross={setCross} onReset={resetView} />
    : <View style={{ height: h, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 8 }}>{loading ? <ActivityIndicator color={t.primary} /> : null}<Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ textAlign: 'center' }}>{loading ? `Memuat chart ${provider}…` : candleError || quoteError || 'Grafik akan tampil saat data tersedia.'}</Txt></View>;

  const zoomBar = <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, paddingTop: 6 }}>
    {([['－', () => zoom(1.35)], ['＋', () => zoom(0.74)], ['‹', () => pan(1)], ['›', () => pan(-1)]] as Array<[string, () => void]>).map(([l, fn]) => <Press key={l} onPress={fn} radius={10}><View style={{ width: 36, height: 30, borderRadius: 10, backgroundColor: t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}><Txt variant="label">{l}</Txt></View></Press>)}
    {offset > 0 || count !== DEFAULT_COUNT ? <Press onPress={resetView} radius={10}><View style={{ height: 30, paddingHorizontal: 10, borderRadius: 10, backgroundColor: t.secondaryContainer, justifyContent: 'center' }}><Txt variant="labelSmall" color={t.onSecondaryContainer}>Terbaru ⟲</Txt></View></Press> : null}
    <View style={{ flex: 1 }} />
    <Txt variant="labelSmall" color={t.onSurfaceVariant}>{Math.min(count, candles.length)} candle · cubit untuk zoom · tahan untuk crosshair</Txt>
  </View>;

  const infoLine = ohlc ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, paddingHorizontal: 12, paddingTop: 8, minHeight: 26 }}>
    {shown ? <Txt variant="labelSmall" color={t.primary}>{new Date(ohlc.t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Txt> : null}
    <Txt variant="labelSmall" color={t.onSurfaceVariant}>O {fmtPrice(ohlc.o)}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>H {fmtPrice(ohlc.h)}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>L {fmtPrice(ohlc.l)}</Txt>
    <Txt variant="labelSmall" color={ohlc.c >= ohlc.o ? t.success : t.error}>C {fmtPrice(ohlc.c)} ({pct(ohlc.o > 0 ? ((ohlc.c - ohlc.o) / ohlc.o) * 100 : 0)})</Txt>
    {ohlc.v ? <Txt variant="labelSmall" color={t.onSurfaceVariant}>Vol {compactUsd(ohlc.v).replace('$', '')}</Txt> : null}
  </View> : null;
  const legend = candles.length > 1 ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingHorizontal: 12, paddingTop: 4 }}>
    {ind.ma ? <><Txt variant="labelSmall" color={C_MA7}>● MA7</Txt><Txt variant="labelSmall" color={C_MA25}>● MA25</Txt></> : null}
    {ind.ema ? <Txt variant="labelSmall" color={C_EMA}>● EMA50</Txt> : null}
    {ind.boll ? <Txt variant="labelSmall" color={C_BOLL}>● BOLL 20·2</Txt> : null}
    {ind.vwap ? <Txt variant="labelSmall" color={C_VWAP}>● VWAP</Txt> : null}
  </View> : null;

  const card = <View style={{ marginTop: 12, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: t.outlineVariant, backgroundColor: t.surface }}>
    {/* header */}
    <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, backgroundColor: t.surfaceHigh }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Press onPress={() => setAssetPicker(true)} radius={14} style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CoinIcon base={base} image={cachedCoinImage(base) || coin?.image} size={40} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Txt variant="titleMedium" numberOfLines={1}>{base}/USDT</Txt><Icon name="chevron" size={15} color={t.primary} />{coin?.rank ? <Txt variant="labelSmall" color={t.onSurfaceVariant}>#{coin.rank}</Txt> : null}</View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt variant="titleLarge" numberOfLines={1}>{quote > 0 ? `$${fmtPrice(quote)}` : 'Menunggu harga'}</Txt>
                {streamed > 0 && source === 'exchange' ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.success }} /> : null}
              </View>
            </View>
          </View>
        </Press>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Pill label={dayChange === null ? '—' : `${pct(dayChange)}${source === 'coingecko' && coin ? ' 24j' : ''}`} tone={dayChange === null ? 'neutral' : dayChange >= 0 ? 'good' : 'bad'} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Tool icon="star" active={fav} onPress={() => chartCtx.toggleFavorite(activeSymbol)} />
            <Tool icon="expand" onPress={() => setFull(true)} />
          </View>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <Stat label={`Tertinggi · ${preset.short}`} value={stats ? fmtPrice(stats.high) : '—'} color={t.success} />
        <Stat label={`Terendah · ${preset.short}`} value={stats ? fmtPrice(stats.low) : '—'} color={t.error} />
        <Stat label={stats && stats.volume > 0 ? 'Volume' : 'Volume 24j'} value={stats && stats.volume > 0 ? compactUsd(stats.volume).replace('$', '') : coin && coin.volume24h > 0 ? compactUsd(coin.volume24h) : '—'} />
        <Stat label="Periode" value={stats ? pct(stats.changePct) : '—'} color={periodUp ? t.success : t.error} />
      </View>
    </View>

    {/* source + timeframe */}
    <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
      <View style={{ width: 210 }}><Segmented<PriceSource> value={source} onChange={changeSource} height={32} options={[{ id: 'coingecko', label: 'CoinGecko' }, { id: 'exchange', label: getExchange(exchangeId).label }]} /></View>
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, gap: 4, alignItems: 'center' }}>
      {presets.map((p) => { const on = p.id === preset.id; return <Press key={p.id} onPress={() => setPresetId(p.id)} radius={10}><View style={{ minWidth: 40, height: 32, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.secondaryContainer : 'transparent' }}><Txt variant="label" color={on ? t.onSecondaryContainer : t.onSurfaceVariant}>{p.short}</Txt></View></Press>; })}
      <View style={{ width: 1, height: 20, backgroundColor: t.outlineVariant, marginHorizontal: 4 }} />
      <Tool icon="chart" label={kind === 'candle' ? 'Candle' : kind === 'line' ? 'Garis' : 'Area'} onPress={() => setKind((k) => (k === 'candle' ? 'line' : k === 'line' ? 'area' : 'candle'))} />
      <Tool icon="layers" label="Indikator" active={ind.ma || ind.ema || ind.boll || ind.vwap || ind.rsi || ind.macd} onPress={() => setIndSheet(true)} />
      <Tool icon="shield" label="Level" active={showLevels} onPress={() => setShowLevels((v) => !v)} />
      {source === 'exchange' ? <Tool icon="exchange" label="Depth" onPress={() => setDepthOpen(true)} /> : null}
      <Tool icon="warning" label="Alert" onPress={() => setIndSheet(true)} />
      <Tool icon="refresh" onPress={refresh} />
    </ScrollView>

    {call || chartCtx.positions.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 8, gap: 6 }}>
      {call ? <Press onPress={() => selectAsset(call.symbol)} radius={14}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 14, backgroundColor: toPair(call.symbol) === activeSymbol ? t.primaryContainer : t.surfaceHigh }}><Icon name="signals" size={14} color={t.primary} /><Txt variant="labelSmall">Call terbaru · {baseTicker(call.symbol)} {call.direction}</Txt></View></Press> : null}
      {Array.from(new Set<string>(chartCtx.positions.map((p) => toPair(p.symbol)))).slice(0, 6).map((s) => <Press key={s} onPress={() => selectAsset(s)} radius={14}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 14, backgroundColor: s === activeSymbol ? t.primaryContainer : t.surfaceHigh }}><Icon name="wallet" size={14} color={t.primary} /><Txt variant="labelSmall">Posisi · {baseTicker(s)}</Txt></View></Press>)}
    </ScrollView> : null}

    {infoLine}
    {legend}
    <View style={{ marginHorizontal: 8, marginTop: 6, borderRadius: 12, overflow: 'hidden', backgroundColor: t.surfaceLow }}>{full ? <View style={{ height: INLINE_H }} /> : canvas(INLINE_H)}</View>
    {zoomBar}
    {candleError && candles.length > 1 ? <Txt variant="labelSmall" color={t.warning} style={{ paddingHorizontal: 12, paddingTop: 6 }}>{candleError}</Txt> : null}

    {coin && source === 'coingecko' ? <View style={{ margin: 10, padding: 12, borderRadius: 14, backgroundColor: t.surfaceHigh, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}><Stat label="Market cap" value={coin.marketCap > 0 ? compactUsd(coin.marketCap) : '—'} /><Stat label="Volume 24j" value={coin.volume24h > 0 ? compactUsd(coin.volume24h) : '—'} /><Stat label="Rank" value={coin.rank ? `#${coin.rank}` : '—'} /></View>
      <View style={{ flexDirection: 'row', gap: 10 }}><Stat label="1 jam" value={pct(coin.ch1h)} color={coin.ch1h >= 0 ? t.success : t.error} /><Stat label="24 jam" value={pct(coin.ch24h)} color={coin.ch24h >= 0 ? t.success : t.error} /><Stat label="7 hari" value={pct(coin.ch7d)} color={coin.ch7d >= 0 ? t.success : t.error} /></View>
    </View> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 8, paddingTop: 2 }}>
      <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ flex: 1 }} numberOfLines={1}>{provider} · {source === 'coingecko' ? 'granularitas mengikuti CoinGecko · tanpa volume per candle' : preset.label}</Txt>
      {loading ? <ActivityIndicator size="small" color={t.primary} /> : null}
    </View>

    <PairPicker visible={assetPicker} onClose={() => setAssetPicker(false)} onPick={selectAsset} source={source} exchangeId={exchangeId} env={env} active={activeSymbol} bottom={bottom} />
    {source === 'exchange' ? <DepthSheet visible={depthOpen} onClose={() => setDepthOpen(false)} exchangeId={exchangeId} env={env} symbol={activeSymbol} bottom={bottom} /> : null}

    <BottomSheet visible={indSheet} onClose={() => setIndSheet(false)} bottom={bottom}>
      <Txt variant="titleLarge">Indikator & alat</Txt>
      <Txt variant="label" color={t.primary} style={{ marginTop: 14, marginBottom: 7 }}>Overlay</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Toggle label="MA 7/25" color={C_MA7} active={ind.ma} onPress={() => toggleInd('ma')} />
        <Toggle label="EMA 50" color={C_EMA} active={ind.ema} onPress={() => toggleInd('ema')} />
        <Toggle label="Bollinger" color={C_BOLL} active={ind.boll} onPress={() => toggleInd('boll')} />
        <Toggle label="VWAP" color={C_VWAP} active={ind.vwap} onPress={() => toggleInd('vwap')} />
      </View>
      <Txt variant="label" color={t.primary} style={{ marginTop: 14, marginBottom: 7 }}>Panel</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Toggle label="Volume" active={ind.vol} onPress={() => toggleInd('vol')} />
        <Toggle label="RSI 14" active={ind.rsi} onPress={() => toggleInd('rsi')} />
        <Toggle label="MACD" active={ind.macd} onPress={() => toggleInd('macd')} />
      </View>
      <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>Volume dan VWAP hanya tersedia dari data exchange; CoinGecko menyediakan OHLC tanpa volume per candle.</Txt>
      <Txt variant="label" color={t.primary} style={{ marginTop: 14, marginBottom: 7 }}>Alert harga {base}</Txt>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><TextInput value={alertText} onChangeText={setAlertText} keyboardType="decimal-pad" placeholder={quote > 0 ? `mis. ${fmtPrice(quote * 1.02)}` : 'Harga target'} placeholderTextColor={t.outline} style={{ height: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: t.surfaceHigh, color: t.onSurface }} /></View>
        <Btn label="Pasang" icon="warning" onPress={submitAlert} />
      </View>
      <Btn label="Selesai" variant="text" onPress={() => setIndSheet(false)} />
    </BottomSheet>

    <Modal visible={full} transparent={false} animationType="fade" onRequestClose={() => setFull(false)} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: t.surface, paddingTop: 36, paddingBottom: Math.max(bottom, 12) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }}>
          <CoinIcon base={base} image={cachedCoinImage(base) || coin?.image} size={34} />
          <View style={{ flex: 1 }}><Txt variant="titleMedium">{base}/USDT · {provider}</Txt><Txt variant="titleLarge">{quote > 0 ? `$${fmtPrice(quote)}` : '—'}</Txt></View>
          <Tool icon="close" onPress={() => setFull(false)} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 8, gap: 4, alignItems: 'center' }}>
          {presets.map((p) => { const on = p.id === preset.id; return <Press key={p.id} onPress={() => setPresetId(p.id)} radius={10}><View style={{ minWidth: 40, height: 32, paddingHorizontal: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.secondaryContainer : 'transparent' }}><Txt variant="label" color={on ? t.onSecondaryContainer : t.onSurfaceVariant}>{p.short}</Txt></View></Press>; })}
          <Tool icon="chart" label={kind === 'candle' ? 'Candle' : kind === 'line' ? 'Garis' : 'Area'} onPress={() => setKind((k) => (k === 'candle' ? 'line' : k === 'line' ? 'area' : 'candle'))} />
          <Tool icon="layers" label="Indikator" onPress={() => { setFull(false); setTimeout(() => setIndSheet(true), 250); }} />
        </ScrollView>
        {infoLine}{legend}
        <View style={{ flex: 1, marginHorizontal: 8, marginTop: 6 }}>{full ? canvas(Math.max(260, screenH - 330)) : null}</View>
        {zoomBar}
      </View>
    </Modal>
  </View>;
  return card;
}
