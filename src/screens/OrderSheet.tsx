import { ActivityIndicator, ScrollView, View, useWindowDimensions } from 'react-native';
import type { Controller } from '../controller';
import { entryRange, takeProfitLevels } from '../signal';
import { money, price } from '../format';
import { useTheme } from '../theme';
import { Btn, BottomSheet, Icon, Pill, Stat, Txt } from '../ui';

export function OrderSheet({ ctl, bottom, env, exchange }: { ctl: Controller; bottom: number; env: 'testnet' | 'mainnet'; exchange: string }) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const sheet = ctl.sheet;
  const plan = sheet?.plan;
  const manual = Boolean(sheet?.manual);
  const band = sheet ? entryRange(sheet.signal) : null;
  const targets = sheet ? takeProfitLevels(sheet.signal) : [];
  const metric = (label: string, value: string, color?: string) => <View key={label} style={compact ? { width: '48%', minWidth: 0 } : { flex: 1, minWidth: 0 }}><Stat label={label} value={value} color={color} /></View>;
  return (
    <BottomSheet visible={Boolean(sheet)} onClose={ctl.closeSheet} bottom={bottom} height={plan ? '88%' : undefined}>
      {sheet ? (
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: compact ? 'column' : 'row', justifyContent: 'space-between', alignItems: compact ? 'flex-start' : 'center', gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="titleLarge" numberOfLines={1}>{sheet.signal.symbol} <Txt variant="titleLarge" color={sheet.signal.direction === 'LONG' ? t.success : t.error}>{sheet.signal.direction}</Txt></Txt>
              <Txt variant="body" color={t.onSurfaceVariant}>{manual ? 'Tinjau order manual sebelum konfirmasi' : 'Review sebelum kirim order'}</Txt>
            </View>
            <Pill label={env === 'mainnet' ? `${exchange} · LIVE` : `${exchange} · UJI`} tone={env === 'mainnet' ? 'warn' : 'info'} />
          </View>
          {!plan && !sheet.error ? (
            <View style={{ alignItems: 'center', padding: 32 }}><ActivityIndicator color={t.primary} /><Txt variant="body" color={t.onSurfaceVariant} style={{ marginTop: 12, textAlign: 'center' }}>Mengambil harga & aturan pair dari {exchange}…</Txt></View>
          ) : null}
          {sheet.error ? (
            <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: t.errorContainer, flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
              <Icon name="error" color={t.onErrorContainer} /><Txt variant="body" color={t.onErrorContainer} style={{ flex: 1, minWidth: 0 }}>{sheet.error}</Txt>
            </View>
          ) : null}
          {plan ? (
            <View>
              {!manual && band ? <View style={{ marginTop: 14, padding: 12, borderRadius: 16, backgroundColor: t.primaryContainer }}><Txt variant="labelSmall" color={t.onPrimaryContainer}>ZONA ENTRY CALL</Txt><Txt variant="titleSmall" color={t.onPrimaryContainer}>{price(band.low)} – {price(band.high)}</Txt></View> : null}
              <View style={{ flexDirection: 'row', flexWrap: compact ? 'wrap' : 'nowrap', justifyContent: 'space-between', columnGap: 10, rowGap: compact ? 12 : 0, marginTop: 18 }}>
                {metric('HARGA PASAR', price(plan.lastPrice))}{metric('QTY', plan.qty)}{metric('LEVERAGE', `${plan.leverage}x ${plan.marginMode}`)}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: compact ? 'wrap' : 'nowrap', justifyContent: 'space-between', columnGap: 10, rowGap: compact ? 12 : 0, marginTop: 16 }}>
                {metric('STOP LOSS', price(plan.stopLoss), t.error)}{metric('TP EXCHANGE', Number(plan.takeProfit) > 0 ? price(plan.takeProfit) : '—', Number(plan.takeProfit) > 0 ? t.success : t.onSurfaceVariant)}{metric('MARGIN', `${money(plan.margin)} USDT`)}
              </View>
              {!manual ? <View style={{ marginTop: 12 }}>
                <Txt variant="labelSmall" color={t.onSurfaceVariant}>TARGET CALL · {targets.length} LEVEL</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{targets.map((target, index) => <Pill key={`${target}-${index}`} label={`TP${index + 1} ${price(target)}`} tone="good" />)}</View>
                {targets.length > 1 ? <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 6 }}>Exchange saat ini memasang TP1 sebagai proteksi native order; target berikutnya tetap terlihat pada riwayat call dan dapat diatur bertahap dari menu posisi.</Txt> : null}
              </View> : null}
              <View style={{ marginTop: 16, padding: 14, borderRadius: 18, backgroundColor: t.surfaceContainer }}>
                <Txt variant="body">Nilai posisi ≈ {money(plan.notional)} USDT. Jika SL kena, perkiraan rugi <Txt variant="titleSmall" color={t.error}>{money(plan.maxLoss)} USDT</Txt>.</Txt>
              </View>
              {plan.warnings.map((w) => <View key={w} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 }}><Icon name="warning" size={18} color={t.warning} /><Txt variant="bodySmall" color={t.warning} style={{ flex: 1, minWidth: 0 }}>{w}</Txt></View>)}
            </View>
          ) : null}
          <View style={{ flexDirection: compact ? 'column-reverse' : 'row', gap: 8, marginTop: 14 }}>
            <Btn label="Batal" variant="outlined" onPress={ctl.closeSheet} flex={!compact} />
            <Btn label={env === 'mainnet' ? (manual ? 'Konfirmasi order manual LIVE' : 'Kirim order live') : manual ? 'Konfirmasi order manual' : 'Kirim order'} icon="bolt" disabled={!plan} loading={ctl.busy.order} onPress={ctl.executeOrder} flex={!compact} />
          </View>
        </ScrollView>
      ) : null}
    </BottomSheet>
  );
}
