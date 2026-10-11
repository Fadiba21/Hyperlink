import { useState } from 'react';
import { Alert, BackHandler, Switch, View } from 'react-native';
import type { Controller } from '../controller';
import { EXCHANGE_LIST, getExchange } from '../exchanges';
import { activeKeys } from '../security';
import { playUiSound, useSoundConfig } from '../sounds';
import { useTheme } from '../theme';
import { ControlCards } from './ControlCards';
import { SoundSettingsCard } from './SoundSettingsCard';
import { Btn, Card, Chip, Field, ListRow, Pill, PopupMenu, PresetPopover, Press, Reveal, SectionHeader, Txt, type PopupMenuItem } from '../ui';
import { stopBackgroundMonitoring } from '../background';

const STEP_LABEL: Record<string, string> = { idle: 'Belum dimulai', starting: 'Memulai TDLib…', phone: 'Menunggu nomor telepon', code: 'Menunggu kode login', password: 'Menunggu password 2FA', ready: 'Terhubung', closed: 'Terputus', unsupported: 'Akun butuh langkah yang belum didukung' };

const SETTINGS_SECTIONS: PopupMenuItem[] = [
  { id: 'appearance', label: 'Tampilan & akun', subtitle: 'Mode Live/Demo dan tema aplikasi', icon: 'settings' },
  { id: 'safety', label: 'Pengaman & privasi', subtitle: 'Batas risiko, PIN, dan saldo', icon: 'shield' },
  { id: 'alerts', label: 'Alert & notifikasi', subtitle: 'Notifikasi peristiwa dan alert harga', icon: 'info' },
  { id: 'exchange', label: 'Exchange', subtitle: 'Kredensial API dan koneksi akun', icon: 'exchange' },
  { id: 'risk', label: 'Strategi & risiko', subtitle: 'Margin, leverage, dan confidence AI', icon: 'chart' },
  { id: 'telegram', label: 'Telegram', subtitle: 'Login, channel, dan automation', icon: 'channel' },
  { id: 'ai', label: 'AI & data', subtitle: 'Gemini, CoinGecko, dan backup Demo', icon: 'brain' },
  { id: 'help', label: 'Bantuan & data lokal', subtitle: 'Panduan, keamanan, dan reset', icon: 'send' },
];
const EXCHANGE_ACTIONS: PopupMenuItem[] = [
  { id: 'exchange-test', label: 'Test koneksi', subtitle: 'Simpan credential lalu uji API exchange.', icon: 'check' },
  { id: 'exchange-sync', label: 'Simpan & sinkron', subtitle: 'Simpan API key lalu perbarui akun.', icon: 'sync' },
];
const TELEGRAM_ACTIONS: PopupMenuItem[] = [
  { id: 'telegram-save', label: 'Simpan pengaturan Telegram', subtitle: 'Simpan API ID dan API Hash dengan aman.', icon: 'key' },
  { id: 'telegram-start', label: 'Mulai / ulangi TDLib', subtitle: 'Simpan credential lalu mulai sesi Telegram.', icon: 'play' },
];
const TELEGRAM_READY_ACTIONS: PopupMenuItem[] = [
  { id: 'telegram-load', label: 'Muat ulang channel', subtitle: 'Segarkan daftar channel Telegram.', icon: 'refresh' },
  { id: 'telegram-scan', label: 'Scan riwayat', subtitle: 'Analisis riwayat channel yang dipilih.', icon: 'brain' },
  { id: 'telegram-logout', label: 'Logout Telegram', subtitle: 'Hapus sesi TDLib dari perangkat.', icon: 'logout' },
];

export function Settings({ ctl, bottom = 0, onOpenRisk }: { ctl: Controller; bottom?: number; onOpenRisk?: () => void }) {
  const t = useTheme();
  const sound = useSoundConfig();
  const { credentials: c, settings: s } = ctl;
  const ex = getExchange(c.exchange);
  const keys = activeKeys(c);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [filter, setFilter] = useState('');
  const [activeSection, setActiveSection] = useState('appearance');
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<'exchange' | 'telegram' | null>(null);
  const riskLabel = s.marginPct <= 5 ? 'Konservatif' : s.marginPct <= 15 ? 'Seimbang' : s.marginPct <= 40 ? 'Agresif' : 'Sangat agresif';
  const chats = ctl.chats.filter((x) => !filter.trim() || x.title.toLowerCase().includes(filter.trim().toLowerCase()) || String(x.username || '').toLowerCase().includes(filter.trim().toLowerCase()));
  const selectedSection = SETTINGS_SECTIONS.find((item) => item.id === activeSection) || SETTINGS_SECTIONS[0];
  const contextItems = contextMenu === 'exchange' ? EXCHANGE_ACTIONS : contextMenu === 'telegram' ? [...TELEGRAM_ACTIONS, ...(ctl.authStep === 'ready' ? TELEGRAM_READY_ACTIONS.filter((item) => item.id !== 'telegram-scan' || s.selectedChatIds.length > 0) : [])] : [];
  const runContextAction = (id: string) => {
    setContextMenu(null);
    if (id === 'exchange-test') { void ctl.saveCreds(true).then((ok) => { if (ok) ctl.testExchange(); }); return; }
    if (id === 'exchange-sync') { void ctl.saveCreds(true).then((ok) => { if (ok) ctl.syncAccount(); }); return; }
    if (id === 'telegram-save') { void ctl.saveCreds(); return; }
    if (id === 'telegram-start') { void ctl.saveCreds(true).then((ok) => { if (ok) ctl.connectTelegram(); }); return; }
    if (id === 'telegram-load') { ctl.loadChats(); return; }
    if (id === 'telegram-scan') { ctl.scanHistory(); return; }
    if (id === 'telegram-logout') Alert.alert('Logout Telegram?', 'Session TDLib di perangkat akan dihapus.', [{ text: 'Batal', style: 'cancel' }, { text: 'Logout', style: 'destructive', onPress: ctl.disconnectTelegram }]);
  };
  let i = 0;

  return (
    <View>
      <Reveal index={i++}>
        <Card tone="high" style={{ padding: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt variant="labelSmall" color={t.primary}>PENGATURAN HYPERLINK</Txt>
              <Txt variant="titleMedium" style={{ marginTop: 2 }} numberOfLines={1}>{selectedSection.label}</Txt>
              <Txt variant="bodySmall" color={t.onSurfaceVariant} numberOfLines={2}>{selectedSection.subtitle}</Txt>
            </View>
            <Press onPress={() => setMenuOpen(true)} radius={18}>
              <View style={{ minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: 18, backgroundColor: t.secondaryContainer }}>
                <Txt variant="label" color={t.onSecondaryContainer}>Bagian</Txt>
                <Txt variant="titleSmall" color={t.onSecondaryContainer}>⌄</Txt>
              </View>
            </Press>
          </View>
        </Card>
      </Reveal>
      <PopupMenu visible={menuOpen} title="Pilih bagian" subtitle="Pengaturan dikelompokkan agar lebih cepat ditemukan." items={SETTINGS_SECTIONS} selectedId={activeSection} onClose={() => setMenuOpen(false)} onSelect={(id) => { setActiveSection(id); setMenuOpen(false); }} />
      <PopupMenu visible={contextMenu !== null} title={contextMenu === 'exchange' ? 'Tindakan Exchange' : 'Tindakan Telegram'} subtitle="Pilih tindakan untuk bagian ini." items={contextItems} onClose={() => setContextMenu(null)} onSelect={runContextAction} />

      {activeSection === 'appearance' ? <>
        <Reveal index={i++}>
          <Card tone="high">
            <Txt variant="titleMedium">Akun & tampilan</Txt>
            <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 10 }}>Mode akun</Txt>
            <View style={{ marginTop: 6 }}>
              <PresetPopover value={s.accountMode} options={[{ id: 'live', label: 'Live', subtitle: 'Akun exchange aktif' }, { id: 'demo', label: 'Demo', subtitle: 'Saldo simulasi lokal; tidak mengirim order' }]} onSelect={(mode) => ctl.patchSettings({ accountMode: mode as typeof s.accountMode })} />
            </View>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 4 }}>Mode Demo memakai saldo simulasi dan tidak mengirim order ke exchange.</Txt>
            <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Tema aplikasi</Txt>
            <View style={{ marginTop: 6 }}>
              <PresetPopover value={s.themeStyle} options={[{ id: 'monochrome', label: 'Monochrome' }, { id: 'materialYou', label: 'Material You' }, { id: 'midnightExchange', label: 'Midnight Exchange' }, { id: 'emeraldWallet', label: 'Emerald Wallet' }, { id: 'aurora', label: 'Aurora Slate' }, { id: 'copperStudio', label: 'Copper Studio' }]} onSelect={(style) => ctl.patchSettings({ themeStyle: style as typeof s.themeStyle })} />
            </View>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 4 }}>Midnight Exchange bernuansa biru-cyan, Emerald Wallet hijau tenang, Aurora Slate memadukan teal-slate, dan Copper Studio memakai aksen amber hangat. Semua mendukung mode terang/gelap.</Txt>
            <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Mode warna</Txt>
            <View style={{ marginTop: 6 }}>
              <PresetPopover value={s.themeMode} options={[{ id: 'system', label: 'Sistem' }, { id: 'light', label: 'Terang' }, { id: 'dark', label: 'Gelap' }]} onSelect={(mode) => ctl.patchSettings({ themeMode: mode as typeof s.themeMode })} />
            </View>
          </Card>
        </Reveal>
      </> : null}

      {activeSection === 'safety' ? <ControlCards ctl={ctl} bottom={bottom} start={i} section="safety" onOpenRisk={onOpenRisk} /> : null}
      {activeSection === 'alerts' ? <><ControlCards ctl={ctl} bottom={bottom} start={i} section="alerts" /><SoundSettingsCard ctl={ctl} /></> : null}

      {activeSection === 'exchange' ? <Reveal index={i++}>
        <Card>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Txt variant="titleMedium">Exchange</Txt>
            <Pill label={ctl.account ? 'Tersinkron' : 'Belum sinkron'} tone={ctl.account ? 'good' : 'neutral'} />
          </View>
          <Txt variant="body" color={t.onSurfaceVariant} style={{ marginTop: 2 }}>Pengaturan API tetap sama saat berpindah akun. Sumber harga Demo dapat dipilih di Beranda; akun Demo tidak mengirim order exchange.</Txt>
          <View style={{ marginTop: 12 }}>
            <PresetPopover value={c.exchange} options={EXCHANGE_LIST.map((exchange) => ({ id: exchange.id, label: exchange.label, subtitle: exchange.keyHint }))} onSelect={(exchange) => ctl.selectExchange(exchange as typeof c.exchange)} />
          </View>
          <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 10 }}>{ex.keyHint}</Txt>
          <Field label="API Key" value={keys.apiKey} onChangeText={(value) => ctl.updateKeys({ apiKey: value })} />
          <Field label="API Secret" value={keys.apiSecret} onChangeText={(value) => ctl.updateKeys({ apiSecret: value })} secure />
          {ex.needsPassphrase ? <Field label="API Passphrase" value={keys.passphrase} onChangeText={(value) => ctl.updateKeys({ passphrase: value })} secure /> : null}
          {ex.hasTestnet ? (
            <View style={{ marginTop: 14 }}>
              <PresetPopover value={keys.env} options={[{ id: 'testnet', label: ex.testnetLabel, subtitle: 'Lingkungan uji exchange' }, { id: 'mainnet', label: 'Mainnet (uang asli)', subtitle: 'Perubahan dapat memakai dana nyata' }]} onSelect={(env) => ctl.updateKeys({ env: env as typeof keys.env })} />
            </View>
          ) : <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 12 }}>{ex.label} tidak punya testnet publik: uji strategi lewat akun Demo, order live memakai uang asli.</Txt>}
          <Btn label="Tindakan koneksi Exchange" variant="tonal" icon="settings" loading={ctl.busy['exchange-test'] || ctl.busy.exchange} onPress={() => setContextMenu('exchange')} />
        </Card>
      </Reveal> : null}

      {activeSection === 'risk' ? <Reveal index={i++}>
        <Card tone="high">
          <Txt variant="titleMedium">Margin & risiko call</Txt>
          <Txt variant="body" color={t.onSurfaceVariant} style={{ marginTop: 3 }}>Margin {s.marginPct}% · {riskLabel} · {s.marginMode}. Kontrol rinci dibuka sebagai panel pop-up agar daftar Setelan tetap ringkas.</Txt>
          <Btn label="Buka kontrol margin & risiko" variant="tonal" icon="chart" onPress={onOpenRisk || (() => undefined)} />
        </Card>
      </Reveal> : null}

      {activeSection === 'telegram' ? <Reveal index={i++}>
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
            <View style={{ flex: 1 }}>
              <Txt variant="titleMedium">Automation Telegram</Txt>
              <Txt variant="bodySmall" color={t.onSurfaceVariant}>{ctl.serviceOn ? 'Pemantauan latar belakang aktif.' : 'Otomatis analisis call baru dari channel terpilih.'}</Txt>
            </View>
            <Switch value={s.automationOn} onValueChange={(value) => { playUiSound('toggle', sound); ctl.setAutomation(value); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={s.automationOn ? t.onPrimary : t.outline} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Txt variant="titleMedium">Telegram</Txt>
            <Pill label={STEP_LABEL[ctl.authStep] || ctl.authStep} tone={ctl.authStep === 'ready' ? 'good' : ctl.authStep === 'unsupported' ? 'bad' : 'neutral'} pulse={ctl.authStep === 'ready'} />
          </View>
          <Field label="API ID" value={c.telegramApiId} onChangeText={(value) => ctl.updateCred('telegramApiId', value)} keyboardType="number-pad" />
          <Field label="API Hash (32 karakter)" value={c.telegramApiHash} onChangeText={(value) => ctl.updateCred('telegramApiHash', value)} secure />
          <Btn label="Pilih tindakan Telegram" variant="tonal" icon="settings" loading={ctl.busy.telegram} onPress={() => setContextMenu('telegram')} />
          {ctl.authStep === 'phone' ? <><Field label="Nomor telepon (+62…)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><Btn label="Kirim kode" icon="send" loading={ctl.busy['tg-auth']} disabled={!phone.trim()} onPress={() => ctl.sendPhone(phone)} /></> : null}
          {ctl.authStep === 'code' ? <><Field label="Kode dari Telegram" value={code} onChangeText={setCode} keyboardType="number-pad" /><Btn label="Verifikasi kode" icon="check" loading={ctl.busy['tg-auth']} disabled={!code.trim()} onPress={() => ctl.sendCode(code)} /></> : null}
          {ctl.authStep === 'password' ? <><Field label="Password 2FA" value={password} onChangeText={setPassword} secure /><Btn label="Verifikasi 2FA" icon="check" loading={ctl.busy['tg-auth']} disabled={!password} onPress={() => ctl.sendPassword(password)} /></> : null}
          {ctl.authStep === 'ready' ? <>
            <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 16 }}>Channel yang dipantau ({s.selectedChatIds.length})</Txt>
            <Field label="Cari channel" value={filter} onChangeText={setFilter} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 10, rowGap: 8 }}>{chats.slice(0, 40).map((chat) => <Chip key={chat.id} icon="channel" label={chat.title.length > 26 ? `${chat.title.slice(0, 25)}…` : chat.title} selected={s.selectedChatIds.includes(chat.id)} onPress={() => ctl.toggleChat(chat.id)} />)}</View>
          </> : null}
        </Card>
      </Reveal> : null}

      {activeSection === 'ai' ? <>
        <ControlCards ctl={ctl} bottom={bottom} start={i} section="data" />
        <Reveal index={i++}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><Txt variant="titleMedium">Gemini AI</Txt><Pill label={ctl.geminiStatus === 'ok' ? 'Online' : ctl.geminiStatus === 'error' ? 'Error' : 'Idle'} tone={ctl.geminiStatus === 'ok' ? 'good' : ctl.geminiStatus === 'error' ? 'bad' : 'neutral'} /></View>
            <Field label="Google AI Studio API Key" value={c.geminiApiKey} onChangeText={(value) => ctl.updateCred('geminiApiKey', value)} secure />
            <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 14 }}>Model</Txt>
            <View style={{ marginTop: 8 }}>
              <PresetPopover value={s.geminiModel} options={ctl.geminiModels.slice(0, 10).map((model) => { const id = model.name.replace(/^models\//, ''); return { id, label: model.displayName || id }; })} onSelect={(model) => ctl.patchSettings({ geminiModel: model })} />
            </View>
            <Field label="Nama model manual" value={s.geminiModel} onChangeText={(value) => ctl.patchSettings({ geminiModel: value })} />
            <Btn label="Simpan, test & muat model" icon="brain" loading={ctl.busy['gemini-test']} onPress={async () => { if (await ctl.saveCreds(true)) ctl.testGemini(); }} />
          </Card>
        </Reveal>
      </> : null}

      {activeSection === 'help' ? <>
        <SectionHeader title="Bantuan & keamanan" />
        <Reveal index={i++}>
          <Card tone="outlined">
            <ListRow icon="send" title="Telegram API" subtitle="my.telegram.org → API development tools → buat aplikasi → API ID & Hash." />
            <ListRow icon="brain" title="Gemini" subtitle="aistudio.google.com → Get API key." />
            <ListRow icon="chart" title="Harga pasar Demo" subtitle="Pilih CoinGecko atau feed market exchange terpilih di Beranda; data publik tidak mengirim order." />
            <ListRow icon="exchange" title={ex.label} subtitle={ex.keyHint} />
            <Txt variant="bodySmall" color={t.warning} style={{ marginTop: 8 }}>Credential tersimpan di Android Keystore. Jangan bagikan API Secret, API Hash, atau session Telegram. Ini alat bantu, bukan saran finansial: trading futures berisiko tinggi.</Txt>
          </Card>
        </Reveal>
        <Reveal index={i++}>
          <Card tone="outlined">
            <Txt variant="titleSmall">Data lokal & reset</Txt>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 4 }}>Menghapus semua credential, pengaturan, riwayat signal, akun Demo, dan session Telegram dari perangkat ini.</Txt>
            <Btn label="Hapus semua data lokal" variant="danger" icon="delete" onPress={() => Alert.alert('Hapus semua data?', 'Credential, pengaturan, riwayat signal, akun Demo, dan session Telegram akan dihapus dari perangkat.', [{ text: 'Batal', style: 'cancel' }, { text: 'Hapus', style: 'destructive', onPress: ctl.wipeAll }])} />
          </Card>
        </Reveal>
        <Reveal index={i++}>
          <Card tone="outlined">
            <Txt variant="titleSmall">Keluar dari aplikasi</Txt>
            <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 4 }}>Menghentikan monitoring latar Hyperlink yang sedang berjalan lalu menutup task aplikasi. Android tidak menyediakan tombol aplikasi biasa untuk melakukan force-stop pada prosesnya sendiri.</Txt>
            <Btn label="Keluar dari Hyperlink" variant="danger" icon="logout" onPress={() => Alert.alert('Keluar dari Hyperlink?', 'Monitoring latar akan dihentikan dan task aplikasi ditutup. Ini bukan force-stop Android.', [{ text: 'Batal', style: 'cancel' }, { text: 'Keluar', style: 'destructive', onPress: () => { stopBackgroundMonitoring(); BackHandler.exitApp(); } }])} />
          </Card>
        </Reveal>
      </> : null}
    </View>
  );
}
