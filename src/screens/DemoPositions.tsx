import { useState } from 'react';
import { View } from 'react-native';
import type { Controller } from '../controller';
import { demoEquity, liquidationPrice, pnlOf } from '../demo';
import { getExchange } from '../exchanges';
import { money, price, signed, timeAgo } from '../format';
import { useTheme } from '../theme';
import { AssetCard, ChartSheet, PositionTile } from '../Exchange';
import { Btn, Card, Empty, Field, Pill, Reveal, SectionHeader, Stat, Txt } from '../ui';

export function DemoPositions({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const [drafts, setDrafts] = useState<Record<string, { sl: string; tp: string }>>({});
  const { demo, prices } = ctl;
  const provider = ctl.settings.demoPriceSource === 'exchange' ? getExchange(ctl.credentials.exchange).label : 'CoinGecko';
  const equity = demoEquity(demo, prices);
  const totalPnl = equity - 10000;
  const [chart, setChart] = useState<string | null>(null);
  return (
    <View>
      <Reveal index={0}>
        <AssetCard label="PORTOFOLIO DEMO" equity={equity} badge={<Pill label="DEMO · TERISOLASI" tone="info" />} caption={`Harga ${provider} · tidak membaca atau mengirim order Live.`}
          stats={[{ label: 'Tersedia', value: `$${money(demo.balance)}` }, { label: 'PnL total', value: `${signed(totalPnl)} $`, color: totalPnl >= 0 ? t.success : t.error }, { label: 'Posisi', value: String(demo.positions.length) }]} />
      </Reveal>

      {demo.orders.length ? <>
        <SectionHeader title={`Order tertunda (${demo.orders.length})`} />
        {demo.orders.map((order, i) => <Reveal key={order.id} index={i + 1}>
          <Card tone="outlined">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View><Txt variant="titleMedium">{order.symbol}</Txt><Txt variant="bodySmall" color={order.side === 'LONG' ? t.success : t.error}>{order.side} · {order.leverage}x · menunggu entry</Txt></View>
              <Pill label={`Entry ${price(order.entry)}`} tone="info" pulse />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
              <Stat label="HARGA PASAR" value={price(prices[order.symbol])} />
              <Stat label="STOP LOSS" value={price(order.stopLoss)} color={t.error} />
              <Stat label="JUMLAH TP" value={String(order.takeProfits?.length || (order.takeProfit ? 1 : 0))} color={t.success} />
            </View>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>{order.source || 'Call'} · {timeAgo(order.createdAt)}</Txt>
            <Btn label="Batalkan order demo" variant="text" icon="close" onPress={() => ctl.demoCancelOrder(order.id)} />
          </Card>
        </Reveal>)}
      </> : null}

      <SectionHeader title={`Posisi terbuka (${demo.positions.length})`} />
      {demo.positions.length ? demo.positions.map((position, i) => {
        const mark = prices[position.symbol] || position.entry;
        const pnl = pnlOf(position, mark);
        const targets = position.takeProfits?.length ? position.takeProfits : position.takeProfit ? [position.takeProfit] : [];
        const draft = drafts[position.id] || { sl: position.stopLoss ? String(position.stopLoss) : '', tp: position.takeProfit ? String(position.takeProfit) : '' };
        const update = (key: 'sl' | 'tp', value: string) => setDrafts((old) => ({ ...old, [position.id]: { ...draft, [key]: value } }));
        const save = () => {
          const parse = (v: string) => { if (!v.trim()) return undefined; const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : NaN; };
          const sl = parse(draft.sl); const tp = parse(draft.tp);
          if (Number.isNaN(sl) || Number.isNaN(tp)) { ctl.notify('SL/TP harus berupa harga positif.', 'error'); return; }
          ctl.demoSetTpSl(position.id, { stopLoss: sl, takeProfit: tp });
        };
        const liq = liquidationPrice(position, demo.balance);
        const roe = position.margin > 0 ? (pnl / position.margin) * 100 : null;
        return <Reveal key={position.id} index={i + 1}>
          <PositionTile onChart={() => setChart(position.symbol)} m={{ symbol: position.symbol, side: position.side, leverage: position.leverage, marginMode: position.marginMode || 'Isolated', size: String(position.size), entry: position.entry, mark, liq, margin: position.margin, pnl, roe, stopLoss: position.stopLoss, takeProfits: targets, tag: 'DEMO' }}>
            <View style={{ height: 8 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, minWidth: 0 }}><Field label="Stop Loss" value={draft.sl} onChangeText={(v) => update('sl', v)} keyboardType="decimal-pad" /></View>
              <View style={{ flex: 1, minWidth: 0 }}><Field label="Take Profit" value={draft.tp} onChangeText={(v) => update('tp', v)} keyboardType="decimal-pad" /></View>
            </View>
            <Btn label="Simpan SL / TP" variant="tonal" icon="check" onPress={save} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 2, marginTop: 4 }}>
              {([0.25, 0.5, 0.75, 1] as const).map((fraction) => <Btn key={fraction} label={fraction === 1 ? 'Tutup semua' : `Tutup ${fraction * 100}%`} variant={fraction === 1 ? 'outlined' : 'text'} onPress={() => ctl.demoClose(position.id, fraction)} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 124 }} />)}
            </View>
          </PositionTile>
        </Reveal>;
      }) : <Empty icon="inbox" title="Tidak ada posisi demo aktif" copy="Buka posisi demo dari call atau halaman Beranda. Saldo dan posisi demo terpisah dari exchange live." />}
      <ChartSheet symbol={chart} onClose={() => setChart(null)} ctl={ctl} bottom={0} />
    </View>
  );
}
