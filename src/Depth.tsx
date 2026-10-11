import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { getExchange, type Env, type ExchangeId, type OrderBook, type PublicTrade } from './exchanges';
import { errorMessage, price as fmtPrice } from './format';
import { baseTicker } from './pairs';
import { useTheme } from './theme';
import { BottomSheet, Chip, Txt } from './ui';

const qtyText = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n >= 1 ? n.toFixed(3) : n.toPrecision(3));

/** Order book (20 levels) and recent trades from the selected exchange, refreshed every 4 s while open. */
export function DepthSheet({ visible, onClose, exchangeId, env, symbol, bottom }: { visible: boolean; onClose: () => void; exchangeId: ExchangeId; env: Env; symbol: string; bottom: number }) {
  const t = useTheme();
  const [tab, setTab] = useState<'book' | 'trades'>('book');
  const [book, setBook] = useState<OrderBook | null>(null);
  const [trades, setTrades] = useState<PublicTrade[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!visible) return undefined;
    let alive = true;
    const ex = getExchange(exchangeId);
    const load = async () => {
      setLoading(true);
      try {
        const [b, tr] = await Promise.all([ex.orderBook(env, symbol), ex.recentTrades(env, symbol)]);
        if (alive) { setBook(b); setTrades(tr); setError(''); }
      } catch (e) { if (alive) setError(errorMessage(e)); } finally { if (alive) setLoading(false); }
    };
    load();
    const id = setInterval(load, 4000);
    return () => { alive = false; clearInterval(id); };
  }, [visible, exchangeId, env, symbol]);
  const asks = (book?.asks || []).slice(0, 12).sort((a, b) => b.price - a.price);
  const bids = (book?.bids || []).slice(0, 12).sort((a, b) => b.price - a.price);
  const max = Math.max(1e-12, ...asks.map((x) => x.qty), ...bids.map((x) => x.qty));
  const bestAsk = Math.min(...(book?.asks || []).map((x) => x.price));
  const bestBid = Math.max(...(book?.bids || []).map((x) => x.price));
  const spread = Number.isFinite(bestAsk) && Number.isFinite(bestBid) ? bestAsk - bestBid : null;
  const Level = ({ price, qty, color }: { price: number; qty: number; color: string }) => <View style={{ height: 24, justifyContent: 'center' }}>
    <View style={{ position: 'absolute', right: 0, top: 1, bottom: 1, width: `${Math.max(2, (qty / max) * 100)}%`, backgroundColor: color, opacity: 0.16, borderRadius: 3 }} />
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 }}><Txt variant="labelSmall" color={color}>{fmtPrice(price)}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{qtyText(qty)}</Txt></View>
  </View>;
  return <BottomSheet visible={visible} onClose={onClose} bottom={bottom} height="82%">
    <View style={{ flex: 1, minHeight: 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View><Txt variant="titleLarge">{baseTicker(symbol)}/USDT</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{getExchange(exchangeId).label} · {env === 'mainnet' ? 'Mainnet' : 'Testnet'} · jumlah dalam {baseTicker(symbol)}</Txt></View>
        {loading ? <ActivityIndicator color={t.primary} /> : null}
      </View>
      <View style={{ flexDirection: 'row', marginTop: 8 }}><Chip label="Order book" icon="layers" selected={tab === 'book'} onPress={() => setTab('book')} /><Chip label="Trade terbaru" icon="clock" selected={tab === 'trades'} onPress={() => setTab('trades')} /></View>
      {error ? <Txt variant="bodySmall" color={t.warning}>{error}</Txt> : null}
      <ScrollView style={{ flex: 1, minHeight: 0 }} showsVerticalScrollIndicator={false}>
        {tab === 'book' ? <View style={{ marginTop: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 }}><Txt variant="labelSmall" color={t.onSurfaceVariant}>Harga (USDT)</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>Jumlah</Txt></View>
          {asks.map((x, i) => <Level key={`a${i}`} price={x.price} qty={x.qty} color={t.error} />)}
          <View style={{ paddingVertical: 8, alignItems: 'center' }}><Txt variant="titleSmall">{spread !== null ? `Spread ${fmtPrice(spread)}` : '—'}</Txt></View>
          {bids.map((x, i) => <Level key={`b${i}`} price={x.price} qty={x.qty} color={t.success} />)}
        </View> : <View style={{ marginTop: 6 }}>
          {trades.map((x, i) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', height: 26, alignItems: 'center', paddingHorizontal: 6 }}>
            <Txt variant="labelSmall" color={x.side === 'Buy' ? t.success : t.error}>{fmtPrice(x.price)}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{qtyText(x.qty)}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{new Date(x.t).toLocaleTimeString('id-ID')}</Txt>
          </View>)}
          {!trades.length && !loading ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ padding: 16, textAlign: 'center' }}>Belum ada data trade.</Txt> : null}
        </View>}
      </ScrollView>
    </View>
  </BottomSheet>;
}
