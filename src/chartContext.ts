import { createContext, useContext } from 'react';
import type { ChartPosition } from './pairs';
import type { SignalRecord } from './signal';

export type ChartContextValue = {
  favorites: string[];
  toggleFavorite: (symbol: string) => void;
  latestCall: SignalRecord | null;
  callSymbols: string[];
  positions: ChartPosition[];
  hideBalances: boolean;
  toggleHide: () => void;
  addAlert: (symbol: string, price: number) => Promise<boolean>;
};
export const ChartContext = createContext<ChartContextValue>({ favorites: [], toggleFavorite: () => undefined, latestCall: null, callSymbols: [], positions: [], hideBalances: false, toggleHide: () => undefined, addAlert: async () => false });
export const useChartContext = () => useContext(ChartContext);
