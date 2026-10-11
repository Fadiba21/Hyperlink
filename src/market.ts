import { useCallback, useRef, useState } from 'react';
import { clearCoinGeckoCache, coinGeckoCoinDetail, coinGeckoGlobal, coinGeckoListings, coinGeckoTrending, type CoinGeckoCoin, type CoinGeckoGlobal, type CoinGeckoInfo, type CoinGeckoSort } from './coingecko';
import { errorMessage } from './format';

export type MarketSection = 'global' | 'coins' | 'trending';
export type MarketState = {
  global: CoinGeckoGlobal | null; coins: CoinGeckoCoin[]; trending: CoinGeckoCoin[];
  errors: Partial<Record<MarketSection, string>>; loading: Partial<Record<MarketSection, boolean>>; sort: CoinGeckoSort;
  detail: { coin: CoinGeckoCoin; info: CoinGeckoInfo } | null; detailError?: string; detailLoading: boolean; loadedAt: number;
};
const empty: MarketState = { global: null, coins: [], trending: [], errors: {}, loading: {}, sort: 'market_cap', detail: null, detailLoading: false, loadedAt: 0 };

/** CoinGecko data is cached in the controller so it survives tab switches. */
export function useMarket() {
  const [m, setM] = useState<MarketState>(empty);
  const sortRef = useRef<CoinGeckoSort>('market_cap');
  const patch = (p: Partial<MarketState>) => setM((s) => ({ ...s, ...p }));
  const section = useCallback(async <T,>(name: MarketSection, job: () => Promise<T>, apply: (v: T) => Partial<MarketState>) => {
    setM((s) => ({ ...s, loading: { ...s.loading, [name]: true } }));
    try { const value = await job(); setM((s) => ({ ...s, ...apply(value), errors: { ...s.errors, [name]: undefined } })); }
    catch (error) { setM((s) => ({ ...s, errors: { ...s.errors, [name]: errorMessage(error) } })); }
    finally { setM((s) => ({ ...s, loading: { ...s.loading, [name]: false } })); }
  }, []);

  const loadCoins = useCallback((sort: CoinGeckoSort = sortRef.current, force = false) => {
    sortRef.current = sort; patch({ sort });
    return section('coins', () => coinGeckoListings(sort, 50, force), (coins) => ({ coins }));
  }, [section]);

  const loadMarket = useCallback(async (force = false) => {
    if (force) clearCoinGeckoCache();
    await Promise.all([
      section('global', () => coinGeckoGlobal(force), (global) => ({ global })),
      loadCoins(sortRef.current, force),
      section('trending', () => coinGeckoTrending(force), (trending) => ({ trending })),
    ]);
    patch({ loadedAt: Date.now() });
  }, [section, loadCoins]);

  const openCoin = useCallback(async (id: string, seed?: CoinGeckoCoin) => {
    patch({ detail: seed ? { coin: seed, info: {} } : null, detailError: undefined, detailLoading: true });
    try { const detail = await coinGeckoCoinDetail(id); patch({ detail, detailLoading: false }); }
    catch (error) { patch({ detailError: errorMessage(error), detailLoading: false }); }
  }, []);
  const closeCoin = useCallback(() => patch({ detail: null, detailError: undefined, detailLoading: false }), []);
  return { market: m, loadMarket, loadCoins, openCoin, closeCoin };
}
