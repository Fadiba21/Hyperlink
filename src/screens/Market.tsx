import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Linking, ScrollView, View } from 'react-native';
import type { Controller } from '../controller';
import { compactUsd, type CoinGeckoCoin, type CoinGeckoSort } from '../coingecko';
import { price, timeAgo } from '../format';
import { getExchange, type MarketTicker } from '../exchanges';
import { MarketChart } from '../CoinGeckoChart';
import { toPair } from '../pairs';
import { ManualOrderCard } from './ManualOrderCard';
import { useTheme } from '../theme';
import { Btn, BottomSheet, Card, CompactSelector, Pill, PopupMenu, Press, Reveal, SkeletonRows, Stat, Txt, type PopupMenuItem } from '../ui';

type View_ = 'top' | 'gainers' | 'losers' | 'volume' | 'trending';
type MarketSource = 'coingecko' | 'exchange';
const VIEWS: Array<[View_, string]> = [['top', 'Kapitalisasi'], ['gainers', 'Naik'], ['losers', 'Turun'], ['volume', 'Volume'], ['trending', 'Trending']];
type MarketCategory = 'popular' | 'meme' | 'privacy' | 'layer1' | 'defi';
const CATEGORIES: Array<[MarketCategory, string, 'trend' | 'shield' | 'layers' | 'coin']> = [['popular', 'Populer', 'trend'], ['meme', 'Meme', 'trend'], ['privacy', 'Koin Privasi', 'shield'], ['layer1', 'Layer 1', 'layers'], ['defi', 'DeFi & Infra', 'coin']];
const CATEGORY_ITEMS: PopupMenuItem[] = CATEGORIES.map(([id, label, icon]) => ({ id, label, subtitle: id === 'popular' ? 'Aset dengan peringkat pasar teratas.' : `Tampilkan aset kategori ${label}.`, icon }));
const VIEW_ITEMS: PopupMenuItem[] = VIEWS.map(([id, label]) => ({ id, label, subtitle: id === 'top' ? 'Urutkan berdasarkan kapitalisasi pasar.' : id === 'trending' ? 'Koin yang sedang banyak diperhatikan.' : `Urutkan aset berdasarkan ${label.toLowerCase()} 24 jam.`, icon: id === 'trending' || id === 'gainers' || id === 'losers' ? 'trend' : id === 'volume' ? 'coin' : 'chart' }));
const CATEGORY_SYMBOLS: Partial<Record<MarketCategory, string[]>> = {
  meme: ['DOGE', 'SHIB', 'PEPE', 'WIF', 'FLOKI', 'BONK', 'BOME', 'MOG', 'NEIRO'],
  privacy: ['XMR', 'ZEC', 'DASH', 'SCRT', 'ROSE', 'DCR', 'FIRO', 'BEAM'],
  layer1: ['BTC', 'ETH', 'SOL', 'BNB', 'ADA', 'AVAX', 'DOT', 'LTC', 'BCH', 'NEAR', 'SUI', 'APT', 'TRX', 'TON', 'ETC', 'XLM', 'ATOM', 'XRP'],
  defi: ['LINK', 'UNI', 'AAVE', 'ATOM', 'ARB', 'OP', 'FIL', 'ICP', 'INJ', 'MKR', 'CRV', 'LDO', 'RUNE'],
};
const SORT: Partial<Record<View_, CoinGeckoSort>> = { top: 'market_cap', gainers: 'percent_change_24h_desc', losers: 'percent_change_24h_asc', volume: 'volume_24h' };
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
const open = (url?: string) => { if (url) Linking.openURL(url).catch(() => undefined); };
function ErrorNote({ text }: { text?: string }) { const t = useTheme(); return text ? <Txt variant="bodySmall" color={t.warning} style={{ marginVertical: 6 }}>{text}</Txt> : null; }

function CoinAvatar({ coin }: { coin: CoinGeckoCoin }) {
  const t = useTheme();
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [coin.image]);
  return <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}>
    {coin.image && !imageFailed ? <Image source={{ uri: coin.image }} onError={() => setImageFailed(true)} style={{ width: 40, height: 40, borderRadius: 20 }} /> : <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.primaryContainer, alignItems: 'center', justifyContent: 'center' }}><Txt variant="titleSmall" color={t.onPrimaryContainer}>{coin.symbol.slice(0, 1)}</Txt></View>}
  </View>;
}

const CoinRow = memo(function CoinRow({ coin, onPress }: { coin: CoinGeckoCoin; onPress: (coin: CoinGeckoCoin) => void }) {
  const t = useTheme();
  const open = useCallback(() => onPress(coin), [coin, onPress]);
  return (
    <Press onPress={open} radius={16}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, gap: 12 }}>
        <CoinAvatar coin={coin} />
        <View style={{ flex: 1 }}>
          <Txt variant="titleSmall">{coin.symbol} <Txt variant="bodySmall" color={t.onSurfaceVariant}>{coin.name}</Txt></Txt>
          <Txt variant="labelSmall" color={t.onSurfaceVariant}>{coin.symbol}/USDT · {coin.marketCap > 0 ? `MCap ${compactUsd(coin.marketCap)}` : 'Futures perpetual'} · Vol {coin.volume24h > 0 ? compactUsd(coin.volume24h) : '—'}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt variant="titleSmall">${price(coin.price)}</Txt>
          <Txt variant="labelSmall" color={coin.ch24h >= 0 ? t.success : t.error}>{pct(coin.ch24h)}</Txt>
        </View>
      </View>
    </Press>
  );
});

function toMarketCoin(ticker: MarketTicker, index: number): CoinGeckoCoin {
  const symbol = ticker.symbol.replace(/USDT$/, '');
  return { id: ticker.symbol.toLowerCase(), name: `${symbol} perpetual`, symbol, slug: ticker.symbol.toLowerCase(), rank: index + 1, price: ticker.last, ch1h: 0, ch24h: ticker.change24h * 100, ch7d: 0, marketCap: 0, volume24h: ticker.volume24h || 0 };
}

export function Market({ ctl, bottom, go, refreshRef }: { ctl: Controller; bottom: number; go: (tab: 'home' | 'settings') => void; refreshRef: { current: () => unknown } }) {
  const t = useTheme();
  const market = ctl.market;
  const loadMarket = ctl.loadMarket;
  const closeCoin = ctl.closeCoin;
  const openCoin = ctl.openCoin;
  const [view, setView] = useState<View_>('top');
  const [category, setCategory] = useState<MarketCategory>('popular');
  const [source, setSource] = useState<MarketSource>('coingecko');
  const [menu, setMenu] = useState<'category' | 'view' | 'source' | null>(null);
  const [exchangeTickers, setExchangeTickers] = useState<MarketTicker[]>([]);
  const [exchangeLoading, setExchangeLoading] = useState(false);
  const [exchangeError, setExchangeError] = useState('');
  const [exchangeLoadedAt, setExchangeLoadedAt] = useState(0);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const [visibleCount, setVisibleCount] = useState(20);
  const [exchangeDetail, setExchangeDetail] = useState<CoinGeckoCoin | null>(null);
  const [manualOrderSymbol, setManualOrderSymbol] = useState('');
  const exchangeId = ctl.credentials.exchange;
  const env = ctl.credentials.keys[exchangeId].env;
  const exchange = getExchange(exchangeId);

  const loadExchange = useCallback(async () => {
    setExchangeLoading(true); setExchangeError('');
    try {
      const rows = await getExchange(exchangeId).marketTickers(env);
      setExchangeTickers([...rows].sort((a, b) => (Number(b.volume24h) || 0) - (Number(a.volume24h) || 0)));
      setExchangeLoadedAt(Date.now());
      if (!rows.length) setExchangeError(`Belum ada pair USDT aktif dari ${getExchange(exchangeId).label}.`);
    } catch (error) {
      setExchangeError(error instanceof Error ? error.message : `Data market ${getExchange(exchangeId).label} belum tersedia.`);
    } finally { setExchangeLoading(false); }
  }, [exchangeId, env]);
  refreshRef.current = source === 'coingecko' ? () => Promise.all([ctl.loadMarket(true), loadExchange()]) : loadExchange;

  useEffect(() => { if (source === 'coingecko' && !market.loadedAt && !Object.values(market.loading).some(Boolean)) loadMarket(); }, [source, market.loadedAt, market.loading, loadMarket]);
  useEffect(() => { setExchangeTickers([]); setExchangeLoadedAt(0); loadExchange(); }, [exchangeId, env, loadExchange]);
  useEffect(() => { setExchangeDetail(null); setManualOrderSymbol(''); closeCoin(); }, [source, closeCoin]);

  const busy = source === 'coingecko' ? Object.values(market.loading).some(Boolean) : exchangeLoading;
  const global = source === 'coingecko' ? market.global : null;
  const exchangeCoins = useMemo(() => {
    let sorted = [...exchangeTickers];
    if (view === 'gainers') sorted.sort((a, b) => b.change24h - a.change24h);
    else if (view === 'losers') sorted.sort((a, b) => a.change24h - b.change24h);
    else if (view === 'trending') sorted.sort((a, b) => Math.abs(b.change24h) - Math.abs(a.change24h));
    else sorted.sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0));
    return sorted.slice(0, 50).map(toMarketCoin);
  }, [exchangeTickers, view]);
  const list = source === 'coingecko' ? view === 'trending' ? market.trending : market.coins : exchangeCoins;
  const visibleList = useMemo(() => {
    const symbols = CATEGORY_SYMBOLS[category];
    return symbols ? list.filter((coin) => symbols.includes(coin.symbol.toUpperCase())) : list;
  }, [category, list]);
  useEffect(() => { setVisibleCount(20); }, [source, view, category]);
  const handleCoinPress = useCallback((coin: CoinGeckoCoin) => {
    if (source === 'exchange') { setExchangeDetail(coin); closeCoin(); }
    else { setExchangeDetail(null); openCoin(coin.id, coin); }
  }, [source, closeCoin, openCoin]);
  const displayedList = visibleList.slice(0, visibleCount);
  const selectedCoin = exchangeDetail || market.detail?.coin || null;
  const selectedInfo = exchangeDetail ? undefined : market.detail?.info;
  useEffect(() => { setChartCollapsed(false); }, [selectedCoin?.id]);
  const sourceError = source === 'exchange' ? exchangeError : undefined;
  const selectedCategory = CATEGORIES.find(([id]) => id === category)?.[1] || 'Populer';
  const selectedView = VIEWS.find(([id]) => id === view)?.[1] || 'Kapitalisasi';
  const sourceItems: PopupMenuItem[] = [
    { id: 'coingecko', label: 'CoinGecko', subtitle: 'Agregat kapitalisasi pasar dan data aset.', icon: 'coin' },
    { id: 'exchange', label: exchange.label, subtitle: 'Ticker futures publik dari exchange terpilih.', icon: 'exchange' },
  ];
  const selectView = (id: string) => {
    const next = id as View_;
    setView(next);
    const sort = SORT[next];
    if (source === 'coingecko' && sort && market.sort !== sort) ctl.loadCoins(sort);
    setMenu(null);
  };

  return (
    <View>
      <PopupMenu visible={menu === 'category'} title="Kategori pasar" subtitle="Pilih satu kategori; pilihan aktif ditandai." items={CATEGORY_ITEMS} selectedId={category} onClose={() => setMenu(null)} onSelect={(id) => { setCategory(id as MarketCategory); setMenu(null); }} />
      <PopupMenu visible={menu === 'view'} title="Urutkan pasar" subtitle="Pilih tampilan daftar aset." items={VIEW_ITEMS} selectedId={view} onClose={() => setMenu(null)} onSelect={selectView} />
      <PopupMenu visible={menu === 'source'} title="Sumber data pasar" subtitle="Pilih sumber ticker yang digunakan untuk daftar dan chart." items={sourceItems} selectedId={source} onClose={() => setMenu(null)} onSelect={(id) => { setSource(id as MarketSource); setMenu(null); }} />
      <Reveal index={0}>
        <Card tone="high">
          <Txt variant="titleSmall">Sumber data pasar</Txt>
          <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Gunakan agregat CoinGecko atau ticker futures publik dari exchange terpilih.</Txt>
          <CompactSelector label="Sumber aktif" value={source === 'coingecko' ? 'CoinGecko' : exchange.label} onPress={() => setMenu('source')} style={{ marginTop: 10 }} />
        </Card>
      </Reveal>

      <Reveal index={1}>
        <Card tone="primary" style={{ padding: 18 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Txt variant="labelSmall" color={t.onPrimaryContainer}>{source === 'coingecko' ? 'TOTAL MARKET CAP' : `${exchange.label.toUpperCase()} · FUTURES`}</Txt>
            {busy ? <ActivityIndicator color={t.onPrimaryContainer} size="small" /> : <Pill label={source === 'coingecko' ? 'CoinGecko' : env === 'mainnet' ? 'PUBLIC MARKET' : 'TESTNET FEED'} tone="neutral" />}
          </View>
          {source === 'coingecko' ? <>
            <Txt variant="headline" color={t.onPrimaryContainer} style={{ fontSize: 32, lineHeight: 42, fontWeight: '600' }}>{global ? compactUsd(global.marketCap) : '—'}</Txt>
            {global ? <Txt variant="body" color={global.marketCapChange24h >= 0 ? t.success : t.error}>{pct(global.marketCapChange24h)} 24j · volume {compactUsd(global.volume24h)}</Txt> : <ErrorNote text={market.errors.global} />}
            {global ? <Txt variant="labelSmall" color={t.onPrimaryContainer} style={{ marginTop: 8 }}>BTC {global.btcDominance.toFixed(1)}% · ETH {global.ethDominance.toFixed(1)}% · {global.activeCoins.toLocaleString()} aset aktif</Txt> : null}
          </> : <>
            <Txt variant="headline" color={t.onPrimaryContainer} style={{ fontSize: 32, lineHeight: 42, fontWeight: '600' }}>{exchangeTickers.length || '—'} pair</Txt>
            <Txt variant="body" color={t.onPrimaryContainer}>{exchangeTickers.length ? `Ticker futures USDT · ${exchange.label}` : `Memuat market ${exchange.label}…`}</Txt>
            {exchangeTickers.length ? <Txt variant="labelSmall" color={t.onPrimaryContainer} style={{ marginTop: 8 }}>Urut berdasarkan turnover 24 jam · data publik</Txt> : <ErrorNote text={exchangeError} />}
          </>}
        </Card>
      </Reveal>

      <Card tone="outlined" style={{ padding: 10 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CompactSelector label="Kategori" value={selectedCategory} onPress={() => setMenu('category')} />
          <CompactSelector label="Tampilan" value={source === 'exchange' && view === 'top' ? 'Volume' : selectedView} onPress={() => setMenu('view')} />
        </View>
      </Card>

      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Txt variant="titleMedium">{source === 'exchange' ? view === 'gainers' ? 'Paling naik · 24 jam' : view === 'losers' ? 'Paling turun · 24 jam' : view === 'trending' ? 'Perubahan terbesar' : 'Volume tertinggi' : view === 'trending' ? 'Koin trending' : view === 'gainers' ? 'Paling naik · 24 jam' : view === 'losers' ? 'Paling turun · 24 jam' : view === 'volume' ? 'Volume tertinggi' : 'Aset teratas'}</Txt>
          {busy ? <ActivityIndicator color={t.primary} size="small" /> : null}
        </View>
        <ErrorNote text={source === 'exchange' ? exchangeError : view === 'trending' ? market.errors.trending : market.errors.coins} />
        {busy && !visibleList.length ? <SkeletonRows count={7} /> : null}
        {displayedList.map((coin) => <CoinRow key={`${source}-${view}-${coin.id}`} coin={coin} onPress={handleCoinPress} />)}
        {visibleList.length > visibleCount ? <Btn label={`Tampilkan ${Math.min(20, visibleList.length - visibleCount)} aset berikutnya`} variant="text" onPress={() => setVisibleCount((count) => Math.min(visibleList.length, count + 20))} /> : null}
        {!visibleList.length && !busy && !sourceError && !market.errors.coins && !market.errors.trending ? <Txt variant="body" color={t.onSurfaceVariant}>{list.length ? 'Belum ada aset di kategori ini untuk sumber data yang dipilih.' : 'Belum ada data. Coba muat ulang.'}</Txt> : null}
        <Btn label={busy ? 'Memuat market…' : 'Muat ulang pasar'} variant="tonal" icon="refresh" loading={busy} onPress={() => source === 'coingecko' ? ctl.loadMarket(true) : loadExchange()} />
      </Card>
      <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ textAlign: 'center', marginTop: 0, marginBottom: 8 }}>{source === 'coingecko' ? 'Data pasar oleh CoinGecko' : `Data ticker futures publik ${exchange.label}`}{source === 'coingecko' && market.loadedAt ? ` · diperbarui ${timeAgo(market.loadedAt)}` : source === 'exchange' && exchangeLoadedAt ? ` · diperbarui ${timeAgo(exchangeLoadedAt)}` : ''}</Txt>

      <BottomSheet visible={Boolean(selectedCoin) || market.detailLoading || Boolean(market.detailError) || Boolean(manualOrderSymbol)} onClose={() => { setManualOrderSymbol(''); setExchangeDetail(null); ctl.closeCoin(); }} bottom={bottom}>
        {selectedCoin || manualOrderSymbol || market.detailLoading || market.detailError ? (
          <ScrollView style={{ flexGrow: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {selectedCoin && manualOrderSymbol ? <>
              <Btn label={`Kembali ke ${selectedCoin.symbol}`} variant="text" icon="up" onPress={() => setManualOrderSymbol('')} />
              <ManualOrderCard ctl={ctl} tickers={exchangeTickers} exchangeId={exchangeId} env={env} bottom={bottom} tickerLoading={exchangeLoading} tickerError={exchangeError} initialSymbol={manualOrderSymbol} inSheet />
            </> : selectedCoin ? <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View><Txt variant="titleLarge">{selectedCoin.name}</Txt><Txt variant="body" color={t.onSurfaceVariant}>{selectedCoin.symbol}/USDT · {source === 'coingecko' ? `Rank #${selectedCoin.rank || '—'}` : `${exchange.label} perpetual`}</Txt></View>
                <View style={{ alignItems: 'flex-end' }}><Txt variant="titleLarge">${price(selectedCoin.price)}</Txt><Txt variant="bodySmall" color={selectedCoin.ch24h >= 0 ? t.success : t.error}>{pct(selectedCoin.ch24h)} 24j</Txt></View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 }}>
                <Stat label="1 JAM" value={source === 'coingecko' ? pct(selectedCoin.ch1h) : '—'} color={selectedCoin.ch1h >= 0 ? t.success : t.error} />
                <Stat label="24 JAM" value={pct(selectedCoin.ch24h)} color={selectedCoin.ch24h >= 0 ? t.success : t.error} />
                <Stat label="7 HARI" value={source === 'coingecko' ? pct(selectedCoin.ch7d) : '—'} color={selectedCoin.ch7d >= 0 ? t.success : t.error} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                <Stat label="MARKET CAP" value={source === 'coingecko' ? compactUsd(selectedCoin.marketCap) : '—'} />
                <Stat label="VOLUME 24J" value={selectedCoin.volume24h > 0 ? compactUsd(selectedCoin.volume24h) : '—'} />
                <Stat label="SUPPLY" value={source === 'coingecko' && selectedCoin.supply ? `${(selectedCoin.supply / 1e6).toFixed(1)}M` : '—'} />
              </View>
              <Btn label={`Order manual ${selectedCoin.symbol}/USDT`} icon="bolt" variant="tonal" onPress={() => setManualOrderSymbol(toPair(selectedCoin.symbol))} style={{ marginTop: 10 }} />
              {source === 'coingecko' && (selectedInfo?.category || selectedInfo?.tags?.length) ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 12 }}>{[selectedInfo.category, ...(selectedInfo.tags || []).slice(0, 4)].filter(Boolean).join(' · ')}</Txt> : null}
              {source === 'coingecko' && selectedInfo?.description ? <Txt variant="body" color={t.onSurface} numberOfLines={7} style={{ marginTop: 10 }}>{selectedInfo.description}</Txt> : null}
              {source === 'coingecko' && selectedInfo ? <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {selectedInfo.website?.[0] ? <Btn label="Website" variant="text" icon="send" onPress={() => open(selectedInfo.website?.[0])} /> : null}
                {selectedInfo.twitter?.[0] ? <Btn label="X / Twitter" variant="text" icon="send" onPress={() => open(selectedInfo.twitter?.[0])} /> : null}
                <Btn label="Buka di CoinGecko" variant="text" icon="chart" onPress={() => open(`https://www.coingecko.com/en/coins/${selectedCoin.id}`)} />
              </View> : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
                <View><Txt variant="titleMedium">Grafik harga</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{selectedCoin.symbol}/USDT · {exchange.label}</Txt></View>
                <Btn label={chartCollapsed ? 'Tampilkan' : 'Minimalkan'} variant="text" icon={chartCollapsed ? 'down' : 'up'} onPress={() => setChartCollapsed((value) => !value)} />
              </View>
              {chartCollapsed ? <View style={{ marginTop: 8, padding: 14, borderRadius: 14, backgroundColor: t.surfaceContainer }}><Txt variant="bodySmall" color={t.onSurfaceVariant}>Chart diminimalkan · harga terakhir ${price(selectedCoin.price)}</Txt></View> : <MarketChart symbol={`${selectedCoin.symbol}USDT`} lastPrice={selectedCoin.price} source={source} exchangeId={exchangeId} env={env} bottom={bottom} />}
              <Btn label="Chart & trade Demo" icon="play" onPress={() => { ctl.patchSettings({ demoSymbol: `${selectedCoin.symbol}USDT`, demoPriceSource: source, accountMode: 'demo' }); ctl.refreshPrices([`${selectedCoin.symbol}USDT`]); setExchangeDetail(null); ctl.closeCoin(); go('home'); }} />
              <Txt variant="labelSmall" color={t.onSurfaceVariant}>Harga, candle, dan paper trading mengikuti {source === 'coingecko' ? 'CoinGecko' : exchange.label}; posisi Demo tetap lokal dan tidak mengirim order.</Txt>
            </> : null}
            {market.detailLoading && !selectedCoin ? <View style={{ alignItems: 'center', padding: 32 }}><ActivityIndicator color={t.primary} /></View> : null}
            {market.detailError ? <ErrorNote text={market.detailError} /> : null}
              <Btn label="Tutup" variant="outlined" onPress={() => { setManualOrderSymbol(''); setExchangeDetail(null); ctl.closeCoin(); }} />
          </ScrollView>
        ) : null}
      </BottomSheet>
    </View>
  );
}
