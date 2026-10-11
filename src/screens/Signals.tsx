import { useState } from 'react';
import { View } from 'react-native';
import type { Controller } from '../controller';
import { timeAgo } from '../format';
import { useTheme } from '../theme';
import { Btn, Card, CompactSelector, Empty, Field, Pill, PopupMenu, Reveal, SectionHeader, Txt, type PopupMenuItem } from '../ui';
import { SignalCard } from './SignalCard';

const FILTERS = [['all', 'Semua'], ['ready', 'Siap'], ['executed', 'Dieksekusi'], ['failed', 'Gagal'], ['dismissed', 'Diabaikan']] as const;
const FILTER_ICONS = { all: 'inbox', ready: 'check', executed: 'bolt', failed: 'warning', dismissed: 'close' } as const;

export function Signals({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('ready');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const readyCount = ctl.signals.filter((signal) => signal.status === 'ready').length;
  const list = ctl.signals.filter((signal) => filter === 'all' || signal.status === filter);
  const counts: Record<(typeof FILTERS)[number][0], number> = { all: ctl.signals.length, ready: 0, executed: 0, failed: 0, dismissed: 0 };
  ctl.signals.forEach((signal) => { counts[signal.status] += 1; });
  const filterItems: PopupMenuItem[] = FILTERS.map(([id, label]) => ({ id, label, subtitle: `${counts[id]} signal`, icon: FILTER_ICONS[id] }));
  const signalActions: PopupMenuItem[] = [
    { id: 'scan', label: 'Scan riwayat channel', subtitle: ctl.settings.selectedChatIds.length ? 'Analisis pesan terbaru dari channel terpilih.' : 'Pilih channel Telegram terlebih dahulu.', icon: 'send', disabled: !ctl.settings.selectedChatIds.length || ctl.busy.scan },
    { id: 'simulate', label: 'Simulasikan semua call', subtitle: ctl.signals.length ? 'Hitung hasil historis signal yang tersedia.' : 'Belum ada signal untuk disimulasikan.', icon: 'chart', disabled: !ctl.signals.length },
  ];
  const runSignalAction = (id: string) => {
    setActionsMenuOpen(false);
    if (id === 'scan' && ctl.settings.selectedChatIds.length && !ctl.busy.scan) ctl.scanHistory();
    if (id === 'simulate' && ctl.signals.length) ctl.simulateAll();
  };
  return (
    <View>
      <PopupMenu visible={filterMenuOpen} title="Filter riwayat signal" subtitle="Pilih status yang ingin ditampilkan." items={filterItems} selectedId={filter} onClose={() => setFilterMenuOpen(false)} onSelect={(id) => { setFilter(id as (typeof FILTERS)[number][0]); setFilterMenuOpen(false); }} />
      <PopupMenu visible={actionsMenuOpen} title="Tindakan signal" subtitle="Aksi terkait signal dan riwayat channel." items={signalActions} onClose={() => setActionsMenuOpen(false)} onSelect={runSignalAction} />
      <SectionHeader title={`Riwayat signal (${ctl.signals.length})`} />
      <CompactSelector label="Status riwayat" value={`${FILTERS.find(([id]) => id === filter)?.[1] || 'Siap'} · ${counts[filter]}`} onPress={() => setFilterMenuOpen(true)} style={{ marginBottom: 8 }} />
      {list.length ? list.map((signal, index) => (
        <Reveal key={signal.id} index={index}><SignalCard signal={signal} ctl={ctl} busy={ctl.sheet?.signal.id === signal.id && !ctl.sheet.plan && !ctl.sheet.error} onReview={() => ctl.openOrder(signal)} onDismiss={() => ctl.dismissSignal(signal.id)} onRemove={() => ctl.removeSignal(signal.id)} /></Reveal>
      )) : <Empty icon="inbox" title="Belum ada riwayat" copy={filter === 'all' ? 'Call yang tervalidasi akan muncul di bagian paling atas ini.' : filter === 'ready' ? 'Tidak ada signal siap. Pilih filter Semua untuk melihat riwayat.' : 'Tidak ada signal dengan status ini.'} />}

      <Reveal index={0}>
        <Card tone="high">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View><Txt variant="titleMedium">Signal siap ditinjau</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>Call tervalidasi sebelum dikirim ke exchange</Txt></View>
            <Pill label={`${readyCount} siap`} tone={readyCount ? 'info' : 'neutral'} />
          </View>
          <Btn label="Tindakan signal" variant="tonal" icon="settings" onPress={() => setActionsMenuOpen(true)} />
        </Card>
      </Reveal>

      <Reveal index={1}>
        <Card>
          <Txt variant="titleMedium">Analisis call manual</Txt>
          <Txt variant="body" color={t.onSurfaceVariant}>Tempel teks call; zona entry dan semua target TP dari format umum Telegram dibaca langsung. Format lain dianalisis Gemini.</Txt>
          <Field label="Teks call" value={text} onChangeText={setText} multiline autoCapitalize="sentences" />
          <Btn label="Analisis call" icon="brain" loading={ctl.busy.gemini} disabled={!text.trim()} onPress={async () => { const result = await ctl.analyzeManual(text); if (result) setText(''); }} />
        </Card>
      </Reveal>

      <SectionHeader title="Pesan masuk dari Telegram" />
      {ctl.stream.length ? ctl.stream.slice(0, 15).map((message, index) => (
        <Reveal key={message.id} index={index}>
          <Card tone="outlined" style={{ padding: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Txt variant="labelSmall" color={t.primary}>{message.chatTitle} · {timeAgo(message.createdAt)}</Txt>
              <Pill label={{ pending: 'Menganalisis…', accepted: message.reason || 'Lolos', rejected: 'Ditolak', skipped: 'Dilewati' }[message.result]} tone={{ pending: 'info', accepted: 'good', rejected: 'bad', skipped: 'neutral' }[message.result] as 'info' | 'good' | 'bad' | 'neutral'} pulse={message.result === 'pending'} />
            </View>
            <Txt variant="body" numberOfLines={4} style={{ marginTop: 6 }}>{message.text}</Txt>
            {message.result === 'rejected' && message.reason ? <Txt variant="bodySmall" color={t.error} style={{ marginTop: 4 }}>{message.reason}</Txt> : null}
            {message.result === 'skipped' || message.result === 'rejected' ? <Btn label="Analisis sekarang" variant="text" icon="brain" onPress={() => ctl.analyzeStreamMessage(message.id)} /> : null}
          </Card>
        </Reveal>
      )) : <Empty icon="send" title="Belum ada pesan" copy="Pesan dari channel yang dipilih akan tampil realtime setelah Telegram terhubung." />}
    </View>
  );
}
