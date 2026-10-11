import { Switch, View } from 'react-native';
import type { Controller } from '../controller';
import { useSoundConfig, playUiSound } from '../sounds';
import { useTheme } from '../theme';
import { Btn, Card, Chip, PopupPanel, Slider, Txt } from '../ui';

export function QuickRiskPopup({ ctl, visible, onClose }: { ctl: Controller; visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const s = ctl.settings;
  const riskLabel = s.marginPct <= 5 ? 'Konservatif' : s.marginPct <= 15 ? 'Seimbang' : s.marginPct <= 40 ? 'Agresif' : 'Sangat agresif';
  return <PopupPanel visible={visible} onClose={onClose} title="Margin & risiko" subtitle="Kontrol ringkas untuk call dan perlindungan akun.">
    <Card tone="high">
      <Txt variant="titleMedium">Ukuran posisi</Txt>
      <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Berlaku untuk call Telegram, Live maupun Demo. Periksa kembali sebelum mengirim order.</Txt>
      <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Sumber margin</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, rowGap: 8 }}>
        <Chip label="Tetap" selected={s.marginSource === 'fixed'} onPress={() => ctl.patchSettings({ marginSource: 'fixed' })} />
        <Chip label="Saran AI" selected={s.marginSource === 'ai'} onPress={() => ctl.patchSettings({ marginSource: 'ai' })} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}>
        <Txt variant="body" color={t.onSurfaceVariant}>Margin per call</Txt>
        <Txt variant="titleMedium">{s.marginPct}% · {riskLabel}</Txt>
      </View>
      <Slider value={s.marginPct} min={1} max={100} onChange={(value) => ctl.patchSettings({ marginPct: value })} format={(value) => `${value}%`} />
      {s.marginPct > 40 ? <Txt variant="bodySmall" color={t.warning}>Margin besar: satu call buruk dapat menghabiskan sebagian saldo.</Txt> : null}
      <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Mode margin</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 7, rowGap: 8 }}>
        <Chip label="Isolated" selected={s.marginMode === 'Isolated'} onPress={() => ctl.patchSettings({ marginMode: 'Isolated' })} />
        <Chip label="Cross" selected={s.marginMode === 'Cross'} onPress={() => ctl.patchSettings({ marginMode: 'Cross' })} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 14 }}>
        <View style={{ flex: 1 }}><Txt variant="body">Saran Gemini per call</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>Mati = saran dihitung lokal.</Txt></View>
        <Switch value={s.aiAdvice} onValueChange={(value) => { playUiSound('toggle', sound); ctl.patchSettings({ aiAdvice: value }); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={s.aiAdvice ? t.onPrimary : t.outline} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}><Txt variant="body" color={t.onSurfaceVariant}>Batas rugi per call</Txt><Txt variant="titleMedium">{s.riskPerTradePct}%</Txt></View>
      <Slider value={s.riskPerTradePct} min={1} max={10} onChange={(value) => ctl.patchSettings({ riskPerTradePct: value })} format={(value) => `${value}%`} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8 }}><Txt variant="body" color={t.onSurfaceVariant}>Minimum confidence AI</Txt><Txt variant="titleMedium">{Math.round(s.minConfidence * 100)}%</Txt></View>
      <Slider value={Math.round(s.minConfidence * 100)} min={50} max={99} onChange={(value) => ctl.patchSettings({ minConfidence: value / 100 })} format={(value) => `${value}%`} />
    </Card>
    <Card>
      <Txt variant="titleMedium">Batas keselamatan Live</Txt>
      <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Hanya melindungi Live. Nilai 0 mematikan batas terkait.</Txt>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}><Txt variant="body" color={t.onSurfaceVariant}>Rugi harian maksimal</Txt><Txt variant="titleMedium">{s.maxDailyLossPct ? `${s.maxDailyLossPct}%` : 'Mati'}</Txt></View>
      <Slider value={s.maxDailyLossPct} min={0} max={20} onChange={(value) => ctl.patchSettings({ maxDailyLossPct: value })} format={(value) => (value ? `${value}%` : 'mati')} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}><Txt variant="body" color={t.onSurfaceVariant}>Posisi terbuka maksimal</Txt><Txt variant="titleMedium">{s.maxOpenPositions || 'Mati'}</Txt></View>
      <Slider value={s.maxOpenPositions} min={0} max={20} onChange={(value) => ctl.patchSettings({ maxOpenPositions: value })} format={(value) => (value ? String(value) : 'mati')} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 12 }}><Txt variant="body" color={t.onSurfaceVariant}>Konfirmasi ekstra pada leverage ≥</Txt><Txt variant="titleMedium">{s.confirmLeverage ? `${s.confirmLeverage}x` : 'Mati'}</Txt></View>
      <Slider value={s.confirmLeverage} min={0} max={100} onChange={(value) => ctl.patchSettings({ confirmLeverage: value })} format={(value) => (value ? `${value}x` : 'mati')} />
    </Card>
    <Btn label="Selesai" icon="check" onPress={onClose} />
  </PopupPanel>;
}
