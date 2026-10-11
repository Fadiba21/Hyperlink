import { useState } from 'react';
import { View } from 'react-native';
import type { Controller } from '../controller';
import type { Position } from '../exchanges';
import { money, signed } from '../format';
import { useTheme } from '../theme';
import { AssetCard, ChartSheet, PositionTile } from '../Exchange';
import { Btn, Card, Chip, Empty, Field, Pill, Reveal, SectionHeader, Txt } from '../ui';
import { baseTicker } from '../pairs';
import { CoinIcon, cachedCoinImage } from '../PairPicker';

const PCTS = [25, 50, 75, 100];
const LEVS = [1, 3, 5, 10, 20, 50];

function PositionCard({ p, ctl, onChart }: { p: Position; ctl: Controller; onChart: () => void }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [pct, setPct] = useState(100);
  const [lev, setLev] = useState('');
  const levBusy = Boolean(ctl.busy[`lev-${p.symbol}-${p.side}`]);
  const pnl = Number(p.unrealisedPnl) || 0;
  const long = p.side === 'LONG';
  const key = `${p.symbol}-${p.side}`;
  const closing = Boolean(ctl.busy[`close-${key}`]);
  const saving = Boolean(ctl.busy[`tpsl-${key}`]);
  const entry = Number(p.avgPrice) || 0; const mark = Number(p.markPrice) || 0;
  const roe = entry && mark ? ((mark - entry) / entry) * Number(p.leverage || 1) * (long ? 1 : -1) * 100 : null;
  return (
    <PositionTile onChart={onChart} m={{ symbol: p.symbol, side: p.side, leverage: p.leverage, marginMode: p.marginMode === 'isolated' ? 'Isolated' : p.marginMode === 'cross' ? 'Cross' : undefined, size: p.size, entry, mark: mark || entry, liq: Number(p.liqPrice) || undefined, pnl, roe, stopLoss: Number(p.stopLoss) || undefined, takeProfits: Number(p.takeProfit) ? [Number(p.takeProfit)] : [] }}>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
        <Btn label={open ? 'Tutup editor' : 'TP / SL'} variant="tonal" icon="shield" onPress={() => setOpen(!open)} flex />
        <Btn label="Tutup posisi" variant="danger" icon="stop" loading={closing && pct >= 100} onPress={() => ctl.closeLivePosition(p, 100)} flex />
      </View>
      {open ? (
        <View style={{ marginTop: 6, padding: 12, borderRadius: 16, backgroundColor: t.surfaceHigh }}>
          <Txt variant="titleSmall">Ubah SL / TP</Txt>
          <Txt variant="bodySmall" color={t.onSurfaceVariant}>Kosongkan untuk tetap. Isi 0 untuk menghapus. Harga memakai mark price.</Txt>
          <Field label={`Stop loss ${long ? '(< mark)' : '(> mark)'}`} value={sl} onChangeText={setSl} keyboardType="decimal-pad" />
          <Field label={`Take profit ${long ? '(> mark)' : '(< mark)'}`} value={tp} onChangeText={setTp} keyboardType="decimal-pad" />
          <Btn label="Terapkan di exchange" icon="check" loading={saving} disabled={!sl.trim() && !tp.trim()} onPress={async () => { if (await ctl.setLiveTpSl(p, { stopLoss: sl, takeProfit: tp })) { setSl(''); setTp(''); setOpen(false); } }} />
          <Txt variant="titleSmall" style={{ marginTop: 14 }}>Leverage</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 }}>{LEVS.map((x) => <Chip key={x} label={`${x}x`} selected={lev === String(x)} onPress={() => setLev(String(x))} />)}</View>
          <Btn label={lev ? `Set leverage ${lev}x` : 'Pilih leverage'} variant="outlined" icon="bolt" loading={levBusy} disabled={!lev} onPress={async () => { if (await ctl.setLiveLeverage(p, Number(lev))) setLev(''); }} />
          <Txt variant="titleSmall" style={{ marginTop: 14 }}>Tutup sebagian</Txt>
          <View style={{ flexDirection: 'row', marginTop: 8 }}>{PCTS.map((x) => <Chip key={x} label={`${x}%`} selected={pct === x} onPress={() => setPct(x)} />)}</View>
          <Btn label={`Tutup ${pct}% (market)`} variant="outlined" icon="stop" loading={closing} onPress={() => ctl.closeLivePosition(p, pct)} />
        </View>
      ) : null}
    </PositionTile>
  );
}

export function Positions({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const { account, positions } = ctl;
  const ex = ctl.credentials.exchange;
  const total = positions.reduce((sum, p) => sum + (Number(p.unrealisedPnl) || 0), 0);
  const [chart, setChart] = useState<string | null>(null);
  return (
    <View>
      {account ? (
        <Reveal index={0}>
          <AssetCard label={`EKUITAS ${ex.toUpperCase()}`} equity={Number(account.equity) || 0} badge={<Pill label={ctl.credentials.keys[ex].env === 'mainnet' ? 'MAINNET' : 'TESTNET'} tone={ctl.credentials.keys[ex].env === 'mainnet' ? 'warn' : 'info'} />} caption="Diperbarui otomatis tiap 20 detik saat tab ini terbuka." stats={[{ label: 'Tersedia', value: `$${money(account.available)}`, color: t.success }, { label: 'uPNL', value: `${signed(total)} $`, color: total >= 0 ? t.success : t.error }, { label: 'Posisi', value: String(positions.length) }]} />
        </Reveal>
      ) : <Empty icon="wallet" title="Exchange belum tersinkron" copy={`Isi API Key & Secret ${ex.toUpperCase()} di Pengaturan, lalu tekan Sinkron.`} />}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <Btn label="Sinkron saldo & posisi" icon="sync" variant="tonal" loading={ctl.busy.exchange} onPress={() => ctl.syncAccount()} flex />
        {positions.length > 1 ? <Btn label="Tutup semua posisi" variant="danger" icon="stop" loading={ctl.busy['close-all']} onPress={ctl.closeAllLive} flex /> : null}
      </View>
      {positions.map((p, i) => <Reveal key={`${p.symbol}-${p.side}`} index={i + 1}><PositionCard p={p} ctl={ctl} onChart={() => setChart(p.symbol)} /></Reveal>)}
      {account && !positions.length ? <Empty icon="inbox" title="Tidak ada posisi aktif" copy="Posisi yang dibuka di exchange akan muncul di sini dan bisa langsung diatur SL/TP-nya." /> : null}
      {ctl.openOrders.length ? <View style={{ marginTop: 6 }}>
        <SectionHeader title={`Order terbuka (${ctl.openOrders.length})`} />
        {ctl.openOrders.map((o) => <Card key={o.id} tone="high" style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <CoinIcon base={baseTicker(o.symbol)} image={cachedCoinImage(baseTicker(o.symbol))} size={30} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="titleSmall" numberOfLines={1}>{o.symbol} · <Txt variant="titleSmall" color={o.side === 'Buy' ? t.success : t.error}>{o.side === 'Buy' ? 'Buy' : 'Sell'}</Txt></Txt>
              <Txt variant="bodySmall" color={t.onSurfaceVariant}>{o.type}{o.reduceOnly ? ' · reduce' : ''} · {o.qty} @ {o.price || (o.trigger ? `trg ${o.trigger}` : 'market')}</Txt>
            </View>
            <Btn label="Batal" variant="text" icon="remove" loading={Boolean(ctl.busy[`cancel-${o.id}`])} onPress={() => ctl.cancelLiveOrder(o)} />
          </View>
        </Card>)}
      </View> : null}
      {account ? <View style={{ marginTop: 6 }}>
        <SectionHeader title="Riwayat PnL" action={ctl.history.length ? 'Muat ulang' : 'Muat'} onAction={() => ctl.loadHistory()} />
        {ctl.history.length ? <View>
          <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginBottom: 6 }}>Total {ctl.history.length} trade terakhir: <Txt variant="bodySmall" color={ctl.history.reduce((a, h) => a + h.pnl, 0) >= 0 ? t.success : t.error}>{signed(ctl.history.reduce((a, h) => a + h.pnl, 0))} $</Txt> · menang {ctl.history.filter((h) => h.pnl > 0).length}/{ctl.history.length}</Txt>
          {ctl.history.slice(0, 20).map((h, i) => <View key={`${h.symbol}-${h.closedAt}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: t.outlineVariant }}>
            <CoinIcon base={baseTicker(h.symbol)} image={cachedCoinImage(baseTicker(h.symbol))} size={26} />
            <View style={{ flex: 1 }}><Txt variant="label">{h.symbol}{h.side ? ` · ${h.side}` : ''}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{new Date(h.closedAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Txt></View>
            <Txt variant="label" color={h.pnl >= 0 ? t.success : t.error}>{signed(h.pnl)} $</Txt>
          </View>)}
        </View> : <Txt variant="bodySmall" color={t.onSurfaceVariant}>Tekan "Muat" untuk mengambil riwayat PnL dari exchange.</Txt>}
      </View> : null}
      <ChartSheet symbol={chart} onClose={() => setChart(null)} ctl={ctl} bottom={0} />
    </View>
  );
}
