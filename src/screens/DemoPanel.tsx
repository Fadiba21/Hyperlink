import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import type { Controller } from '../controller';
import { demoEquity, demoStats, liquidationPrice, pnlOf, DEMO_START } from '../demo';
import { getExchange } from '../exchanges';
import { MarketChart } from '../CoinGeckoChart';
import { AssetCard } from '../Exchange';
import { money, price as fmtPrice, signed, timeAgo } from '../format';
import { useTheme } from '../theme';
import { Btn, Card, Chip, Empty, Field, Pill, Press, Reveal, SectionHeader, Stat, Txt } from '../ui';
import { SignalCard } from './SignalCard';

export function DemoPanel({ ctl, go }: { ctl: Controller; go: () => void }) {
  const t = useTheme();
  const { demo, prices, settings, tickers } = ctl;
  const [positionLevels, setPositionLevels] = useState<Record<string, { sl: string; tp: string }>>({});
  const symbol = settings.demoSymbol;
  const exchange = getExchange(ctl.credentials.exchange);
  const provider = settings.demoPriceSource === 'exchange' ? exchange.label : 'CoinGecko';
  const env = ctl.credentials.keys[ctl.credentials.exchange].env;
  const last = prices[symbol] || 0;
  const equity = demoEquity(demo, prices);
  const pnl = equity - DEMO_START;
  const latest = ctl.signals.find((s) => s.status !== 'dismissed');
  const [chartSymbol, setChartSymbol] = useState(latest?.symbol || symbol);
  const [chartCollapsed, setChartCollapsed] = useState(false);
  useEffect(() => { if (latest) setChartSymbol(latest.symbol); }, [latest]);
  const stats = demoStats(demo.closed);
  const simmed = ctl.signals.filter((x) => x.sim && x.sim.outcome !== 'noentry');
  const simWins = simmed.filter((x) => x.sim!.outcome === 'TP').length;
  const simPnl = simmed.reduce((a, x) => a + (x.sim!.pnlPct || 0), 0);
  const watch = Array.from(new Set(['BTCUSDT', 'ETHUSDT', 'SOLUSDT', symbol]));
  const live = Boolean(last && !ctl.pricesError);
  let i = 0;
  return (
    <View>
      <Reveal index={i++}>
        <AssetCard label="AKUN DEMO · PAPER" equity={equity} badge={<Pill label={live ? `${provider.toUpperCase()} LIVE` : `MENUNGGU ${provider.toUpperCase()}`} tone={live ? 'good' : 'neutral'} pulse={live} />}
          caption={ctl.priceUpdatedAt ? `Quote ${provider} diperbarui ${timeAgo(ctl.priceUpdatedAt)} · tidak ada order dikirim ke Live` : `Harga publik ${provider} · tidak ada order dikirim ke Live`}
          stats={[{ label: 'Tersedia', value: `$${money(demo.balance)}` }, { label: 'PnL total', value: `${signed(pnl)} $`, color: pnl >= 0 ? t.success : t.error }, { label: 'Win rate', value: stats.trades ? `${Math.round(stats.winRate * 100)}%` : '—' }]} />
      </Reveal>

      <SectionHeader title="Call terbaru" action={ctl.signals.length ? 'Lihat semua' : undefined} onAction={go} />
      {latest ? <Reveal index={i++}><SignalCard signal={latest} ctl={ctl} onDismiss={() => ctl.dismissSignal(latest.id)} /></Reveal> : <Empty icon="inbox" title="Belum ada call" copy="Call tervalidasi dari Telegram akan muncul di sini." />}
      <Reveal index={i++}><Card tone="high"><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1 }}><Txt variant="titleMedium">Chart call terbaru</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Entry, SL, dan TP call aktif ditampilkan langsung pada chart.</Txt></View><Btn label={chartCollapsed ? 'Tampilkan' : 'Minimalkan'} variant="text" icon={chartCollapsed ? 'down' : 'up'} onPress={() => setChartCollapsed((value) => !value)} /></View>{chartCollapsed ? <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>{chartSymbol} · chart diminimalkan</Txt> : <MarketChart symbol={chartSymbol} lastPrice={prices[chartSymbol] || 0} source={settings.demoPriceSource} exchangeId={ctl.credentials.exchange} env={env} onSymbolChange={(next) => { setChartSymbol(next); ctl.patchSettings({ demoSymbol: next }); ctl.refreshPrices([next]); }} onSourceChange={(next) => ctl.patchSettings({ demoPriceSource: next })} />}</Card></Reveal>

      {ctl.pricesError ? <Card tone="outlined"><Txt variant="bodySmall" color={t.warning}>{ctl.pricesError}</Txt></Card> : null}

      <Reveal index={i++}>
        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {watch.map((s) => {
              const tk = tickers.find((x) => x.symbol === s);
              const sel = s === symbol;
              return (
                <Press key={s} onPress={() => ctl.patchSettings({ demoSymbol: s })} radius={14} style={{ flex: 1 }}>
                  <View style={{ padding: 10, borderRadius: 14, backgroundColor: sel ? t.secondaryContainer : t.surfaceHigh, borderWidth: sel ? 1 : 0, borderColor: t.outline }}>
                    <Txt variant="labelSmall" color={t.onSurfaceVariant}>{s.replace('USDT', '')}</Txt>
                    <Txt variant="titleSmall">${fmtPrice(tk?.last || prices[s])}</Txt>
                    <Txt variant="labelSmall" color={(tk?.change24h || 0) >= 0 ? t.success : t.error}>{tk ? `${(tk.change24h * 100).toFixed(2)}%` : '—'}</Txt>
                  </View>
                </Press>
              );
            })}
          </View>
        </Card>
      </Reveal>

      <Reveal index={i++}>
        <Card tone="high">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="titleMedium">Auto-entry dari signal</Txt>
              <Txt variant="body" color={t.onSurfaceVariant}>Telegram → Gemini → posisi demo otomatis saat Automation aktif. Margin: {settings.marginSource === 'ai' ? 'saran AI per call' : `${settings.marginPct}% ${settings.marginMode}`}. Entry jauh dari harga menunggu quote CoinGecko menyentuh level entry.</Txt>
            </View>
            <Switch value={settings.demoAutoEntry} onValueChange={(v) => ctl.patchSettings({ demoAutoEntry: v })} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={settings.demoAutoEntry ? t.onPrimary : t.outline} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Txt variant="body">Automation</Txt>
            <Switch value={settings.automationOn} onValueChange={(v) => ctl.setAutomation(v)} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={settings.automationOn ? t.onPrimary : t.outline} />
          </View>
          <Btn label={latest ? `Buka demo dari ${latest.symbol} ${latest.direction}` : 'Belum ada call tervalidasi'} variant="tonal" icon="signals" disabled={!latest} onPress={() => latest && ctl.demoFromSignal({ ...latest, id: `${latest.id}-m${Date.now()}` }, 'Manual dari call')} />
        </Card>
      </Reveal>

      {demo.orders.length ? (<>
        <SectionHeader title={`Order tertunda (${demo.orders.length})`} />
        {demo.orders.map((o) => (
          <Card key={o.id} tone="outlined">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View><Txt variant="titleMedium">{o.symbol}</Txt><Txt variant="bodySmall" color={o.side === 'LONG' ? t.success : t.error}>{o.side} · {o.leverage}x · margin {o.marginPct || 'qty tetap'}% {o.marginMode}</Txt></View>
              <Pill label={`Entry ${fmtPrice(o.entry)}`} tone="info" pulse />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
                <Stat label="HARGA PASAR" value={fmtPrice(prices[o.symbol])} /><Stat label="SL" value={o.stopLoss ? fmtPrice(o.stopLoss) : '—'} color={t.error} /><Stat label="TP" value={o.takeProfit ? fmtPrice(o.takeProfit) : '—'} color={t.success} />
            </View>
            {o.takeProfits && o.takeProfits.length > 1 ? <Txt variant="bodySmall" color={t.success} style={{ marginTop: 6 }}>Target: {o.takeProfits.map((target, index) => `TP${index + 1} ${fmtPrice(target)}`).join(' · ')}</Txt> : null}
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>{o.source} · kedaluwarsa {new Date(o.expiresAt).toLocaleString()}</Txt>
            <Btn label="Batalkan" variant="text" icon="close" onPress={() => ctl.demoCancelOrder(o.id)} />
          </Card>
        ))}
      </>) : null}

      <SectionHeader title={`Posisi demo (${demo.positions.length})`} />
      {demo.positions.length ? demo.positions.map((p) => {
        const px = prices[p.symbol] || p.entry; const pl = pnlOf(p, px);
        const levels = positionLevels[p.id] || { sl: p.stopLoss ? String(p.stopLoss) : '', tp: p.takeProfit ? String(p.takeProfit) : '' };
        const changeLevel = (key: 'sl' | 'tp', value: string) => setPositionLevels((prev) => ({ ...prev, [p.id]: { ...(prev[p.id] || { sl: p.stopLoss ? String(p.stopLoss) : '', tp: p.takeProfit ? String(p.takeProfit) : '' }), [key]: value } }));
        const saveLevels = () => {
          const parse = (v: string) => { if (!v.trim()) return undefined; const n = Number(v.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : NaN; };
          const stopLoss = parse(levels.sl); const takeProfit = parse(levels.tp);
          if (Number.isNaN(stopLoss) || Number.isNaN(takeProfit)) { ctl.notify('Nilai SL/TP harus berupa harga positif.', 'error'); return; }
          ctl.demoSetTpSl(p.id, { stopLoss, takeProfit });
        };
        return (
          <Reveal key={p.id} index={i++}>
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View><Txt variant="titleMedium">{p.symbol}</Txt><Txt variant="bodySmall" color={p.side === 'LONG' ? t.success : t.error}>{p.side} · {p.leverage}x {p.marginMode || 'Isolated'} · {p.size}</Txt></View>
                <Pill label={`${signed(pl)} USDT`} tone={pl >= 0 ? 'good' : 'bad'} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
                <Stat label="ENTRY" value={fmtPrice(p.entry)} /><Stat label={`MARK · ${provider.toUpperCase()}`} value={fmtPrice(px)} /><Stat label="LIKUID." value={fmtPrice(liquidationPrice(p, demo.balance))} color={t.warning} />
              </View>
              {p.takeProfits && p.takeProfits.length > 1 ? <Txt variant="bodySmall" color={t.success} style={{ marginTop: 8 }}>Target bertahap: {p.takeProfits.map((target, index) => `${p.hitTakeProfits?.includes(index) ? '✓' : `TP${index + 1}`} ${fmtPrice(target)}`).join(' · ')}</Txt> : null}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={{ flex: 1 }}><Field label="Stop Loss" value={levels.sl} onChangeText={(v) => changeLevel('sl', v)} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Take Profit" value={levels.tp} onChangeText={(v) => changeLevel('tp', v)} keyboardType="decimal-pad" /></View>
              </View>
              <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>{p.source || 'Manual'} · kosongkan SL/TP untuk menghapus level.</Txt>
              <Btn label="Simpan SL/TP" variant="tonal" icon="check" onPress={saveLevels} />
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'space-between' }}>
                {([0.25, 0.5, 0.75, 1] as const).map((fraction) => <Btn key={fraction} label={fraction === 1 ? 'Tutup semua' : `Tutup ${fraction * 100}%`} variant={fraction === 1 ? 'outlined' : 'text'} onPress={() => ctl.demoClose(p.id, fraction)} style={{ flexGrow: 1, flexBasis: '46%', minWidth: 124 }} />)}
              </View>
            </Card>
          </Reveal>
        );
      }) : <Empty icon="inbox" title="Belum ada posisi demo" copy="Buka order market/limit atau aktifkan auto-entry dari signal." />}

      {stats.trades ? (<>
        <SectionHeader title="Hasil trading demo" />
        <Card tone="high">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Stat label="TRADE" value={String(stats.trades)} />
            <Stat label="WIN RATE" value={`${(stats.winRate * 100).toFixed(0)}%`} color={stats.winRate >= 0.5 ? t.success : t.error} />
            <Stat label="TOTAL PNL" value={`${signed(stats.totalPnl)}`} color={stats.totalPnl >= 0 ? t.success : t.error} />
            <Stat label="PROFIT F." value={Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : '∞'} />
          </View>
          {stats.bySource.slice(0, 5).map((b) => (
            <View key={b.source} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8 }}>
              <Txt variant="bodySmall" color={t.onSurfaceVariant} numberOfLines={1} style={{ flex: 1 }}>{b.source} · {b.trades}x · {(b.winRate * 100).toFixed(0)}% menang</Txt>
              <Txt variant="titleSmall" color={b.pnl >= 0 ? t.success : t.error}>{signed(b.pnl)}</Txt>
            </View>
          ))}
        </Card>
      </>) : null}

      {simmed.length ? (<>
        <SectionHeader title="Replay signal · candle CoinGecko" />
        <Card tone="outlined">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Stat label="CALL" value={String(simmed.length)} />
            <Stat label="TP" value={`${simWins}`} color={t.success} />
            <Stat label="SL/LIKUID." value={`${simmed.filter((x) => x.sim!.outcome === 'SL' || x.sim!.outcome === 'liquidated').length}`} color={t.error} />
            <Stat label="TOTAL" value={`${signed(simPnl)}%`} color={simPnl >= 0 ? t.success : t.error} />
          </View>
          <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>Replay memakai candle OHLC CoinGecko. Granularitas historis mengikuti rentang data provider. Hasil replay tidak mengubah saldo demo.</Txt>
        </Card>
      </>) : null}
      <Btn label="Simulasikan semua call" variant="tonal" icon="chart" disabled={!ctl.signals.length} onPress={ctl.simulateAll} />

      {demo.closed.length ? (<>
        <SectionHeader title="Riwayat trading" />
        <Card tone="outlined">
          {demo.closed.slice(0, 8).map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
              <Txt variant="body">{c.symbol} {c.side} · {c.reason}</Txt>
              <Txt variant="titleSmall" color={c.pnl >= 0 ? t.success : t.error}>{signed(c.pnl)}</Txt>
            </View>
          ))}
        </Card>
      </>) : null}
      <Btn label="Reset akun demo ($10,000)" variant="text" icon="refresh" onPress={ctl.demoReset} />
      <Reveal index={i++}>
        <Card tone="high">
          <Txt variant="titleMedium">Sumber harga Demo</Txt>
          <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Pilih feed publik untuk harga, chart, dan simulasi. Tidak menggunakan endpoint order.</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginTop: 10 }}>
            <Chip label="CoinGecko" selected={settings.demoPriceSource === 'coingecko'} onPress={() => ctl.patchSettings({ demoPriceSource: 'coingecko' })} />
            <Chip label={`${exchange.label} API`} selected={settings.demoPriceSource === 'exchange'} onPress={() => ctl.patchSettings({ demoPriceSource: 'exchange' })} />
          </View>
          <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 4 }}>{settings.demoPriceSource === 'exchange' ? `${exchange.label} · feed market ${env === 'mainnet' ? 'Mainnet' : 'Testnet'} yang sedang dipilih.` : 'API publik CoinGecko · tanpa kunci API.'}</Txt>
        </Card>
      </Reveal>
    </View>
  );
}
