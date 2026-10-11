import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, BackHandler, Easing, Keyboard, PanResponder, ScrollView, StatusBar, useColorScheme, Vibration, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useController } from './src/controller';
import { getExchange } from './src/exchanges';
import { getTheme, ThemeContext } from './src/theme';
import { playUiSound, SoundContext } from './src/sounds';
import { AppBar, IconBtn, NAV_HEIGHT, NAV_MARGIN, NavBar, ScreenTransition, Snackbar, type IconName } from './src/ui';
import { Overview } from './src/screens/Overview';
import { Signals } from './src/screens/Signals';
import { Positions } from './src/screens/Positions';
import { DemoPositions } from './src/screens/DemoPositions';
import { Market } from './src/screens/Market';
import { Settings } from './src/screens/Settings';
import { OrderSheet } from './src/screens/OrderSheet';
import { QuickRiskPopup } from './src/screens/QuickRiskPopup';
import { Intro } from './src/Intro';
import { LockScreen } from './src/LockScreen';
import { shouldRelock } from './src/lock';
import { HOLD_MS, PULL_ARM, PullGauge, pullOffset, type PullPhase } from './src/PullGauge';
import { ChartContext, type ChartContextValue } from './src/chartContext';
import { toPair, type ChartPosition } from './src/pairs';

type Tab = 'home' | 'signals' | 'market' | 'positions' | 'settings';
const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'home', label: 'Beranda', icon: 'home' }, { id: 'signals', label: 'Signal', icon: 'signals' }, { id: 'market', label: 'Pasar', icon: 'chart' },
  { id: 'positions', label: 'Posisi', icon: 'wallet' }, { id: 'settings', label: 'Setelan', icon: 'settings' },
];
const TITLES: Record<Tab, string> = { home: 'Hyperlink', signals: 'Signal', market: 'Pasar', positions: 'Posisi', settings: 'Pengaturan' };

function Shell() {
  const insets = useSafeAreaInsets();
  const ctl = useController();
  const [tab, setTab] = useState<Tab>('home');
  const [riskPopupOpen, setRiskPopupOpen] = useState(false);
  const [keyboard, setKeyboard] = useState(0);
  const [homeRefreshing, setHomeRefreshing] = useState(false);
  const [phase, setPhase] = useState<PullPhase>('idle');
  const [switchTarget, setSwitchTarget] = useState<'Demo' | 'Live'>(ctl.settings.accountMode === 'live' ? 'Demo' : 'Live');
  const phaseRef = useRef<PullPhase>('idle');
  const setPhaseBoth = (next: PullPhase) => { phaseRef.current = next; setPhase(next); };
  const scheme = useColorScheme();
  const dark = ctl.settings.themeMode === 'system' ? scheme !== 'light' : ctl.settings.themeMode === 'dark';
  const theme = getTheme(dark, ctl.settings.themeStyle);
  const soundConfig = useMemo(() => ({ enabled: ctl.settings.soundEnabled, template: ctl.settings.soundTemplate, volume: ctl.settings.soundVolume }), [ctl.settings.soundEnabled, ctl.settings.soundTemplate, ctl.settings.soundVolume]);
  const soundConfigRef = useRef(soundConfig); soundConfigRef.current = soundConfig;
  const fade = useRef(new Animated.Value(0)).current;
  const modeMotion = useRef(new Animated.Value(1)).current;
  const scrollY = useRef(0);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const flingRef = useRef<{ stop: () => void } | null>(null);
  const atTopRef = useRef(true);
  const [atTop, setAtTop] = useState(true);
  const [seconds, setSeconds] = useState(0);
  const [locked, setLocked] = useState(false);
  const leftAt = useRef<number | null>(null);
  const lockChecked = useRef(false);
  const lockEnabledRef = useRef(false); lockEnabledRef.current = ctl.settings.lockEnabled;
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullY = useRef(new Animated.Value(0)).current;
  const hold = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;
  const activeTab = useRef<Tab>(tab); activeTab.current = tab;
  const previousMode = useRef(ctl.settings.accountMode);
  const homeEntrance = useRef(new Animated.Value(1)).current;
  const wasLocked = useRef(false);
  const pullAllowed = useRef(keyboard === 0); pullAllowed.current = keyboard === 0;
  const marketRefreshRef = useRef<() => unknown>(() => ctl.loadMarket(true));
  const actionRef = useRef({ mode: ctl.settings.accountMode, refresh: () => undefined as unknown, toggle: () => undefined as unknown });
  const { sheet, closeSheet, setWatching, patchSettings } = ctl;

  const refreshActive = async () => {
    setHomeRefreshing(true);
    try {
      const keys = ctl.credentials.keys[ctl.credentials.exchange];
      await Promise.all([
        ctl.loadMarket(true),
        ctl.settings.accountMode === 'demo' ? ctl.refreshPrices([], true) : keys.apiKey && keys.apiSecret ? ctl.syncAccount(true) : Promise.resolve(),
      ]);
    } finally { setHomeRefreshing(false); }
  };
  const refreshCurrent = async () => {
    const current = activeTab.current;
    if (current === 'home' || (current !== 'market' && current !== 'positions')) return refreshActive();
    setHomeRefreshing(true);
    try {
      if (current === 'market') await Promise.resolve(marketRefreshRef.current());
      else if (ctl.settings.accountMode === 'demo') await ctl.refreshPrices([], true);
      else await ctl.syncAccount(true);
    } finally { setHomeRefreshing(false); }
  };
  actionRef.current = {
    mode: ctl.settings.accountMode,
    refresh: refreshCurrent,
    toggle: () => ctl.patchSettings({ accountMode: actionRef.current.mode === 'live' ? 'demo' : 'live' }),
  };

  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(); }, [fade]);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      homeEntrance.setValue(0);
      Animated.timing(homeEntrance, { toValue: 1, duration: 480, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
    wasLocked.current = locked;
  }, [locked, homeEntrance]);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardDidShow', (e) => setKeyboard(e.endCoordinates.height));
    const b = Keyboard.addListener('keyboardDidHide', () => setKeyboard(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  useEffect(() => {
    if (previousMode.current === ctl.settings.accountMode) return;
    previousMode.current = ctl.settings.accountMode;
    modeMotion.setValue(0.88);
    Animated.spring(modeMotion, { toValue: 1, speed: 14, bounciness: 5, useNativeDriver: true }).start();
  }, [ctl.settings.accountMode, modeMotion]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) { closeSheet(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    });
    return () => sub.remove();
  }, [tab, sheet, closeSheet]);

  useEffect(() => { if (ctl.ready && !lockChecked.current) { lockChecked.current = true; if (ctl.settings.lockEnabled) setLocked(true); } }, [ctl.ready, ctl.settings.lockEnabled]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') { if (leftAt.current === null) leftAt.current = Date.now(); return; }
      if (shouldRelock(leftAt.current, Date.now(), lockEnabledRef.current)) setLocked(true);
      leftAt.current = null;
    });
    return () => sub.remove();
  }, []);
  useEffect(() => { scrollY.current = 0; atTopRef.current = true; setAtTop(true); }, [tab]);
  useEffect(() => { setWatching(tab === 'positions' || tab === 'home'); }, [tab, setWatching]);
  const navHeight = NAV_HEIGHT + NAV_MARGIN + insets.bottom;
  const busyTop = homeRefreshing || ctl.authStep === 'starting' || Boolean(ctl.busy.exchange || ctl.busy['exchange-test'] || ctl.busy['gemini-test'] || ctl.busy.scan || ctl.busy.gemini || ctl.busy.telegram || ctl.busy.chats || ctl.busy['tg-auth'] || ctl.busy['close-all']);
  const tabDir = useRef(0);
  const go = (next: Tab) => { tabDir.current = TABS.findIndex((x) => x.id === next) - TABS.findIndex((x) => x.id === activeTab.current); Keyboard.dismiss(); scrollY.current = 0; atTopRef.current = true; setAtTop(true); setTab(next); };
  const finishIntro = () => { if (!ctl.settings.introSeen) ctl.patchSettings({ introSeen: true }); };
  const clearHold = () => {
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = null;
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    holdTimer.current = null; phaseTimer.current = null;
    hold.stopAnimation(); hold.setValue(0);
  };
  const settle = (to = 0) => Animated.spring(pullY, { toValue: to, speed: 18, bounciness: 4, useNativeDriver: true }).start();
  const armHold = () => {
    setPhaseBoth('armed');
    Vibration.vibrate(12);
    hold.setValue(0);
    const startedAt = Date.now();
    setSeconds(Math.ceil(HOLD_MS / 1000));
    tickTimer.current = setInterval(() => {
      const left = Math.max(0, Math.ceil((HOLD_MS - (Date.now() - startedAt)) / 1000));
      setSeconds((prev) => { if (prev !== left && left > 0) Vibration.vibrate(8); return left; });
    }, 200);
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start();
    phaseTimer.current = setTimeout(() => { if (phaseRef.current === 'armed') setPhaseBoth('holding'); }, 400);
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      if (tickTimer.current) clearInterval(tickTimer.current);
      tickTimer.current = null;
      setPhaseBoth('switched');
      Vibration.vibrate([0, 25, 45, 25]);
      playUiSound('confirm', soundConfigRef.current);
      ripple.setValue(0);
      Animated.timing(ripple, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      setSwitchTarget(actionRef.current.mode === 'live' ? 'Demo' : 'Live');
      actionRef.current.toggle();
    }, HOLD_MS);
  };
  const endGesture = (refresh: boolean) => {
    const was = phaseRef.current;
    clearHold();
    if (refresh && (was === 'armed' || was === 'holding')) {
      setPhaseBoth('loading');
      settle(52);
      Promise.resolve(actionRef.current.refresh()).finally(() => { setPhaseBoth('idle'); settle(0); });
      return;
    }
    if (was !== 'loading') { setPhaseBoth('idle'); settle(0); }
  };
  const stopFling = () => { flingRef.current?.stop(); flingRef.current = null; };
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    // At the very top the ScrollView is disabled (see scrollEnabled), so Android's native scroller cannot steal the drag and cancel it.
    onMoveShouldSetPanResponderCapture: (_e, g) => pullAllowed.current && atTopRef.current && phaseRef.current !== 'loading' && Math.abs(g.dy) >= 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
    onPanResponderGrant: () => { stopFling(); pullY.stopAnimation(); setSwitchTarget(actionRef.current.mode === 'live' ? 'Demo' : 'Live'); setPhaseBoth('pull'); },
    onPanResponderMove: (_e, g) => {
      if (g.dy < 0) { // scrolling content up from the top: drive the ScrollView manually for this gesture
        pullY.setValue(0);
        scrollRef.current?.scrollTo({ y: -g.dy, animated: false });
        if (phaseRef.current !== 'switched') { clearHold(); setPhaseBoth('pull'); }
        return;
      }
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      pullY.setValue(pullOffset(g.dy));
      const current = phaseRef.current;
      if (current === 'switched' || current === 'loading') return;
      if (g.dy >= PULL_ARM) { if (current === 'pull' || current === 'idle') armHold(); }
      else if (g.dy < PULL_ARM - 14 && (current === 'armed' || current === 'holding')) { clearHold(); setPhaseBoth('pull'); }
    },
    onPanResponderRelease: (_e, g) => {
      if (g.dy < -6) { // keep a little momentum after the manual scroll
        const value = new Animated.Value(-g.dy);
        const id = value.addListener(({ value: y }) => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }));
        const decay = Animated.decay(value, { velocity: -g.vy, deceleration: 0.996, useNativeDriver: false });
        flingRef.current = { stop: () => { decay.stop(); value.removeListener(id); } };
        decay.start(() => value.removeListener(id));
        endGesture(false);
        return;
      }
      endGesture(true);
    },
    onPanResponderTerminate: () => endGesture(false),
    onPanResponderTerminationRequest: () => false,
  })).current;

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (phaseTimer.current) clearTimeout(phaseTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    flingRef.current?.stop();
    hold.stopAnimation();
  }, [hold]);

  const chartSettings = ctl.settings;
  const addChartAlert = ctl.addPriceAlert;
  const demoPositions = ctl.demo.positions;
  const livePositions = ctl.positions;
  const chartSignals = ctl.signals;
  const chartValue = useMemo<ChartContextValue>(() => {
    const demoMode = chartSettings.accountMode === 'demo';
    const positions: ChartPosition[] = demoMode
      ? demoPositions.map((p) => ({ symbol: p.symbol, side: p.side, entry: p.entry, stopLoss: p.stopLoss, takeProfits: (p.takeProfits && p.takeProfits.length ? p.takeProfits : p.takeProfit ? [p.takeProfit] : []), label: 'Demo' }))
      : livePositions.map((p) => ({ symbol: p.symbol, side: p.side, entry: Number(p.avgPrice), stopLoss: Number(p.stopLoss) > 0 ? Number(p.stopLoss) : undefined, takeProfits: Number(p.takeProfit) > 0 ? [Number(p.takeProfit)] : [], label: 'Posisi' }));
    const latestCall = chartSignals.find((x) => x.status !== 'dismissed') || null;
    const toggle = (symbol: string) => {
      const key = toPair(symbol);
      const list = chartSettings.favoritePairs.map(toPair);
      patchSettings({ favoritePairs: list.includes(key) ? list.filter((x) => x !== key) : [key, ...list].slice(0, 60) });
    };
    return { hideBalances: chartSettings.hideBalances, toggleHide: () => patchSettings({ hideBalances: !chartSettings.hideBalances }), addAlert: addChartAlert, favorites: chartSettings.favoritePairs, toggleFavorite: toggle, latestCall, callSymbols: chartSignals.slice(0, 30).map((x) => x.symbol), positions };
  }, [chartSettings.accountMode, chartSettings.favoritePairs, chartSettings.hideBalances, addChartAlert, demoPositions, livePositions, chartSignals, patchSettings]);

  return (
    <ThemeContext.Provider value={theme}><SoundContext.Provider value={soundConfig}><ChartContext.Provider value={chartValue}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} />
      <Animated.View style={{ flex: 1, backgroundColor: theme.surface, opacity: Animated.multiply(fade, homeEntrance), transform: [{ scale: modeMotion }, { translateY: homeEntrance.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] }}>
        <AppBar title={ctl.settings.accountMode === 'demo' && tab === 'positions' ? 'Posisi Demo' : TITLES[tab]} subtitle={tab === 'home' ? (ctl.settings.accountMode === 'demo' ? 'Paper trading · terpisah dari Live' : 'Futures cockpit · Live') : tab === 'positions' ? (ctl.settings.accountMode === 'demo' ? `Harga ${ctl.settings.demoPriceSource === 'exchange' ? getExchange(ctl.credentials.exchange).label : 'CoinGecko'} · akun simulasi` : 'Exchange futures · Live') : undefined} top={insets.top} busy={busyTop}
          actions={tab === 'market' ? <IconBtn icon="refresh" label="Muat ulang" onPress={() => ctl.loadMarket(true)} /> : tab === 'home' ? <IconBtn icon="refresh" label="Sinkron" onPress={refreshActive} /> : tab === 'positions' ? <IconBtn icon="refresh" label="Sinkron" onPress={() => (ctl.settings.accountMode === 'demo' ? ctl.refreshPrices([], true) : ctl.syncAccount())} /> : undefined} />
        <ScreenTransition key={tab} dir={tabDir.current}>
          <View {...panResponder.panHandlers} style={{ flex: 1 }}>
          {phase !== 'idle' ? <PullGauge pullY={pullY} hold={hold} ripple={ripple} phase={phase} target={switchTarget} seconds={seconds} theme={theme} /> : null}
          <Animated.View style={{ flex: 1, transform: [{ translateY: pullY }] }}>
          <ScrollView
            ref={scrollRef} scrollEnabled={keyboard > 0 || !atTop} onTouchStart={stopFling}
            onScroll={(e) => { const y = Math.max(0, e.nativeEvent.contentOffset.y); scrollY.current = y; const top = y <= 1; if (top !== atTopRef.current) { atTopRef.current = top; setAtTop(top); } }} scrollEventThrottle={16}
            keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
            contentContainerStyle={{ width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: (keyboard === 0 ? navHeight : 0) + 24 + keyboard }}>
            {tab === 'home' ? <Overview ctl={ctl} go={go} onOpenRisk={() => setRiskPopupOpen(true)} /> : tab === 'signals' ? <Signals ctl={ctl} /> : tab === 'market' ? <Market ctl={ctl} bottom={insets.bottom} go={go} refreshRef={marketRefreshRef} /> : tab === 'positions' ? ctl.settings.accountMode === 'demo' ? <DemoPositions ctl={ctl} /> : <Positions ctl={ctl} /> : <Settings ctl={ctl} bottom={insets.bottom} onOpenRisk={() => setRiskPopupOpen(true)} />}
          </ScrollView>
          </Animated.View>
          </View>
        </ScreenTransition>
        {keyboard === 0 ? <NavBar items={TABS} active={tab} onChange={go} bottom={insets.bottom} badge={{ signals: ctl.signals.filter((s) => s.status === 'ready').length }} /> : null}
        <Snackbar message={ctl.toast?.message || ''} tone={ctl.toast?.tone || 'info'} icon={ctl.toast?.icon} bottom={(keyboard === 0 ? navHeight : 0) + 12} onDismiss={ctl.dismissToast} />
        <QuickRiskPopup ctl={ctl} visible={riskPopupOpen} onClose={() => setRiskPopupOpen(false)} />
        <OrderSheet ctl={ctl} bottom={insets.bottom} env={ctl.credentials.keys[ctl.credentials.exchange].env} exchange={getExchange(ctl.credentials.exchange).label} />
      </Animated.View>
      {locked ? <LockScreen biometricEnabled={ctl.settings.biometricUnlock} onUnlock={() => setLocked(false)} /> : null}
      <Intro ready={ctl.ready} firstRun={!ctl.settings.introSeen} dark={dark} onFinish={finishIntro} />
    </ChartContext.Provider></SoundContext.Provider></ThemeContext.Provider>
  );
}

export default function App() {
  return <SafeAreaProvider><Shell /></SafeAreaProvider>;
}
