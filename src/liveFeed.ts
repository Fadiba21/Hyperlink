import { useEffect, useRef, useState } from 'react';
import type { Env, ExchangeId } from './exchanges/types';
import { baseTicker } from './pairs';

export type FeedSpec = { url: string; subscribe?: string; ping?: string; parse: (raw: unknown) => number | null };
const num = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; };

/** Public ticker WebSocket per exchange (mainnet only). null = no feed, caller keeps polling. */
export function feedSpec(exchange: ExchangeId, env: Env, symbol: string): FeedSpec | null {
  const main = env === 'mainnet';
  const sym = `${baseTicker(symbol)}USDT`;
  if (exchange === 'bybit') return { url: main ? 'wss://stream.bybit.com/v5/public/linear' : 'wss://stream-testnet.bybit.com/v5/public/linear', subscribe: JSON.stringify({ op: 'subscribe', args: [`tickers.${sym}`] }), ping: JSON.stringify({ op: 'ping' }), parse: (m) => { const x = m as { topic?: string; data?: { lastPrice?: string } }; return x?.topic === `tickers.${sym}` ? num(x.data?.lastPrice) : null; } };
  if (exchange === 'binance') return { url: `${main ? 'wss://fstream.binance.com' : 'wss://fstream.binancefuture.com'}/ws/${sym.toLowerCase()}@miniTicker`, parse: (m) => { const x = m as { e?: string; c?: string }; return x?.e === '24hrMiniTicker' ? num(x.c) : null; } };
  if (exchange === 'okx') return { url: main ? 'wss://ws.okx.com:8443/ws/v5/public' : 'wss://wspap.okx.com:8443/ws/v5/public', subscribe: JSON.stringify({ op: 'subscribe', args: [{ channel: 'tickers', instId: `${baseTicker(symbol)}-USDT-SWAP` }] }), ping: 'ping', parse: (m) => { const x = m as { data?: Array<{ last?: string }> }; return num(x?.data?.[0]?.last); } };
  // Bitget has no separate public testnet feed (demo trading uses the live host), so only mainnet streams.
  if (exchange === 'bitget' && main) return { url: 'wss://ws.bitget.com/v2/ws/public', subscribe: JSON.stringify({ op: 'subscribe', args: [{ instType: 'USDT-FUTURES', channel: 'ticker', instId: sym }] }), ping: 'ping', parse: (m) => { const x = m as { arg?: { instId?: string }; data?: Array<{ lastPr?: string }> }; return x?.arg?.instId === sym ? num(x.data?.[0]?.lastPr) : null; } };
  return null;
}

/** Streams the last price (updates at most once per second). Returns 0 until the first tick or when no feed exists. */
export function useLiveQuote(exchange: ExchangeId, env: Env, symbol: string, enabled: boolean): number {
  const [price, setPrice] = useState(0);
  const lastEmit = useRef(0);
  useEffect(() => {
    setPrice(0);
    const spec = enabled ? feedSpec(exchange, env, symbol) : null;
    if (!spec || typeof WebSocket === 'undefined') return undefined;
    let alive = true; let socket: WebSocket | null = null; let retry: ReturnType<typeof setTimeout> | null = null; let ping: ReturnType<typeof setInterval> | null = null; let attempt = 0;
    const connect = () => {
      if (!alive) return;
      try {
        socket = new WebSocket(spec.url);
        socket.onopen = () => { attempt = 0; if (spec.subscribe) socket?.send(spec.subscribe); if (spec.ping) ping = setInterval(() => { try { socket?.send(spec.ping as string); } catch { /* reconnect handles it */ } }, 20000); };
        socket.onmessage = (event) => {
          try {
            const text = String(event.data);
            if (text === 'pong') return;
            const p = spec.parse(JSON.parse(text));
            if (p && Date.now() - lastEmit.current >= 1000) { lastEmit.current = Date.now(); setPrice(p); }
          } catch { /* ignore non-ticker frames */ }
        };
        const drop = () => { if (ping) clearInterval(ping); ping = null; if (alive) { attempt += 1; retry = setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(attempt, 4))); } };
        socket.onclose = drop; socket.onerror = () => { try { socket?.close(); } catch { /* already closed */ } };
      } catch { /* retry via timer below */ attempt += 1; retry = setTimeout(connect, 5000); }
    };
    connect();
    return () => { alive = false; if (retry) clearTimeout(retry); if (ping) clearInterval(ping); try { socket?.close(); } catch { /* noop */ } };
  }, [exchange, env, symbol, enabled]);
  return price;
}
