import { useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { Share } from 'react-native';
import type { Controller } from '../controller';
import { activeAlerts } from '../alerts';
import { baseOf } from '../exchanges';
import { money, price as fmtPrice } from '../format';
import { biometricUnlockAvailable, checkPin, clearPin, disableBiometricUnlock, enableBiometricUnlock, isValidPin, setPin } from '../lock';
import { playUiSound, useSoundConfig } from '../sounds';
import { dailyLoss } from '../safety';
import { PinPad } from '../PinPad';
import { toPair } from '../pairs';
import { useTheme } from '../theme';
import { BottomSheet, Btn, Card, Field, Icon, Pill, Press, Reveal, Txt } from '../ui';
import { hasNotificationPermission, requestNotificationPermission } from '../background';

function ToggleRow({ title, copy, value, onChange, danger }: { title: string; copy: string; value: boolean; onChange: (v: boolean) => void; danger?: boolean }) {
  const t = useTheme();
  const sound = useSoundConfig();
  return <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
    <View style={{ flex: 1 }}><Txt variant="body" color={danger && value ? t.error : undefined}>{title}</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>{copy}</Txt></View>
    <Switch value={value} onValueChange={(next) => { playUiSound('toggle', sound); onChange(next); }} trackColor={{ false: t.surfaceHigh, true: danger ? t.error : t.primary }} thumbColor={value ? t.onPrimary : t.outline} />
  </View>;
}

export function SafetyCard({ ctl, onOpenRisk }: { ctl: Controller; onOpenRisk?: () => void }) {
  const t = useTheme();
  const s = ctl.settings;
  const equity = Number(ctl.account?.equity) || 0;
  const loss = dailyLoss(s.dayBaseline, equity);
  return <Card tone={s.safetyKill ? 'error' : 'container'}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt variant="titleMedium">Pengaman Live</Txt><Pill label={s.safetyKill ? 'KILL-SWITCH' : s.readOnly ? 'HANYA-BACA' : 'Aktif'} tone={s.safetyKill ? 'bad' : s.readOnly ? 'warn' : 'good'} /></View>
    <Txt variant="bodySmall" color={t.onSurfaceVariant} style={{ marginTop: 2 }}>Berlaku untuk akun Live. Akun Demo tidak dibatasi.</Txt>
    <ToggleRow danger title="Kill-switch" copy="Blokir semua order Live baru dan jeda automation. Menutup posisi tetap bisa." value={s.safetyKill} onChange={ctl.setKillSwitch} />
    <ToggleRow title="Mode hanya-baca" copy="Blokir semua perubahan di exchange (order, tutup, SL/TP, leverage, batal)." value={s.readOnly} onChange={(v) => ctl.patchSettings({ readOnly: v })} />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
      <Pill label={`Rugi/hari ${s.maxDailyLossPct ? `${s.maxDailyLossPct}%` : 'mati'}`} tone="warn" />
      <Pill label={`Posisi ${s.maxOpenPositions || 'mati'}`} />
      <Pill label={`Konfirmasi ${s.confirmLeverage ? `${s.confirmLeverage}x` : 'mati'}`} />
    </View>
    {s.dayBaseline ? <Txt variant="labelSmall" color={loss > 0 ? t.warning : t.onSurfaceVariant} style={{ marginTop: 6 }}>Ekuitas awal hari ini ${money(s.dayBaseline.equity)} · rugi berjalan ${money(loss)}</Txt> : <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ marginTop: 6 }}>Batas harian dihitung dari ekuitas pertama setelah sinkron.</Txt>}
    <Btn label="Atur batas risiko" variant="tonal" icon="chart" onPress={onOpenRisk || (() => undefined)} />
  </Card>;
}

export function SecurityCard({ ctl, bottom }: { ctl: Controller; bottom: number }) {
  const t = useTheme();
  const s = ctl.settings;
  const [mode, setMode] = useState<null | 'set' | 'confirm' | 'disable'>(null);
  const [first, setFirst] = useState('');
  const [error, setError] = useState('');
  const [bioAvailable, setBioAvailable] = useState<boolean | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  useEffect(() => { let active = true; biometricUnlockAvailable().then((available) => { if (active) setBioAvailable(available); }); return () => { active = false; }; }, []);
  const close = () => { setMode(null); setFirst(''); setError(''); };
  const toggleBiometrics = async (enabled: boolean) => {
    if (enabled && !s.lockEnabled) { ctl.notify('Atur PIN enam digit terlebih dahulu; PIN tetap menjadi metode cadangan.', 'info'); return; }
    setBioBusy(true);
    try {
      if (enabled) { await enableBiometricUnlock(); ctl.patchSettings({ biometricUnlock: true }); ctl.notify('Biometrik aktif · PIN tetap tersedia sebagai cadangan', 'success'); }
      else { await disableBiometricUnlock(); ctl.patchSettings({ biometricUnlock: false }); ctl.notify('Buka biometrik dimatikan · PIN tetap aktif', 'info'); }
    } catch (reason) { ctl.notify(reason instanceof Error ? reason.message : 'Tidak dapat memperbarui pengaturan biometrik.', 'error'); }
    finally { setBioBusy(false); }
  };
  const onPin = async (pin: string): Promise<boolean> => {
    setError('');
    if (mode === 'set') { setFirst(pin); setMode('confirm'); return true; }
    if (mode === 'confirm') {
      if (pin !== first) { setError('PIN tidak sama. Ulangi dari awal.'); setFirst(''); setMode('set'); return false; }
      if (!isValidPin(pin)) { setError('PIN harus 6 digit.'); return false; }
      try { await setPin(pin); ctl.patchSettings({ lockEnabled: true }); ctl.notify('PIN aktif · app terkunci setelah 30 detik di latar', 'success'); setTimeout(close, 650); return true; }
      catch (reason) { setError(reason instanceof Error ? reason.message : 'Tidak dapat menyimpan PIN.'); return false; }
    }
    if (mode === 'disable') {
      if (!(await checkPin(pin))) { setError('PIN salah.'); return false; }
      await clearPin(); ctl.patchSettings({ lockEnabled: false, biometricUnlock: false }); ctl.notify('PIN dan biometrik dimatikan', 'info'); setTimeout(close, 650); return true;
    }
    return false;
  };
  return <Card>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt variant="titleMedium">Keamanan aplikasi</Txt><Pill label={s.lockEnabled ? 'PIN aktif' : 'Tanpa PIN'} tone={s.lockEnabled ? 'good' : 'neutral'} /></View>
    <ToggleRow title="Sembunyikan saldo" copy="Saldo di kartu aset ditampilkan ••••." value={s.hideBalances} onChange={(v) => ctl.patchSettings({ hideBalances: v })} />
    <Btn label={s.lockEnabled ? 'Matikan PIN' : 'Atur PIN 6 digit'} variant={s.lockEnabled ? 'outlined' : 'tonal'} icon="lock" onPress={() => { setError(''); setMode(s.lockEnabled ? 'disable' : 'set'); }} />
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
      <View style={{ flex: 1, paddingRight: 10 }}><Txt variant="body">Buka dengan biometrik</Txt><Txt variant="bodySmall" color={t.onSurfaceVariant}>{bioAvailable === null ? 'Memeriksa perangkat…' : bioAvailable ? 'Gunakan fingerprint/biometrik native; PIN tetap menjadi cadangan.' : 'Tidak ada biometrik terdaftar pada perangkat ini.'}</Txt></View>
      <Switch value={s.biometricUnlock} disabled={!bioAvailable || !s.lockEnabled || bioBusy} onValueChange={(value) => { void toggleBiometrics(value); }} trackColor={{ false: t.surfaceHigh, true: t.primary }} thumbColor={s.biometricUnlock ? t.onPrimary : t.outline} />
    </View>
    <Txt variant="labelSmall" color={t.onSurfaceVariant}>PIN disimpan sebagai hash di Keystore. Buka biometrik memakai react-native-keychain yang sudah ada pada proyek; jika dibatalkan atau sensor gagal, gunakan PIN.</Txt>
    <BottomSheet visible={mode !== null} onClose={close} bottom={bottom}>
      <PinPad title={mode === 'confirm' ? 'Ulangi PIN' : mode === 'disable' ? 'Masukkan PIN saat ini' : 'PIN baru'} subtitle={mode === 'set' ? '6 digit angka' : undefined} error={error} onComplete={onPin} />
    </BottomSheet>
  </Card>;
}

export function AlertsCard({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const [notificationAllowed, setNotificationAllowed] = useState<boolean | null>(null);
  useEffect(() => { let active = true; hasNotificationPermission().then((allowed) => { if (active) setNotificationAllowed(allowed); }); return () => { active = false; }; }, []);
  const enableSystemNotifications = async () => {
    const allowed = await requestNotificationPermission();
    setNotificationAllowed(allowed);
    ctl.patchSettings({ notifyEvents: allowed });
    if (!allowed) ctl.notify('Izin notifikasi belum diberikan. Hyperlink tetap menampilkan alert di dalam aplikasi.', 'info');
  };
  const [symbol, setSymbol] = useState(ctl.settings.demoSymbol.replace('USDT', ''));
  const [target, setTarget] = useState('');
  const list = ctl.settings.alerts;
  const active = activeAlerts(list);
  return <Card>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Txt variant="titleMedium">Alert & notifikasi</Txt><Pill label={`${active.length} aktif`} tone={active.length ? 'info' : 'neutral'} /></View>
    <ToggleRow title="Notifikasi sistem" copy="Signal, alert harga, hasil order, dan event penting yang terpantau dapat memberi notifikasi lokal saat app/monitoring berjalan; tidak ada push setelah proses dihentikan." value={ctl.settings.notifyEvents} onChange={(enabled) => { if (enabled) void enableSystemNotifications(); else ctl.patchSettings({ notifyEvents: false }); }} />
    {notificationAllowed === false && ctl.settings.notifyEvents ? <Btn label="Izinkan notifikasi Hyperlink" variant="tonal" icon="info" onPress={() => { void enableSystemNotifications(); }} /> : null}
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', marginTop: 6 }}>
      <View style={{ flex: 1 }}><Field label="Koin (mis. SOL)" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" /></View>
      <View style={{ flex: 1.2 }}><Field label="Harga target" value={target} onChangeText={setTarget} keyboardType="decimal-pad" /></View>
    </View>
    <Btn label="Pasang alert" icon="add" disabled={!symbol.trim() || !target.trim()} onPress={async () => { if (await ctl.addPriceAlert(toPair(symbol), Number(target.replace(',', '.')))) setTarget(''); }} />
    <Txt variant="labelSmall" color={t.onSurfaceVariant}>Harga alert mengikuti sumber harga Demo ({ctl.settings.demoPriceSource === 'exchange' ? 'exchange' : 'CoinGecko'}), dicek tiap ±60 detik selama app atau service berjalan.</Txt>
    {list.slice(0, 12).map((a) => <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.outlineVariant, marginTop: 8 }}>
      <Icon name={a.dir === 'above' ? 'up' : 'down'} size={16} color={a.triggeredAt ? t.outline : a.dir === 'above' ? t.success : t.error} />
      <View style={{ flex: 1 }}><Txt variant="titleSmall" color={a.triggeredAt ? t.onSurfaceVariant : undefined}>{baseOf(a.symbol)} {a.dir === 'above' ? '≥' : '≤'} ${fmtPrice(a.price)}</Txt>{a.triggeredAt ? <Txt variant="labelSmall" color={t.onSurfaceVariant}>Tercapai</Txt> : null}</View>
      <Press onPress={() => ctl.removeAlert(a.id)} radius={18}><View style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={16} color={t.onSurfaceVariant} /></View></Press>
    </View>)}
  </Card>;
}

export function DataCard({ ctl }: { ctl: Controller }) {
  const t = useTheme();
  const [paste, setPaste] = useState('');
  const [key, setKey] = useState(ctl.credentials.coingeckoKey);
  return <Card>
    <Txt variant="titleMedium">Data & sumber</Txt>
    <Field label="CoinGecko Demo API key (opsional)" value={key} onChangeText={setKey} secure helper="Gratis di coingecko.com/en/api · menaikkan batas request agar Pasar & chart tidak mudah kena limit." />
    <Btn label="Simpan key CoinGecko" variant="tonal" icon="key" onPress={async () => { ctl.updateCred('coingeckoKey', key); setTimeout(() => ctl.saveCreds(), 50); }} />
    <Txt variant="titleSmall" color={t.primary} style={{ marginTop: 16 }}>Backup akun Demo</Txt>
    <Btn label="Bagikan / salin backup" variant="tonal" icon="send" onPress={() => Share.share({ title: 'Backup akun demo Hyperlink', message: ctl.exportDemo() }).catch(() => undefined)} />
    <Field label="Tempel backup JSON untuk memulihkan" value={paste} onChangeText={setPaste} multiline />
    <Btn label="Pulihkan akun Demo" variant="outlined" icon="inbox" disabled={!paste.trim()} onPress={() => { if (ctl.importDemo(paste)) setPaste(''); }} />
    <Txt variant="labelSmall" color={t.onSurfaceVariant}>Memulihkan menimpa saldo, posisi, dan riwayat Demo saat ini.</Txt>
  </Card>;
}

export function ControlCards({ ctl, bottom, start, section, onOpenRisk }: { ctl: Controller; bottom: number; start: number; section?: 'safety' | 'alerts' | 'data'; onOpenRisk?: () => void }) {
  let i = start;
  return <>
    {(!section || section === 'safety') ? <><Reveal index={i++}><SafetyCard ctl={ctl} onOpenRisk={onOpenRisk} /></Reveal><Reveal index={i++}><SecurityCard ctl={ctl} bottom={bottom} /></Reveal></> : null}
    {(!section || section === 'alerts') ? <Reveal index={i++}><AlertsCard ctl={ctl} /></Reveal> : null}
    {(!section || section === 'data') ? <Reveal index={i++}><DataCard ctl={ctl} /></Reveal> : null}
  </>;
}
