import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, View } from 'react-native';
import { coinGeckoCategoryMembers, coinGeckoUniverse, compactUsd, type CoinGeckoCoin } from './coingecko';
import { useChartContext } from './chartContext';
import { getExchange, type Env, type ExchangeId, type MarketTicker } from './exchanges';
import { errorMessage, price as fmtPrice } from './format';
import { filterPairs, mergePairs, PAIR_CATEGORIES, toPair, type PairRow, type PairSort } from './pairs';
import { useTheme } from './theme';
import { BottomSheet, Chip, Field, Icon, Press, Txt, SkeletonRows } from './ui';

type Source = 'coingecko' | 'exchange';
const ROW_HEIGHT = 66;
const SORTS: Array<[PairSort, string]> = [['volume', 'Volume'], ['gainers', '% Naik'], ['losers', '% Turun'], ['price', 'Harga'], ['name', 'A–Z']];

const tickerCache = new Map<string, { at: number; rows: MarketTicker[] }>();
let universeCache: { at: number; coins: CoinGeckoCoin[] } | null = null;
export const cachedCoinImage = (base: string): string | undefined => universeCache?.coins.find((c) => c.symbol === base.toUpperCase())?.image;
const hue = (text: string) => { let h = 0; for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360; return h; };

export function CoinIcon({ base, image, size = 40 }: { base: string; image?: string; size?: number }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [image]);
  if (image && !failed) return <Image source={{ uri: image }} onError={() => setFailed(true)} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.surfaceHigh }} />;
  const h = hue(base);
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${h}, 55%, ${t.dark ? 30 : 86}%)`, alignItems: 'center', justifyContent: 'center' }}><Txt variant="titleSmall" color={`hsl(${h}, 60%, ${t.dark ? 82 : 28}%)`}>{base.slice(0, 1)}</Txt></View>;
}

function Row({ row, selected, maxVolume, favorite, onPick, onFavorite }: { row: PairRow; selected: boolean; maxVolume: number; favorite: boolean; onPick: () => void; onFavorite: () => void }) {
  const t = useTheme();
  const up = row.change24h >= 0;
  const bar = maxVolume > 0 ? Math.max(0.04, Math.min(1, row.volume24h / maxVolume)) : 0;
  return <Press onPress={onPick} radius={16}>
    <View style={{ height: ROW_HEIGHT - 4, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 11, paddingLeft: 10, paddingRight: 4, borderRadius: 16, backgroundColor: selected ? t.secondaryContainer : 'transparent' }}>
      <CoinIcon base={row.base} image={row.image} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Txt variant="titleSmall" numberOfLines={1}>{row.base}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>/USDT</Txt>
          {row.rank ? <Txt variant="labelSmall" color={t.onSurfaceVariant}> #{row.rank}</Txt> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 4 }}>
          <View style={{ width: 54, height: 4, borderRadius: 2, backgroundColor: t.surfaceHigh, overflow: 'hidden' }}><View style={{ width: `${Math.round(bar * 100)}%`, height: 4, borderRadius: 2, backgroundColor: up ? t.success : t.error }} /></View>
          <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{row.volume24h > 0 ? compactUsd(row.volume24h) : '—'}</Txt>
        </View>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Txt variant="titleSmall">${fmtPrice(row.last)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 20, borderRadius: 10, backgroundColor: up ? t.successContainer : t.errorContainer }}>
          <Icon name={up ? 'up' : 'down'} size={10} color={up ? t.onSuccessContainer : t.onErrorContainer} />
          <Txt variant="labelSmall" color={up ? t.onSuccessContainer : t.onErrorContainer}>{Math.abs(row.change24h * 100).toFixed(2)}%</Txt>
        </View>
      </View>
      <Press onPress={onFavorite} radius={20}><View style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="star" size={19} color={favorite ? t.warning : t.outlineVariant} /></View></Press>
    </View>
  </Press>;
}

export function PairPicker({ visible, onClose, onPick, source, exchangeId, env, active, bottom }: { visible: boolean; onClose: () => void; onPick: (symbol: string) => void; source: Source; exchangeId: ExchangeId; env: Env; active: string; bottom: number }) {
  const t = useTheme();
  const chart = useChartContext();
  const [category, setCategory] = useState('hot');
  const [sort, setSort] = useState<PairSort>('volume');
  const [query, setQuery] = useState('');
  const [tickers, setTickers] = useState<MarketTicker[]>([]);
  const [coins, setCoins] = useState<CoinGeckoCoin[]>([]);
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [memberLoading, setMemberLoading] = useState(false);
  const exchangeLabel = getExchange(exchangeId).label;
  const provider = source === 'exchange' ? exchangeLabel : 'CoinGecko';
  const requested = useRef<Record<string, boolean>>({});

  const load = useCallback(async (force = false) => {
    setLoading(true); setError('');
    try {
      const jobs: Array<Promise<void>> = [];
      if (!force && universeCache && Date.now() - universeCache.at < 180000) setCoins(universeCache.coins);
      else jobs.push(coinGeckoUniverse(force).then((c) => { universeCache = { at: Date.now(), coins: c }; setCoins(c); }).catch((e) => { if (source === 'coingecko') throw e; }));
      if (source === 'exchange') {
        const key = `${exchangeId}:${env}`;
        const hit = tickerCache.get(key);
        if (!force && hit && Date.now() - hit.at < 45000) setTickers(hit.rows);
        else jobs.push(getExchange(exchangeId).marketTickers(env).then((rows) => { tickerCache.set(key, { at: Date.now(), rows }); setTickers(rows); }));
      }
      await Promise.all(jobs);
    } catch (e) { setError(errorMessage(e)); } finally { setLoading(false); }
  }, [source, exchangeId, env]);

  useEffect(() => { if (visible) load(); }, [visible, load]);
  useEffect(() => { if (visible && source === 'exchange') setCategory('all'); }, [visible, source]);
  useEffect(() => {
    const cat = PAIR_CATEGORIES.find((c) => c.id === category);
    if (!visible || !cat?.cgId || members[category] || requested.current[category]) return;
    requested.current[category] = true; setMemberLoading(true);
    coinGeckoCategoryMembers(cat.cgId).then((list) => setMembers((m) => ({ ...m, [category]: list }))).catch(() => { requested.current[category] = false; }).finally(() => setMemberLoading(false));
  }, [visible, category, members]);

  const rows = useMemo(() => mergePairs(source, tickers, coins), [source, tickers, coins]);
  const shown = useMemo(() => filterPairs(rows, { category, query, sort, favorites: chart.favorites, calls: chart.callSymbols, positions: chart.positions.map((p) => p.symbol), members }), [rows, category, query, sort, chart.favorites, chart.callSymbols, chart.positions, members]);
  const maxVolume = useMemo(() => shown.reduce((m, r) => Math.max(m, r.volume24h), 0), [shown]);
  const custom = toPair(query);
  const customKnown = custom && rows.some((r) => r.symbol === custom);
  const pick = (symbol: string) => { onPick(symbol); setQuery(''); };
  const emptyCopy = category === 'fav' ? 'Belum ada favorit. Tekan ikon bintang di daftar pair.' : category === 'call' ? 'Belum ada call dari Telegram.' : category === 'pos' ? 'Tidak ada posisi terbuka.' : memberLoading ? 'Memuat kategori…' : query ? `Tidak ada hasil untuk “${query}”.` : 'Tidak ada pair di kategori ini (data kategori dari CoinGecko).';

  return <BottomSheet visible={visible} onClose={onClose} bottom={bottom} height="90%">
    <View style={{ flex: 1, minHeight: 0 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 6 }}>
        {PAIR_CATEGORIES.map((c) => <Chip key={c.id} label={c.label} icon={c.icon} selected={category === c.id} onPress={() => setCategory(c.id)} />)}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <View><Txt variant="titleLarge">Pilih pair</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{provider} · {loading ? 'memuat…' : `${shown.length} dari ${rows.length} pair`}</Txt></View>
        {loading || memberLoading ? <ActivityIndicator color={t.primary} /> : <Press onPress={() => load(true)} radius={20}><View style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Icon name="refresh" size={19} color={t.onSurfaceVariant} /></View></Press>}
      </View>
      <Field label="Cari koin atau pair (mis. SOL, PEPE)" value={query} onChangeText={setQuery} autoCapitalize="characters" autoCorrect={false} />
      {category !== 'gainers' && category !== 'losers' ? <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
        {SORTS.map(([id, label]) => <Chip key={id} label={label} selected={sort === id} onPress={() => setSort(id)} />)}
      </ScrollView> : null}
      {error ? <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 6 }}>{error}</Txt> : null}
      <FlatList
        style={{ flex: 1, minHeight: 0, marginTop: 6 }} data={shown} keyExtractor={(r) => r.symbol} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
        initialNumToRender={14} windowSize={7} getItemLayout={(_d, index) => ({ length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index })}
        renderItem={({ item }) => <Row row={item} selected={item.symbol === active} maxVolume={maxVolume} favorite={chart.favorites.map(toPair).includes(item.symbol)} onPick={() => pick(item.symbol)} onFavorite={() => chart.toggleFavorite(item.symbol)} />}
        ListEmptyComponent={loading ? <SkeletonRows count={9} /> : <View style={{ alignItems: 'center', paddingVertical: 28, gap: 8 }}><Icon name="search" size={26} color={t.outline} /><Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ textAlign: 'center' }}>{emptyCopy}</Txt></View>}
        ListFooterComponent={source !== 'exchange' && custom && !customKnown ? <Press onPress={() => pick(custom)} radius={16}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginTop: 6, borderRadius: 16, borderWidth: 1, borderColor: t.outlineVariant }}><Icon name="add" size={18} color={t.primary} /><Txt variant="label">Pakai {custom} secara manual</Txt></View></Press> : undefined}
      />
    </View>
  </BottomSheet>;
}
