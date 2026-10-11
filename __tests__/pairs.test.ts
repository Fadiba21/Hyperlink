import { chartLevels, filterPairs, mergePairs, sma, visibleLevels, type PairQuery } from '../src/pairs';

const q = (o: Partial<PairQuery>): PairQuery => ({ category: 'all', query: '', sort: 'volume', favorites: [], calls: [], positions: [], members: {}, ...o });
const tickers = [
  { symbol: 'BTCUSDT', last: 60000, change24h: 0.02, volume24h: 9e9 },
  { symbol: 'PEPEUSDT', last: 0.00001, change24h: -0.05, volume24h: 1e8 },
  { symbol: 'ETHUSDT', last: 3000, change24h: 0.01, volume24h: 4e9 },
];
const coins = [{ id: 'bitcoin', name: 'Bitcoin', symbol: 'BTC', slug: 'bitcoin', rank: 1, price: 1, ch1h: 0, ch24h: 1, ch7d: 0, marketCap: 1, volume24h: 1, image: 'u' }];

describe('pairs', () => {
  it('merges exchange tickers with CoinGecko icons and filters by category', () => {
    const rows = mergePairs('exchange', tickers, coins);
    expect(rows.find((r) => r.base === 'BTC')?.image).toBe('u');
    expect(filterPairs(rows, q({})).map((r) => r.base)).toEqual(['BTC', 'ETH', 'PEPE']);
    expect(filterPairs(rows, q({ category: 'losers' })).map((r) => r.base)).toEqual(['PEPE']);
    expect(filterPairs(rows, q({ category: 'meme', members: { meme: ['PEPE'] } })).map((r) => r.base)).toEqual(['PEPE']);
    expect(filterPairs(rows, q({ category: 'fav', favorites: ['ethusdt'] })).map((r) => r.base)).toEqual(['ETH']);
    expect(filterPairs(rows, q({ category: 'meme', query: 'btc' })).map((r) => r.base)).toEqual(['BTC']);
  });
  it('builds trade levels for the latest call and positions', () => {
    const call = { symbol: 'BTCUSDT', direction: 'LONG' as const, entry: 100, stopLoss: 90, takeProfit: 110, takeProfits: [110, 120] };
    expect(chartLevels('BTCUSDT', call, [{ symbol: 'BTCUSDT', side: 'LONG', entry: 101, stopLoss: 95, takeProfits: [] }])).toHaveLength(6);
    expect(chartLevels('ETHUSDT', call)).toHaveLength(0);
    expect(visibleLevels([{ kind: 'tp', label: 'a', price: 105 }, { kind: 'tp', label: 'b', price: 500 }], 100, 110).inside).toHaveLength(1);
    expect(sma([1, 2, 3, 4], 2)[3]).toBe(3.5);
  });
});
