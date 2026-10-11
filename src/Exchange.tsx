import { useState, type ReactNode } from 'react';
import { useChartContext } from './chartContext';
import { View } from 'react-native';
import { MarketChart } from './CoinGeckoChart';
import type { Controller } from './controller';
import { getExchange } from './exchanges';
import { money, price as fmtPrice, signed } from './format';
import { baseTicker } from './pairs';
import { CoinIcon, cachedCoinImage } from './PairPicker';
import { useTheme } from './theme';
import { BottomSheet, Icon, Press, Txt } from './ui';

/** Exchange-style asset overview: big equity (hideable), then a row of key figures. */
export function AssetCard({ label, badge, equity, caption, stats, footer }: {
  label: string; badge?: ReactNode; equity: number | null; caption?: string; stats: Array<{ label: string; value: string; color?: string }>; footer?: ReactNode;
}) {
  const t = useTheme();
  const { hideBalances: hidden, toggleHide } = useChartContext();
  const mask = (text: string) => (hidden ? '••••' : text);
  return <View style={{ marginBottom: 12, padding: 18, borderRadius: 22, backgroundColor: t.surfaceContainer }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant}>{label}</Txt>
        <Press onPress={toggleHide} radius={14}><View style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}><Icon name={hidden ? 'eyeOff' : 'eye'} size={16} color={t.onSurfaceVariant} /></View></Press>
      </View>
      {badge}
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Txt variant="headline" style={{ fontSize: 34, lineHeight: 44, fontWeight: '700' }}>{equity === null ? '—' : mask(money(equity))}</Txt>
      <Txt variant="titleSmall" color={t.onSurfaceVariant}>USDT</Txt>
    </View>
    {caption ? <Txt variant="bodySmall" color={t.onSurfaceVariant}>{caption}</Txt> : null}
    <View style={{ flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: t.outlineVariant }}>
      {stats.map((s, i) => <View key={s.label} style={{ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, borderLeftWidth: i ? 1 : 0, borderLeftColor: t.outlineVariant }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{s.label}</Txt>
        <Txt variant="titleSmall" color={s.color} numberOfLines={1}>{mask(s.value)}</Txt>
      </View>)}
    </View>
    {footer}
  </View>;
}

function Cell({ label, value, color, align = 'left' }: { label: string; value: string; color?: string; align?: 'left' | 'right' }) {
  const t = useTheme();
  return <View style={{ flex: 1, minWidth: 0, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}><Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1}>{label}</Txt><Txt variant="titleSmall" color={color} numberOfLines={1}>{value}</Txt></View>;
}

export type TileModel = { symbol: string; side: 'LONG' | 'SHORT'; leverage: number | string; marginMode?: string; size: string; entry: number; mark: number; liq?: number; margin?: number; pnl: number; roe?: number | null; stopLoss?: number; takeProfits: number[]; tag?: string };

/** Position card in the layout used by exchange apps: header, PnL/ROE, 3x2 grid, TP/SL strip. */
export function PositionTile({ m, onChart, children }: { m: TileModel; onChart?: () => void; children?: ReactNode }) {
  const t = useTheme();
  const long = m.side === 'LONG';
  const base = baseTicker(m.symbol);
  const up = m.pnl >= 0;
  const tone = long ? t.success : t.error;
  return <View style={{ marginBottom: 12, padding: 16, borderRadius: 20, backgroundColor: t.surfaceContainer, borderLeftWidth: 4, borderLeftColor: tone }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <CoinIcon base={base} image={cachedCoinImage(base)} size={36} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Txt variant="titleMedium" numberOfLines={1}>{m.symbol}</Txt>
          {m.tag ? <View style={{ paddingHorizontal: 6, height: 18, borderRadius: 5, backgroundColor: t.surfaceHigh, justifyContent: 'center' }}><Txt variant="labelSmall" color={t.onSurfaceVariant}>{m.tag}</Txt></View> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
          <View style={{ paddingHorizontal: 7, height: 18, borderRadius: 5, backgroundColor: tone, justifyContent: 'center' }}><Txt variant="labelSmall" color={long ? t.onSuccess : t.onError} style={{ fontWeight: '800' }}>{long ? 'LONG' : 'SHORT'}</Txt></View>
          <View style={{ paddingHorizontal: 7, height: 18, borderRadius: 5, backgroundColor: t.surfaceHigh, justifyContent: 'center' }}><Txt variant="labelSmall">{m.marginMode ? `${m.marginMode} ` : ''}{m.leverage}x</Txt></View>
        </View>
      </View>
      {onChart ? <Press onPress={onChart} radius={18}><View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: t.surfaceHigh, alignItems: 'center', justifyContent: 'center' }}><Icon name="chart" size={18} color={t.onSurface} /></View></Press> : null}
    </View>
    <View style={{ flexDirection: 'row', marginTop: 14 }}>
      <Cell label="PnL belum terealisasi (USDT)" value={signed(m.pnl)} color={up ? t.success : t.error} />
      <Cell label="ROE" value={m.roe === null || m.roe === undefined ? '—' : `${m.roe >= 0 ? '+' : ''}${m.roe.toFixed(2)}%`} color={m.roe === null || m.roe === undefined ? undefined : m.roe >= 0 ? t.success : t.error} align="right" />
    </View>
    <View style={{ flexDirection: 'row', marginTop: 12, rowGap: 10 }}>
      <Cell label="Ukuran" value={m.size} />
      <Cell label="Harga masuk" value={fmtPrice(m.entry)} />
      <Cell label="Harga mark" value={fmtPrice(m.mark)} align="right" />
    </View>
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      <Cell label="Margin" value={m.margin ? `$${money(m.margin)}` : '—'} />
      <Cell label="Likuidasi" value={m.liq ? fmtPrice(m.liq) : '—'} color={m.liq ? t.warning : undefined} />
      <Cell label="Nilai posisi" value={`$${money(m.size && m.mark ? Number(m.size) * m.mark : 0)}`} align="right" />
    </View>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: t.surfaceLow }}>
      <Icon name="shield" size={15} color={t.onSurfaceVariant} />
      <Txt variant="labelSmall" color={t.onSurfaceVariant}>TP/SL</Txt>
      <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
        {m.takeProfits.length ? m.takeProfits.map((p, i) => <Txt key={`${i}-${p}`} variant="labelSmall" color={t.success}>TP{m.takeProfits.length > 1 ? i + 1 : ''} {fmtPrice(p)}</Txt>) : <Txt variant="labelSmall" color={t.onSurfaceVariant}>TP —</Txt>}
        <Txt variant="labelSmall" color={m.stopLoss ? t.error : t.onSurfaceVariant}>SL {m.stopLoss ? fmtPrice(m.stopLoss) : '—'}</Txt>
      </View>
    </View>
    {children}
  </View>;
}

/** Bottom sheet with the full chart for one symbol (opened from a position tile). */
export function ChartSheet({ symbol, onClose, ctl, bottom }: { symbol: string | null; onClose: () => void; ctl: Controller; bottom: number }) {
  const demo = ctl.settings.accountMode === 'demo';
  const exchangeId = ctl.credentials.exchange;
  const env = ctl.credentials.keys[exchangeId].env;
  const [source, setSource] = useState<'exchange' | 'coingecko'>(demo ? (ctl.settings.demoPriceSource === 'exchange' ? 'exchange' : 'coingecko') : 'exchange');
  return <BottomSheet visible={Boolean(symbol)} onClose={onClose} bottom={bottom} height="86%">
    {symbol ? <View style={{ flex: 1 }}><MarketChart symbol={symbol} lastPrice={ctl.prices[symbol] || 0} source={source} exchangeId={exchangeId} env={env} bottom={bottom} onSourceChange={setSource} /><Txt variant="labelSmall" color="#888" style={{ marginTop: 8 }}>{getExchange(exchangeId).label} · {demo ? 'akun Demo' : 'akun Live'}</Txt></View> : null}
  </BottomSheet>;
}
