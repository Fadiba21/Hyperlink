import { useEffect, useRef, useState } from 'react';
import { Switch, View } from 'react-native';
import type { Controller } from '../controller';
import { getExchange } from '../exchanges';
import { MarketChart } from '../CoinGeckoChart';
import { activeKeys } from '../security';
import { playUiSound, useSoundConfig } from '../sounds';
import { money, timeAgo } from '../format';
import { AssetCard } from '../Exchange';
import { useTheme } from '../theme';
import { Btn, Card, Empty, ListRow, Pill, Reveal, ScreenTransition, SectionHeader, Txt } from '../ui';
import { DemoPanel } from './DemoPanel';
import { SignalCard } from './SignalCard';

export function Overview({ ctl, go, onOpenRisk }: { ctl: Controller; go: (tab: 'signals' | 'positions' | 'settings' | 'market') => void; onOpenRisk: () => void }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const { account, settings, credentials } = ctl;
  const ex = getExchange(credentials.exchange);
  const keys = activeKeys(credentials);
  const risk = settings.marginSource === 'ai' ? 'Saran AI' : settings.marginPct <= 5 ? 'Konservatif' : settings.marginPct <= 15 ? 'Seimbang' : settings.marginPct <= 40 ? 'Agresif' : 'Sangat agresif';
  const latest = ctl.signals.find((s) => s.status === 'ready' || s.status === 'failed') || ctl.signals[0];
  const tgOk = ctl.authStep === 'ready';
  const [chartSymbol, setChartSymbol] = useState('BTCUSDT');
  const [chartSource, setChartSource] = useState<'exchange' | 'coingecko'>('exchange');
  const [chartCollapsed, setChartCollapsed] = useState(false);
  const lastChartCall = useRef('');
  useEffect(() => {
    if (settings.accountMode === 'live' && latest && lastChartCall.current !== latest.id) {
      lastChartCall.current = latest.id;
      setChartSymbol(latest.symbol);
    }
  }, [settings.accountMode, latest]);
  let i = 0;
  if (settings.accountMode === 'demo') return <View><ScreenTransition key="demo-mode"><DemoPanel ctl={ctl} go={() => go('signals')} /></ScreenTransition></View>;
  return (
    <View>
      <ScreenTransition key="live-mode">
        <Reveal index={i++}>
          <AssetCard label={`EKUITAS ${ex.label.toUpperCase()}`} equity={account ? Number(account.equity) || 0 : null}
            badge={<Pill label={keys.env === 'mainnet' ? 'MAINNET' : ex.testnetLabel.toUpperCase()} tone={keys.env === 'mainnet' ? 'warn' : 'info'} />}
            caption={account ? undefined : `Hubungkan API ${ex.label} di Pengaturan`}
            stats={[{ label: 'Tersedia', value: account ? `$${money(account.available)}` : '—' }, { label: 'Posisi', value: String(ctl.positions.length) }, { label: 'Margin call', value: settings.marginSource === 'ai' ? `AI · ${risk}` : `${settings.marginPct}% · ${risk}` }]}
            footer={<View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn label="Posisi" icon="wallet" variant="tonal" onPress={() => go('positions')} flex />
              <Btn label="Pasar" icon="chart" variant="tonal" onPress={() => go('market')} flex />
              <Btn label="Risiko" icon="settings" variant="tonal" onPress={onOpenRisk} flex />
            </View>} />
        </Reveal>

        <SectionHeader title="Call terbaru" action={ctl.signals.length ? 'Lihat semua' : undefined} onAction={() => go('signals')} />
        {latest ? (
          <Reveal index={i++}><SignalCard signal={latest} ctl={ctl} onReview={() => ctl.openOrder(latest)} onDismiss={() => ctl.dismissSignal(latest.id)} /></Reveal>
        ) : (
          <Empty icon="inbox" title="Belum ada call" copy="Pilih channel Telegram di Pengaturan, aktifkan automation, atau tempel call manual di tab Signal." />
        )}

        <Reveal index={i++}>
          <Card tone="high">
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><View style={{ flex: 1 }}><Txt variant="titleMedium">Chart call terbaru</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Entry, SL, dan TP call terbaru tampil di chart.</Txt></View><Btn label={chartCollapsed ? 'Tampilkan' : 'Minimalkan'} variant="text" icon={chartCollapsed ? 'down' : 'up'} onPress={() => setChartCollapsed((value) => !value)} /></View>
            {chartCollapsed ? <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>{chartSymbol} · chart diminimalkan</Txt> : <MarketChart symbol={chartSymbol} lastPrice={Number(ctl.positions.find((p) => p.symbol === chartSymbol)?.markPrice) || 0} source={chartSource} exchangeId={credentials.exchange} env={credentials.keys[credentials.exchange].env} onSymbolChange={setChartSymbol} onSourceChange={setChartSource} />}
          </Card>
        </Reveal>

        <Reveal index={i++}>
          <Card>
            <ListRow icon="send" title="Telegram" subtitle={tgOk ? `Terhubung · ${settings.selectedChatIds.length} channel dipantau` : 'Belum login'} trailing={<Pill label={tgOk ? 'Aktif' : 'Setup'} tone={tgOk ? 'good' : 'neutral'} pulse={tgOk} />} onPress={() => go('settings')} />
            <ListRow icon="brain" title="Gemini" subtitle={credentials.geminiApiKey ? `Model ${settings.geminiModel}` : 'API key belum diisi'} trailing={<Pill label={ctl.geminiStatus === 'ok' ? 'Online' : credentials.geminiApiKey ? 'Siap' : 'Setup'} tone={ctl.geminiStatus === 'ok' || credentials.geminiApiKey ? 'good' : 'neutral'} />} onPress={() => go('settings')} />
            <ListRow icon="exchange" title={ex.label} subtitle={account ? `Tersinkron · ${ctl.positions.length} posisi` : 'Belum tersinkron'} trailing={<Pill label={account ? 'Aktif' : 'Setup'} tone={account ? 'good' : 'neutral'} />} onPress={() => (account ? go('positions') : go('settings'))} />
          </Card>
        </Reveal>

        <Reveal index={i++}>
          <Card tone="high">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Txt variant="titleMedium">Signal automation</Txt>
                <Txt variant="body" color={t.onSurfaceVariant}>{settings.automationOn ? (ctl.serviceOn ? 'Memantau channel di background' : 'Aktif (service belum berjalan)') : 'Dijeda · call tidak dianalisis otomatis'}</Txt>
              </View>
              <Switch value={settings.automationOn} onValueChange={(v) => { playUiSound('toggle', sound); ctl.setAutomation(v); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={settings.automationOn ? t.onPrimary : t.outline} />
            </View>
            {settings.accountMode === 'live' ? <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <View style={{ flex: 1, paddingRight: 8 }}><Txt variant="body">Auto-entry Live</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>Default mati. Saat aktif, hanya signal valid dalam zona entry yang dapat dikirim tanpa dialog; batas risiko tetap berlaku.</Txt></View>
              <Switch value={settings.liveAutoEntry} onValueChange={(v) => { playUiSound('toggle', sound); ctl.patchSettings({ liveAutoEntry: v }); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={settings.liveAutoEntry ? t.onPrimary : t.outline} />
            </View> : null}
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 8 }}>Entry otomatis hanya untuk call baru dari automation Telegram yang aktif, harga harus berada di zona entry, dan pengaman Live harus lolos. Jika perlu konfirmasi risiko tambahan, order otomatis dibatalkan agar dapat ditinjau manual.</Txt>
          </Card>
        </Reveal>

        {ctl.stream.slice(0, 3).map((m) => (
          <Reveal key={m.id} index={i++}>
            <Card tone="outlined" style={{ padding: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Txt variant="labelSmall" color={t.primary}>{m.chatTitle}</Txt><Txt variant="labelSmall" color={t.onSurfaceVariant}>{timeAgo(m.createdAt)}</Txt></View>
              <Txt variant="body" numberOfLines={2} style={{ marginTop: 2 }}>{m.text}</Txt>
            </Card>
          </Reveal>
        ))}
      </ScreenTransition>
    </View>
  );
}
