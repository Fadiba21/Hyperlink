import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PanResponder, Vibration, View } from 'react-native';
import { bollinger, macd, niceTicks, panOffset, pinchCount, timeLabel, touchDistance, vwap } from './chartMath';
import type { Candle } from './domain';
import { price as fmtPrice } from './format';
import { ema, rsi, sma, visibleLevels, windowRange, type ChartLevel } from './pairs';
import { useTheme } from './theme';
import { Icon, Txt, type IconName } from './ui';

export type ChartKind = 'candle' | 'line' | 'area';
export type Indicators = { ma: boolean; ema: boolean; boll: boolean; vwap: boolean; vol: boolean; rsi: boolean; macd: boolean };
export type CrossPoint = { i: number; y: number } | null;
export const AXIS_W = 58;
const PAD_T = 12; const PAD_B = 8; const TIME_H = 20; const SUB_H = 70;
export const C_MA7 = '#F5B73D'; export const C_MA25 = '#7C8CFF'; export const C_EMA = '#E86AD6'; export const C_BOLL = '#4FC3F7'; export const C_VWAP = '#FF8A65';
const LEVEL_ICON: Record<ChartLevel['kind'], IconName> = { entry: 'exchange', sl: 'shield', tp: 'check' };

type Pt = number | null;
type Props = {
  candles: Candle[]; lastPrice: number; kind: ChartKind; levels: ChartLevel[]; ind: Indicators;
  count: number; offset: number; height: number; cross: CrossPoint;
  onView: (v: { count: number; offset: number }) => void; onCross: (c: CrossPoint) => void; onReset: () => void;
};

export function ChartCanvas({ candles, lastPrice, kind, levels, ind, count, offset, height, cross, onView, onCross, onReset }: Props) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const total = candles.length;
  const range = windowRange(total, count, offset);
  const vis = candles.slice(range.from, range.to);
  const n = vis.length;
  const subCount = (ind.rsi ? 1 : 0) + (ind.macd ? 1 : 0);
  const mainH = Math.max(120, height - TIME_H - subCount * SUB_H);
  const plotW = Math.max(0, width - AXIS_W);
  const step = n > 0 ? plotW / n : 0;
  const closesAll = useMemo(() => candles.map((c) => c.c), [candles]);
  const cut = <T,>(a: T[]) => a.slice(range.from, range.to);
  const ma7 = ind.ma ? cut(sma(closesAll, 7)) : []; const ma25 = ind.ma ? cut(sma(closesAll, 25)) : [];
  const ema50 = ind.ema ? cut(ema(closesAll, 50)) : [];
  const bb = ind.boll ? cut(bollinger(closesAll, 20, 2)) : [];
  const vw = ind.vwap ? cut(vwap(candles)) : [];

  // y-range: candles + enabled overlays + level lines that are close enough to matter
  let lo = Infinity; let hi = -Infinity;
  vis.forEach((c) => { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
  if (!(hi > lo)) { lo = (lastPrice || 1) * 0.99; hi = (lastPrice || 1) * 1.01; }
  bb.forEach((b) => { if (b) { lo = Math.min(lo, b.lo); hi = Math.max(hi, b.up); } });
  const { inside } = visibleLevels(levels, lo, hi);
  inside.forEach((l) => { lo = Math.min(lo, l.price); hi = Math.max(hi, l.price); });
  const padSpan = (hi - lo) * 0.06; lo -= padSpan; hi += padSpan;
  const span = Math.max(hi - lo, Math.abs(hi) * 1e-6, 1e-12);
  const plotH = mainH - PAD_T - PAD_B;
  const y = (v: number) => PAD_T + ((hi - v) / span) * plotH;
  const xc = (i: number) => step * (i + 0.5);
  const up = n > 1 ? vis[n - 1].c >= vis[0].o : true;
  const accent = up ? t.success : t.error;
  const bodyW = Math.max(2, Math.min(14, step * 0.68));

  const decimate = Math.max(1, Math.ceil(n / 160));
  const line = (vals: Pt[], color: string, thick: number, key: string, yf: (v: number) => number = y) => {
    const out: ReactNode[] = [];
    let prevI = -1;
    for (let i = 0; i < vals.length; i += decimate) {
      const v = vals[i]; if (v === null || v === undefined) { prevI = -1; continue; }
      if (prevI >= 0) {
        const pv = vals[prevI] as number;
        const x1 = xc(prevI); const x2 = xc(i); const y1 = yf(pv); const y2 = yf(v);
        const len = Math.max(1, Math.hypot(x2 - x1, y2 - y1));
        out.push(<View key={`${key}${i}`} style={{ position: 'absolute', left: (x1 + x2 - len) / 2, top: (y1 + y2) / 2 - thick / 2, width: len, height: thick, borderRadius: thick / 2, backgroundColor: color, transform: [{ rotate: `${Math.atan2(y2 - y1, x2 - x1)}rad` }] }} />);
      }
      prevI = i;
    }
    return out;
  };

  // gestures ------------------------------------------------------------------
  const live = useRef({ count, offset, total, step, n, props: { onView, onCross, onReset } });
  live.current = { count, offset, total, step, n, props: { onView, onCross, onReset } };
  const g = useRef({ mode: 'idle' as 'idle' | 'pan' | 'cross' | 'pinch', startOffset: 0, startCount: 0, startDist: 0, startX: 0, lastTap: 0 });
  const timers = useRef<{ press: ReturnType<typeof setTimeout> | null; hide: ReturnType<typeof setTimeout> | null }>({ press: null, hide: null });
  const clearPress = () => { if (timers.current.press) { clearTimeout(timers.current.press); timers.current.press = null; } };
  const hideLater = () => { if (timers.current.hide) clearTimeout(timers.current.hide); timers.current.hide = setTimeout(() => live.current.props.onCross(null), 3000); };
  const setCross = (x: number, yy: number) => {
    const { step: st, n: nn } = live.current;
    if (!(st > 0) || nn < 1) return;
    live.current.props.onCross({ i: Math.max(0, Math.min(nn - 1, Math.floor(x / st))), y: yy });
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const s = g.current; s.mode = 'idle'; s.startOffset = live.current.offset; s.startCount = live.current.count; s.startDist = 0;
      s.startX = e.nativeEvent.locationX;
      if (timers.current.hide) clearTimeout(timers.current.hide);
      const sy = e.nativeEvent.locationY;
      clearPress();
      timers.current.press = setTimeout(() => { if (g.current.mode === 'idle') { g.current.mode = 'cross'; Vibration.vibrate(10); setCross(g.current.startX, sy); } }, 260);
    },
    onPanResponderMove: (e, gs) => {
      const s = g.current; const L = live.current; const touches = e.nativeEvent.touches;
      if (touches && touches.length >= 2) {
        clearPress();
        const d = touchDistance(touches[0], touches[1]);
        if (s.mode !== 'pinch') { s.mode = 'pinch'; s.startDist = d; s.startCount = L.count; L.props.onCross(null); return; }
        if (s.startDist > 0) L.props.onView({ count: pinchCount(s.startCount, d / s.startDist, L.total), offset: L.offset });
        return;
      }
      if (s.mode === 'pinch') return;
      if (s.mode === 'cross') { setCross(e.nativeEvent.locationX, e.nativeEvent.locationY); return; }
      if (s.mode === 'idle' && (Math.abs(gs.dx) > 6 || Math.abs(gs.dy) > 6)) { clearPress(); s.mode = 'pan'; L.props.onCross(null); }
      if (s.mode === 'pan') L.props.onView({ count: L.count, offset: panOffset(s.startOffset, gs.dx, L.step, L.total, L.count) });
    },
    onPanResponderRelease: (e) => {
      const s = g.current; clearPress();
      if (s.mode === 'idle') {                       // tap
        const now = Date.now();
        if (now - s.lastTap < 300) { live.current.props.onReset(); live.current.props.onCross(null); }
        else { setCross(e.nativeEvent.locationX, e.nativeEvent.locationY); hideLater(); }
        s.lastTap = now;
      } else if (s.mode === 'cross') hideLater();
      s.mode = 'idle';
    },
    onPanResponderTerminate: () => { clearPress(); g.current.mode = 'idle'; },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const sel = cross && cross.i < n ? vis[cross.i] : null;
  const crossPrice = cross ? hi - ((cross.y - PAD_T) / plotH) * span : 0;
  const hiIdx = n ? vis.reduce((m, c, i) => (c.h > vis[m].h ? i : m), 0) : 0;
  const loIdx = n ? vis.reduce((m, c, i) => (c.l < vis[m].l ? i : m), 0) : 0;
  const ticks = niceTicks(lo, hi, 5);
  const volMax = Math.max(1e-12, ...vis.map((c) => c.v || 0));
  const hasVol = vis.some((c) => (c.v || 0) > 0);
  const windowSpan = n > 1 ? vis[n - 1].t - vis[0].t : 0;
  const timeIdx = n > 1 ? [0.08, 0.32, 0.56, 0.8].map((f) => Math.round(f * (n - 1))) : [];
  const lastY = lastPrice > 0 ? y(Math.max(lo, Math.min(hi, lastPrice))) : -1;
  const colOf = (k: ChartLevel['kind']) => (k === 'sl' ? t.error : k === 'tp' ? t.success : t.primary);

  const rsiVals = ind.rsi ? cut(rsi(closesAll, 14)) : [];
  const macdVals = ind.macd ? cut(macd(closesAll)) : [];
  const macdAbs = Math.max(1e-12, ...macdVals.map((m) => (m ? Math.max(Math.abs(m.macd), Math.abs(m.signal), Math.abs(m.hist)) : 0)));

  return <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
    <View {...pan.panHandlers} style={{ height: mainH }}>
      {/* grid + price axis */}
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width, height: mainH }}>
        {ticks.map((v) => <View key={v} style={{ position: 'absolute', left: 0, width: plotW, top: y(v) }}>
          <View style={{ height: 1, backgroundColor: t.outlineVariant, opacity: 0.45 }} />
          <Txt variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1} style={{ position: 'absolute', left: plotW + 4, top: -7, width: AXIS_W - 6, fontSize: 9.5, lineHeight: 13 }}>{fmtPrice(v)}</Txt>
        </View>)}
      </View>
      {width > 0 && n > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: plotW, height: mainH, overflow: 'hidden' }}>
        {hasVol && ind.vol ? vis.map((c, i) => <View key={`v${i}`} style={{ position: 'absolute', left: xc(i) - Math.max(1, bodyW / 2), bottom: PAD_B, width: Math.max(2, bodyW), height: Math.max(1, ((c.v || 0) / volMax) * mainH * 0.18), backgroundColor: c.c >= c.o ? t.success : t.error, opacity: 0.35 }} />) : null}
        {kind === 'area' ? vis.map((c, i) => <View key={`a${i}`} style={{ position: 'absolute', left: xc(i) - step / 2, top: y(c.c), width: step + 0.5, bottom: PAD_B, backgroundColor: accent, opacity: 0.12 }} />) : null}
        {kind === 'candle' ? vis.map((c, i) => {
          const col = c.c >= c.o ? t.success : t.error;
          const wt = y(c.h); const wb = y(c.l); const bt = y(Math.max(c.o, c.c)); const bb2 = y(Math.min(c.o, c.c));
          if (step < 3) return <View key={`c${i}`} style={{ position: 'absolute', left: xc(i) - 0.5, top: wt, width: 1, height: Math.max(1, wb - wt), backgroundColor: col }} />;
          return <View key={`c${i}`} style={{ position: 'absolute', left: xc(i) - bodyW / 2, top: 0, width: bodyW, height: mainH }}>
            <View style={{ position: 'absolute', left: bodyW / 2 - 0.75, top: wt, width: 1.5, height: Math.max(2, wb - wt), backgroundColor: col }} />
            <View style={{ position: 'absolute', left: 0, top: bt, width: bodyW, height: Math.max(1.5, bb2 - bt), backgroundColor: col, borderRadius: 1 }} />
          </View>;
        }) : line(vis.map((c) => c.c), accent, 2.2, 'l')}
        {ind.boll ? <>{line(bb.map((b) => (b ? b.up : null)), C_BOLL, 1, 'bu')}{line(bb.map((b) => (b ? b.lo : null)), C_BOLL, 1, 'bl')}{line(bb.map((b) => (b ? b.mid : null)), C_BOLL, 1, 'bm')}</> : null}
        {ind.ma ? <>{line(ma7, C_MA7, 1.4, 'm7')}{line(ma25, C_MA25, 1.4, 'm25')}</> : null}
        {ind.ema ? line(ema50, C_EMA, 1.4, 'e50') : null}
        {ind.vwap ? line(vw, C_VWAP, 1.4, 'vw') : null}
        {inside.map((l, i) => <View key={`${l.label}-${i}`} style={{ position: 'absolute', left: 0, right: 0, top: y(l.price) }}>
          <View style={{ borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colOf(l.kind), opacity: 0.9 }} />
          <View style={{ position: 'absolute', left: 4, top: -9, flexDirection: 'row', alignItems: 'center', gap: 3, height: 17, paddingHorizontal: 6, borderRadius: 9, backgroundColor: colOf(l.kind) }}>
            <Icon name={LEVEL_ICON[l.kind]} size={9} color={t.surface} /><Txt variant="labelSmall" color={t.surface} style={{ fontSize: 9, lineHeight: 12, fontWeight: '700' }}>{l.label} {fmtPrice(l.price)}</Txt>
          </View>
        </View>)}
        {lastY >= 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: lastY, borderTopWidth: 1, borderStyle: 'dotted', borderColor: accent, opacity: 0.85 }} /> : null}
        {n > 8 ? <>
          <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ position: 'absolute', left: Math.max(2, Math.min(plotW - 64, xc(hiIdx) - 28)), top: Math.max(0, y(vis[hiIdx].h) - 15), fontSize: 9 }}>▲ {fmtPrice(vis[hiIdx].h)}</Txt>
          <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ position: 'absolute', left: Math.max(2, Math.min(plotW - 64, xc(loIdx) - 28)), top: Math.min(mainH - 14, y(vis[loIdx].l) + 3), fontSize: 9 }}>▼ {fmtPrice(vis[loIdx].l)}</Txt>
        </> : null}
        {cross && sel ? <>
          <View style={{ position: 'absolute', left: xc(cross.i) - 0.5, top: 0, width: 1, height: mainH, backgroundColor: t.onSurfaceVariant, opacity: 0.7 }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: Math.max(0, Math.min(mainH, cross.y)), height: 1, backgroundColor: t.onSurfaceVariant, opacity: 0.7 }} />
        </> : null}
      </View> : null}
      {lastPrice > 0 && width > 0 && lastY >= 0 ? <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: lastY - 9, width: AXIS_W - 2, height: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 4, backgroundColor: accent }}><Txt variant="labelSmall" color={t.surface} numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 13, fontWeight: '700' }}>{fmtPrice(lastPrice)}</Txt></View> : null}
      {cross && sel ? <View pointerEvents="none" style={{ position: 'absolute', right: 0, top: Math.max(0, Math.min(mainH - 18, cross.y - 9)), width: AXIS_W - 2, height: 18, justifyContent: 'center', alignItems: 'center', borderRadius: 4, backgroundColor: t.onSurface }}><Txt variant="labelSmall" color={t.surface} numberOfLines={1} style={{ fontSize: 9.5, lineHeight: 13, fontWeight: '700' }}>{fmtPrice(crossPrice)}</Txt></View> : null}
    </View>

    {/* sub panels */}
    {ind.rsi && n > 0 ? <View pointerEvents="none" style={{ height: SUB_H, borderTopWidth: 1, borderTopColor: t.outlineVariant }}>
      {[30, 70].map((lv) => <View key={lv} style={{ position: 'absolute', left: 0, width: plotW, top: 6 + ((100 - lv) / 100) * (SUB_H - 18), height: 1, backgroundColor: t.outlineVariant, opacity: 0.6 }} />)}
      <View style={{ position: 'absolute', left: 0, width: plotW, top: 0, bottom: 0, overflow: 'hidden' }}>{line(rsiVals, C_EMA, 1.5, 'r', (v) => 6 + ((100 - v) / 100) * (SUB_H - 18))}</View>
      <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ position: 'absolute', left: 4, top: 1, fontSize: 9 }}>RSI 14</Txt>
      <Txt variant="labelSmall" color={C_EMA} style={{ position: 'absolute', left: plotW + 4, top: 1, fontSize: 9.5 }}>{(() => { const l = [...rsiVals].reverse().find((v) => v !== null && v !== undefined); return l == null ? '—' : l.toFixed(1); })()}</Txt>
    </View> : null}
    {ind.macd && n > 0 ? <View pointerEvents="none" style={{ height: SUB_H, borderTopWidth: 1, borderTopColor: t.outlineVariant }}>
      <View style={{ position: 'absolute', left: 0, width: plotW, top: 0, bottom: 0, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', left: 0, right: 0, top: SUB_H / 2, height: 1, backgroundColor: t.outlineVariant, opacity: 0.6 }} />
        {macdVals.map((m, i) => m ? <View key={`h${i}`} style={{ position: 'absolute', left: xc(i) - Math.max(1, bodyW / 2.4), width: Math.max(2, bodyW / 1.2), top: m.hist >= 0 ? SUB_H / 2 - (m.hist / macdAbs) * (SUB_H / 2 - 8) : SUB_H / 2, height: Math.max(1, (Math.abs(m.hist) / macdAbs) * (SUB_H / 2 - 8)), backgroundColor: m.hist >= 0 ? t.success : t.error, opacity: 0.55 }} /> : null)}
        {line(macdVals.map((m) => (m ? m.macd : null)), C_MA7, 1.3, 'mm', (v) => SUB_H / 2 - (v / macdAbs) * (SUB_H / 2 - 8))}
        {line(macdVals.map((m) => (m ? m.signal : null)), C_MA25, 1.3, 'ms', (v) => SUB_H / 2 - (v / macdAbs) * (SUB_H / 2 - 8))}
      </View>
      <Txt variant="labelSmall" color={t.onSurfaceVariant} style={{ position: 'absolute', left: 4, top: 1, fontSize: 9 }}>MACD 12·26·9</Txt>
    </View> : null}
    {cross && sel && subCount > 0 ? <View pointerEvents="none" style={{ position: 'absolute', left: xc(cross.i) - 0.5, top: mainH, width: 1, height: subCount * SUB_H, backgroundColor: t.onSurfaceVariant, opacity: 0.5 }} /> : null}

    {/* time axis */}
    <View pointerEvents="none" style={{ height: TIME_H }}>
      {timeIdx.map((i, k) => <Txt key={k} variant="labelSmall" color={t.onSurfaceVariant} numberOfLines={1} style={{ position: 'absolute', left: Math.max(0, Math.min(plotW - 44, xc(i) - 22)), top: 4, width: 44, textAlign: 'center', fontSize: 9.5 }}>{timeLabel(vis[i].t, windowSpan)}</Txt>)}
      {cross && sel ? <View style={{ position: 'absolute', left: Math.max(0, Math.min(plotW - 92, xc(cross.i) - 46)), top: 1, width: 92, height: 18, borderRadius: 4, backgroundColor: t.onSurface, alignItems: 'center', justifyContent: 'center' }}><Txt variant="labelSmall" color={t.surface} style={{ fontSize: 9.5, fontWeight: '700' }}>{new Date(sel.t).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</Txt></View> : null}
    </View>
  </View>;
}
