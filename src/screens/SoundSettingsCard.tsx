import { Switch, View } from 'react-native';
import type { Controller } from '../controller';
import { playUiSound, SOUND_TEMPLATES, useSoundConfig } from '../sounds';
import { useTheme } from '../theme';
import { Btn, Card, PresetPopover, Slider, Txt } from '../ui';

export function SoundSettingsCard({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const config = useSoundConfig();
  const s = ctl.settings;
  const preview = () => playUiSound('confirm', { enabled: true, template: s.soundTemplate, volume: s.soundVolume });
  return <Card tone="high">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}><Txt variant="titleMedium">Efek suara aplikasi</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>Tombol, pilihan, slider, pergantian Live/Demo, dan notifikasi dalam aplikasi.</Txt></View>
      <Switch value={s.soundEnabled} onValueChange={(value) => { playUiSound('toggle', { ...config, enabled: true }); ctl.patchSettings({ soundEnabled: value }); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={s.soundEnabled ? t.onPrimary : t.outline} />
    </View>
    <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Template suara</Txt>
    <View style={{ marginTop: 7 }}>
      <PresetPopover value={s.soundTemplate} options={SOUND_TEMPLATES.map((template) => ({ id: template.id, label: template.label, subtitle: template.detail }))} onSelect={(template) => { ctl.patchSettings({ soundTemplate: template }); playUiSound('select', { enabled: true, template, volume: s.soundVolume }); }} />
    </View>
    <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 5 }}>{SOUND_TEMPLATES.find((item) => item.id === s.soundTemplate)?.detail}</Txt>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
      <Txt variant="body">Volume efek</Txt><Txt variant="label" color={t.primary}>{Math.round(s.soundVolume * 100)}%</Txt>
    </View>
    <Slider value={Math.round(s.soundVolume * 100)} min={0} max={100} onChange={(value) => ctl.patchSettings({ soundVolume: value / 100 })} format={(value) => `${value}%`} />
    <Btn label="Pratinjau suara" icon="play" variant="tonal" onPress={preview} />
    <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 7 }}>Lembut/Crisp/Wallet memakai aset Kenney (CC0); Deep dan instrumen memakai nada sintetis lokal tanpa sampel pihak ketiga. Efek dekoratif diam bila modul audio Android tidak tersedia.</Txt>
  </Card>;
}
