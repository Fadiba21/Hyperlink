import { useState } from 'react';
import { View } from 'react-native';
import type { Controller } from '../controller';
import type { SignalRecord } from '../signal';
import { entryRange, riskReward, takeProfitLevels } from '../signal';
import { effectiveMargin } from '../advice';
import { price, timeAgo } from '../format';
import { useTheme } from '../theme';
import { Btn, Card, Chip, Icon, Pill, Slider, Stat, Txt } from '../ui';

const OUTCOME: Record<string, string> = { TP: 'Take Profit tercapai', SL: 'Stop Loss kena', open: 'Masih berjalan', noentry: 'Entry tidak tersentuh', liquidated: 'Terlikuidasi' };

export function SignalCard({ signal, ctl, onReview, onDismiss, onRemove, busy }: { signal: SignalRecord; ctl: Controller; onReview?: () => void; onDismiss?: () => void; onRemove?: () => void; busy?: boolean }) {
  const t = useTheme();
  const [edit, setEdit] = useState(false);
  const long = signal.direction === 'LONG';
  const accent = long ? t.success : t.error;
  const status = { ready: ['Siap', 'info'], executed: ['Dieksekusi', 'good'], failed: ['Gagal', 'bad'], dismissed: ['Diabaikan', 'neutral'] }[signal.status] as [string, 'info' | 'good' | 'bad' | 'neutral'];
  const m = effectiveMargin(ctl.settings, signal);
  const adv = signal.advice;
  const sim = signal.sim;
  const band = entryRange(signal);
  const targets = takeProfitLevels(signal);
  const actionable = signal.status === 'ready' || signal.status === 'failed';
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: long ? t.successContainer : t.errorContainer }}>
          <Icon name={long ? 'up' : 'down'} color={long ? t.onSuccessContainer : t.onErrorContainer} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="titleMedium">{signal.symbol}</Txt>
          <Txt variant="bodySmall" color={accent}>{signal.direction} · {signal.leverage}x · R:R {riskReward(signal).toFixed(1)}</Txt>
        </View>
        <Pill label={status[0]} tone={status[1]} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: t.outlineVariant }}>
        <Stat label="ZONA ENTRY" value={band.low === band.high ? price(band.low) : `${price(band.low)} – ${price(band.high)}`} />
        <Stat label="STOP LOSS" value={price(signal.stopLoss)} color={t.error} />
      </View>
      <View style={{ marginTop: 10 }}>
        <Txt variant="labelSmall" color={t.onSurfaceVariant}>TARGET TAKE PROFIT · {targets.length} LEVEL</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>{targets.map((target, index) => <Pill key={`${index}-${target}`} label={`TP${index + 1}  ${price(target)}`} tone="good" />)}</View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
        <Txt variant="bodySmall" color={t.onSurfaceVariant} numberOfLines={1} style={{ flex: 1 }}>{signal.source} · {timeAgo(signal.callTime ?? signal.createdAt)}</Txt>
        <Txt variant="labelSmall" color={signal.confidence >= 0.9 ? t.success : t.warning}>{Math.round(signal.confidence * 100)}% AI</Txt>
      </View>

      <View style={{ marginTop: 12, padding: 12, borderRadius: 16, backgroundColor: t.surfaceHigh }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
            <Icon name="brain" size={18} color={t.primary} />
            <Txt variant="titleSmall">Margin {m.pct}% · {m.mode}</Txt>
          </View>
          <Pill label={m.from === 'manual' ? 'Manual' : m.from === 'ai' ? 'Saran AI' : 'Default'} tone={m.from === 'ai' ? 'info' : 'neutral'} />
        </View>
        {adv ? (
          <View style={{ marginTop: 6 }}>
            <Txt variant="bodySmall" color={t.onSurfaceVariant}>{adv.source === 'ai' ? 'AI menyarankan' : 'Saran lokal'}: <Txt variant="bodySmall" color={t.onSurface}>{adv.pct}% {adv.mode}</Txt> · risiko <Txt variant="bodySmall" color={adv.risk === 'tinggi' ? t.error : adv.risk === 'sedang' ? t.warning : t.success}>{adv.risk}</Txt></Txt>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 2 }}>{adv.reason}</Txt>
          </View>
        ) : <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>Belum ada saran margin untuk call ini.</Txt>}
        {edit ? (
          <View style={{ marginTop: 8 }}>
            <Slider value={m.pct} min={1} max={100} onChange={(n) => ctl.setSignalMargin(signal.id, n, m.mode)} format={(n) => `${n}%`} />
            <View style={{ flexDirection: 'row', marginTop: 4 }}>
              <Chip label="Isolated" selected={m.mode === 'Isolated'} onPress={() => ctl.setSignalMargin(signal.id, m.pct, 'Isolated')} />
              <Chip label="Cross" selected={m.mode === 'Cross'} onPress={() => ctl.setSignalMargin(signal.id, m.pct, 'Cross')} />
            </View>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
          <Btn label={edit ? 'Selesai' : 'Atur margin'} variant="text" icon="settings" onPress={() => setEdit(!edit)} />
          {adv ? <Btn label="Pakai saran" variant="text" icon="check" onPress={() => ctl.applyAdvice(signal.id)} /> : null}
          <Btn label={adv ? 'Minta ulang' : 'Minta saran AI'} variant="text" icon="refresh" loading={ctl.busy[`advice-${signal.id}`]} onPress={() => ctl.askAdvice(signal.id)} />
        </View>
      </View>

      {sim ? (
        <View style={{ marginTop: 10, padding: 12, borderRadius: 16, backgroundColor: sim.outcome === 'TP' ? t.successContainer : sim.outcome === 'SL' || sim.outcome === 'liquidated' ? t.errorContainer : t.surfaceContainer }}>
          <Txt variant="titleSmall" color={sim.outcome === 'TP' ? t.onSuccessContainer : sim.outcome === 'SL' || sim.outcome === 'liquidated' ? t.onErrorContainer : t.onSurface}>Hasil simulasi: {OUTCOME[sim.outcome]}</Txt>
          {sim.pnlPct !== undefined ? <Txt variant="bodySmall" color={t.onSurfaceVariant}>ROE {sim.roiPct!.toFixed(1)}% · dampak ke saldo {sim.pnlPct >= 0 ? '+' : ''}{sim.pnlPct.toFixed(2)}% (margin {m.pct}%)</Txt> : null}
          <Txt variant="labelSmall" color={t.onSurfaceVariant}>Replay memakai candle historis CoinGecko bila tersedia; dalam satu candle SL dianggap kena lebih dulu.</Txt>
        </View>
      ) : null}
      {signal.note ? <Txt variant="bodySmall" color={t.error} style={{ marginTop: 6 }}>{signal.note}</Txt> : null}
      {signal.status === 'executed' && signal.orderId ? <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>Order ID: {signal.orderId}</Txt> : null}

      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Btn label="Simulasi hasil" variant="tonal" icon="chart" loading={ctl.busy[`sim-${signal.id}`]} onPress={() => ctl.simulateSignal(signal.id)} flex />
        {ctl.settings.accountMode === 'live' ? <Btn label="Demo" variant="tonal" icon="play" onPress={() => ctl.demoFromSignal({ ...signal, id: `${signal.id}-m${Date.now()}` }, 'Manual dari call')} flex /> : null}
      </View>
      {actionable && onReview ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ctl.settings.accountMode === 'demo' ? <Btn label="Buka posisi demo" icon="play" onPress={() => ctl.demoFromSignal({ ...signal, id: `${signal.id}-m${Date.now()}` }, 'Manual dari call')} flex /> : <Btn label="Review order live" icon="bolt" onPress={onReview} loading={busy} flex />}
          {onDismiss ? <Btn label="Abaikan" variant="text" onPress={onDismiss} /> : null}
        </View>
      ) : onRemove ? <Btn label="Hapus dari riwayat" variant="text" icon="delete" onPress={onRemove} /> : null}
    </Card>
  );
}
