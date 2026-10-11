import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon, type IconName } from './ui';

export const SPLASH_MIN_MS = 3000;
export const SPLASH_FADE_MS = 450;
const FONT_BOLD = 'Poppins-Bold';
const FONT_MED = 'Poppins-Medium';
const FONT_LIGHT = 'Poppins-Light';
const NAME = 'Hyperlink'.split('');

/** Splash fade starts only after both readiness and the three-second minimum display time. */
export const splashFadeDelay = (elapsedMs: number): number => Math.max(0, SPLASH_MIN_MS - elapsedMs);

function Logo({ size, background, foreground, draw }: { size: number; background: string; foreground: string; draw: Animated.Value }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: background, alignItems: 'center', justifyContent: 'center', elevation: 14, shadowColor: background, shadowOpacity: 0.24, shadowRadius: 22, shadowOffset: { width: 0, height: 10 } }}>
    <Animated.Image source={require('../assets/brand/hyperlink-mark.png')} resizeMode="contain" style={{ width: size * 0.78, height: size * 0.78, tintColor: foreground, opacity: draw.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 0.7, 1], extrapolate: 'clamp' }), transform: [{ scale: draw.interpolate({ inputRange: [0, 0.75, 1], outputRange: [0.72, 1.08, 1], extrapolate: 'clamp' }) }] }} />
  </View>;
}

const POINTS: Array<{ icon: IconName; title: string; copy: string }> = [
  { icon: 'send', title: 'Signal Telegram', copy: 'Call dibaca otomatis dan divalidasi AI.' },
  { icon: 'shield', title: 'Pengaman Live', copy: 'Auto-entry Live opsional dan mati secara default.' },
  { icon: 'play', title: 'Demo & Live', copy: 'Latihan dengan saldo simulasi, lalu pindah ke exchange.' },
];

export function Intro({ ready, firstRun, dark, onFinish }: { ready: boolean; firstRun: boolean; dark: boolean; onFinish: () => void }) {
  const [visible, setVisible] = useState(true);
  const mounted = useRef(Date.now()).current;
  const fade = useRef(new Animated.Value(1)).current;
  const draw = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const letters = useRef(NAME.map(() => new Animated.Value(0))).current;
  const tagline = useRef(new Animated.Value(0)).current;
  const lift = useRef(new Animated.Value(0)).current;
  const content = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const finishRef = useRef(onFinish); finishRef.current = onFinish;
  const bg = dark ? '#070A12' : '#F5F6FC';
  const fg = dark ? '#F5F6FF' : '#17182A';
  const sub = dark ? '#A5A8BC' : '#66697C';
  const accent = dark ? '#A98CFF' : '#6B55D9';
  const logoBackground = dark ? '#FFFFFF' : '#000000';
  const logoForeground = dark ? '#000000' : '#FFFFFF';

  const close = (duration: number) => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(fade, { toValue: 0, duration, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(() => { setVisible(false); finishRef.current(); });
  };

  useEffect(() => {
    Animated.sequence([
      Animated.timing(draw, { toValue: 1, duration: 720, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    Animated.stagger(55, letters.map((v) => Animated.spring(v, { toValue: 1, damping: 12, stiffness: 140, useNativeDriver: true }))).start();
    Animated.timing(tagline, { toValue: 1, duration: 520, delay: 650, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [draw, letters, tagline, pulse]);

  useEffect(() => {
    if (!ready || closing.current) return undefined;
    if (firstRun) {
      Animated.parallel([
        Animated.timing(lift, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(content, { toValue: 1, duration: 600, delay: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
    const timer = setTimeout(() => close(SPLASH_FADE_MS), splashFadeDelay(Date.now() - mounted));
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, firstRun]);

  useEffect(() => {
    if (!visible || !ready || !firstRun) return undefined;
    const sub2 = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub2.remove();
  }, [visible, ready, firstRun]);

  if (!visible) return null;
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 0] });
  const logoShift = lift.interpolate({ inputRange: [0, 1], outputRange: [0, -120] });
  const logoScale = lift.interpolate({ inputRange: [0, 1], outputRange: [1, 0.78] });
  return <Animated.View style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000, backgroundColor: bg, opacity: fade, alignItems: 'center', justifyContent: 'center' }]}>
    <Animated.View style={{ alignItems: 'center', transform: [{ translateY: logoShift }, { scale: logoScale }] }}>
      <View style={{ width: 132, height: 132, alignItems: 'center', justifyContent: 'center' }}>
        <Animated.View style={{ position: 'absolute', width: 132, height: 132, borderRadius: 40, borderWidth: 2, borderColor: logoBackground, opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
        <Animated.View style={{ transform: [{ scale: draw.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.4, 1.06, 1] }) }] }}><Logo size={112} background={logoBackground} foreground={logoForeground} draw={draw} /></Animated.View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 26 }}>
        {NAME.map((ch, i) => <Animated.Text key={i} style={{ fontFamily: FONT_BOLD, fontSize: 28, letterSpacing: 3, color: fg, opacity: letters[i], transform: [{ translateY: letters[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>{ch}</Animated.Text>)}
      </View>
      <Animated.Text style={{ fontFamily: FONT_LIGHT, fontSize: 13, letterSpacing: 2.2, color: sub, marginTop: 6, opacity: tagline }}>Trade with clarity</Animated.Text>
    </Animated.View>
    {firstRun && ready ? <Animated.View style={{ position: 'absolute', left: 28, right: 28, bottom: 36, top: '47%', justifyContent: 'space-between', opacity: content, transform: [{ translateY: content.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] }}>
      <View style={{ gap: 14, marginTop: 8 }}>
        {POINTS.map((p) => <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: accent + '26', alignItems: 'center', justifyContent: 'center' }}><Icon name={p.icon} size={21} color={accent} /></View>
          <View style={{ flex: 1 }}><Text style={{ fontFamily: FONT_MED, fontSize: 15, color: fg }}>{p.title}</Text><Text style={{ fontFamily: FONT_LIGHT, fontSize: 12.5, lineHeight: 18, color: sub }}>{p.copy}</Text></View>
        </View>)}
      </View>
      <Pressable onPress={() => close(320)} accessibilityRole="button" accessibilityLabel="Mulai" android_ripple={{ color: '#FFFFFF33', borderless: false }} style={{ height: 54, borderRadius: 27, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
        <Text style={{ fontFamily: FONT_BOLD, fontSize: 16, color: '#FFFFFF', letterSpacing: 0.6 }}>Mulai</Text>
      </Pressable>
    </Animated.View> : null}
  </Animated.View>;
}
