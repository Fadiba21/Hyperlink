import { createContext, useContext } from 'react';

export type Theme = {
  dark: boolean;
  bg: string; surface: string; surfaceLow: string; surfaceContainer: string; surfaceHigh: string;
  onSurface: string; onSurfaceVariant: string; outline: string; outlineVariant: string;
  primary: string; onPrimary: string; primaryContainer: string; onPrimaryContainer: string;
  secondaryContainer: string; onSecondaryContainer: string;
  success: string; onSuccess: string; successContainer: string; onSuccessContainer: string;
  warning: string; warningContainer: string; onWarningContainer: string;
  error: string; onError: string; errorContainer: string; onErrorContainer: string;
  scrim: string; ripple: string;
};
export type ThemeStyle = 'monochrome' | 'materialYou' | 'midnightExchange' | 'emeraldWallet' | 'aurora' | 'copperStudio';

export const darkTheme: Theme = {
  dark: true,
  bg: '#0A0A0A', surface: '#0A0A0A', surfaceLow: '#121212', surfaceContainer: '#171717', surfaceHigh: '#232323',
  onSurface: '#FAFAFA', onSurfaceVariant: '#B5B5B5', outline: '#707070', outlineVariant: '#2E2E2E',
  primary: '#F3F3F3', onPrimary: '#111111', primaryContainer: '#2B2B2B', onPrimaryContainer: '#F3F3F3',
  secondaryContainer: '#303030', onSecondaryContainer: '#F3F3F3',
  success: '#6FD39A', onSuccess: '#003919', successContainer: '#12301F', onSuccessContainer: '#A8EBC4',
  warning: '#E8C26A', warningContainer: '#3A2F10', onWarningContainer: '#FFDF9B',
  error: '#FF8A80', onError: '#4A0003', errorContainer: '#3D1714', onErrorContainer: '#FFD6D2',
  scrim: '#000000', ripple: 'rgba(250,250,250,0.14)',
};

export const lightTheme: Theme = {
  dark: false,
  bg: '#F7F7F7', surface: '#F7F7F7', surfaceLow: '#F0F0F0', surfaceContainer: '#EAEAEA', surfaceHigh: '#E1E1E1',
  onSurface: '#121212', onSurfaceVariant: '#4A4A4A', outline: '#7A7A7A', outlineVariant: '#CFCFCF',
  primary: '#111111', onPrimary: '#FFFFFF', primaryContainer: '#D9D9D9', onPrimaryContainer: '#111111',
  secondaryContainer: '#DEDEDE', onSecondaryContainer: '#111111',
  success: '#1B6D3A', onSuccess: '#FFFFFF', successContainer: '#CDEFD8', onSuccessContainer: '#00210E',
  warning: '#7A5900', warningContainer: '#FFE7A8', onWarningContainer: '#261A00',
  error: '#BA1A1A', onError: '#FFFFFF', errorContainer: '#FFDAD6', onErrorContainer: '#410002',
  scrim: '#000000', ripple: 'rgba(18,18,18,0.12)',
};

const darkMaterialYou: Theme = {
  dark: true,
  bg: '#111318', surface: '#111318', surfaceLow: '#191B20', surfaceContainer: '#1D2026', surfaceHigh: '#292C32',
  onSurface: '#E3E2E9', onSurfaceVariant: '#C4C5D0', outline: '#8E909A', outlineVariant: '#44464F',
  primary: '#D0BCFF', onPrimary: '#381E72', primaryContainer: '#4F378B', onPrimaryContainer: '#EADDFF',
  secondaryContainer: '#4A4458', onSecondaryContainer: '#E8DEF8',
  success: '#82D5A2', onSuccess: '#00391A', successContainer: '#14532E', onSuccessContainer: '#A7F2BD',
  warning: '#F2C66D', warningContainer: '#51400C', onWarningContainer: '#FFE08D',
  error: '#FFB4AB', onError: '#690005', errorContainer: '#93000A', onErrorContainer: '#FFDAD6',
  scrim: '#000000', ripple: 'rgba(234,221,255,0.14)',
};
const lightMaterialYou: Theme = {
  dark: false,
  bg: '#F9F7FF', surface: '#F9F7FF', surfaceLow: '#F3F0FA', surfaceContainer: '#EFEDF5', surfaceHigh: '#E8E5EF',
  onSurface: '#1B1B21', onSurfaceVariant: '#49464F', outline: '#7A7782', outlineVariant: '#CAC5D2',
  primary: '#6750A4', onPrimary: '#FFFFFF', primaryContainer: '#EADDFF', onPrimaryContainer: '#21005D',
  secondaryContainer: '#E8DEF8', onSecondaryContainer: '#1D192B',
  success: '#28623B', onSuccess: '#FFFFFF', successContainer: '#B8F0C4', onSuccessContainer: '#00210A',
  warning: '#715B12', warningContainer: '#F8E4A7', onWarningContainer: '#241A00',
  error: '#BA1A1A', onError: '#FFFFFF', errorContainer: '#FFDAD6', onErrorContainer: '#410002',
  scrim: '#000000', ripple: 'rgba(33,0,93,0.12)',
};

// Wallet/exchange-inspired hues use compact high-contrast surfaces and a single calm accent.
const darkMidnightExchange: Theme = {
  dark: true,
  bg: '#0B1020', surface: '#0B1020', surfaceLow: '#10182A', surfaceContainer: '#152036', surfaceHigh: '#202D45',
  onSurface: '#F1F5FC', onSurfaceVariant: '#B6C2D4', outline: '#7D8AA0', outlineVariant: '#35435A',
  primary: '#62D6E8', onPrimary: '#05232A', primaryContainer: '#173C4A', onPrimaryContainer: '#C8F7FC',
  secondaryContainer: '#23374C', onSecondaryContainer: '#DDEAF4',
  success: '#5BD49A', onSuccess: '#00371C', successContainer: '#123D2B', onSuccessContainer: '#B4F2D0',
  warning: '#F1C56B', warningContainer: '#453615', onWarningContainer: '#FCE3A6',
  error: '#FF8F84', onError: '#4B0003', errorContainer: '#401B21', onErrorContainer: '#FFD8D3',
  scrim: '#000000', ripple: 'rgba(200,247,252,0.13)',
};
const lightMidnightExchange: Theme = {
  dark: false,
  bg: '#F3F7FA', surface: '#F3F7FA', surfaceLow: '#EAF0F5', surfaceContainer: '#E3EBF2', surfaceHigh: '#D8E3ED',
  onSurface: '#132437', onSurfaceVariant: '#44596D', outline: '#62778B', outlineVariant: '#C5D2DE',
  primary: '#006B79', onPrimary: '#FFFFFF', primaryContainer: '#BCECF1', onPrimaryContainer: '#002F36',
  secondaryContainer: '#D8E7EF', onSecondaryContainer: '#112A3A',
  success: '#136B40', onSuccess: '#FFFFFF', successContainer: '#C5F0D4', onSuccessContainer: '#00210F',
  warning: '#745400', warningContainer: '#F9E3A6', onWarningContainer: '#241A00',
  error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B',
  scrim: '#000000', ripple: 'rgba(0,47,54,0.12)',
};
const darkEmeraldWallet: Theme = {
  dark: true,
  bg: '#071512', surface: '#071512', surfaceLow: '#0D1D19', surfaceContainer: '#122821', surfaceHigh: '#1C372E',
  onSurface: '#EAF7F1', onSurfaceVariant: '#B1C9BE', outline: '#829B90', outlineVariant: '#2E4A3E',
  primary: '#62D6A8', onPrimary: '#003824', primaryContainer: '#174C38', onPrimaryContainer: '#B7F4D8',
  secondaryContainer: '#244638', onSecondaryContainer: '#D2EDE0',
  success: '#75DDA2', onSuccess: '#00391A', successContainer: '#17452D', onSuccessContainer: '#B5F3C8',
  warning: '#EEC96F', warningContainer: '#493B17', onWarningContainer: '#F8E4AC',
  error: '#FF8D83', onError: '#4B0003', errorContainer: '#48201B', onErrorContainer: '#FFDAD4',
  scrim: '#000000', ripple: 'rgba(183,244,216,0.13)',
};
const lightEmeraldWallet: Theme = {
  dark: false,
  bg: '#F3F8F4', surface: '#F3F8F4', surfaceLow: '#EBF2EC', surfaceContainer: '#E2ECE4', surfaceHigh: '#D6E4D9',
  onSurface: '#13251C', onSurfaceVariant: '#40584A', outline: '#657D6D', outlineVariant: '#C4D4C8',
  primary: '#087351', onPrimary: '#FFFFFF', primaryContainer: '#BCEBD2', onPrimaryContainer: '#002114',
  secondaryContainer: '#D6EBDD', onSecondaryContainer: '#132B1E',
  success: '#136B40', onSuccess: '#FFFFFF', successContainer: '#C5F0D4', onSuccessContainer: '#00210F',
  warning: '#735500', warningContainer: '#F8E5AA', onWarningContainer: '#251B00',
  error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B',
  scrim: '#000000', ripple: 'rgba(0,33,20,0.12)',
};

const darkAurora: Theme = {
  dark: true,
  bg: '#0A1018', surface: '#0A1018', surfaceLow: '#101923', surfaceContainer: '#15212C', surfaceHigh: '#1E2D39',
  onSurface: '#ECF5F7', onSurfaceVariant: '#B0C4C9', outline: '#789198', outlineVariant: '#30454D',
  primary: '#76E0D2', onPrimary: '#003731', primaryContainer: '#174A48', onPrimaryContainer: '#B4F4E9',
  secondaryContainer: '#293E50', onSecondaryContainer: '#D7EAF4',
  success: '#79D9A1', onSuccess: '#00391A', successContainer: '#16442D', onSuccessContainer: '#B5F2C8',
  warning: '#F0C66F', warningContainer: '#493A17', onWarningContainer: '#F9E4AB',
  error: '#FF9387', onError: '#4B0003', errorContainer: '#48201B', onErrorContainer: '#FFDAD4',
  scrim: '#000000', ripple: 'rgba(180,244,233,0.14)',
};
const lightAurora: Theme = {
  dark: false,
  bg: '#F2F8F8', surface: '#F2F8F8', surfaceLow: '#EAF3F3', surfaceContainer: '#E2EEEE', surfaceHigh: '#D8E7E8',
  onSurface: '#142629', onSurfaceVariant: '#425A5E', outline: '#647C80', outlineVariant: '#C5D5D7',
  primary: '#087D73', onPrimary: '#FFFFFF', primaryContainer: '#BFECE5', onPrimaryContainer: '#002F2B',
  secondaryContainer: '#D9E8EF', onSecondaryContainer: '#17313D',
  success: '#176B40', onSuccess: '#FFFFFF', successContainer: '#C8EFD5', onSuccessContainer: '#00210F',
  warning: '#755700', warningContainer: '#F8E5AA', onWarningContainer: '#251B00',
  error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B',
  scrim: '#000000', ripple: 'rgba(0,47,43,0.12)',
};

const darkCopperStudio: Theme = {
  dark: true,
  bg: '#100F0D', surface: '#100F0D', surfaceLow: '#181612', surfaceContainer: '#1F1C17', surfaceHigh: '#29241D',
  onSurface: '#F5EEE3', onSurfaceVariant: '#C4B8A6', outline: '#8A7A62', outlineVariant: '#463B2D',
  primary: '#F0B36B', onPrimary: '#2B1807', primaryContainer: '#5B391B', onPrimaryContainer: '#FFE0B0',
  secondaryContainer: '#453729', onSecondaryContainer: '#F4E5D1',
  success: '#7FD29B', onSuccess: '#003919', successContainer: '#153D25', onSuccessContainer: '#B7F0C8',
  warning: '#F2C66D', warningContainer: '#493A17', onWarningContainer: '#F9E4AB',
  error: '#FF9387', onError: '#4B0003', errorContainer: '#48201B', onErrorContainer: '#FFDAD4',
  scrim: '#000000', ripple: 'rgba(255,224,176,0.13)',
};
const lightCopperStudio: Theme = {
  dark: false,
  bg: '#FBF7F1', surface: '#FBF7F1', surfaceLow: '#F4EFE7', surfaceContainer: '#EEE7DB', surfaceHigh: '#E6DDCF',
  onSurface: '#29231D', onSurfaceVariant: '#5D5145', outline: '#7F6F5D', outlineVariant: '#D6C9B7',
  primary: '#8E541E', onPrimary: '#FFFFFF', primaryContainer: '#F7D7AA', onPrimaryContainer: '#3B2208',
  secondaryContainer: '#E8DDCC', onSecondaryContainer: '#29231D',
  success: '#176B40', onSuccess: '#FFFFFF', successContainer: '#C8EFD5', onSuccessContainer: '#00210F',
  warning: '#755700', warningContainer: '#F8E5AA', onWarningContainer: '#251B00',
  error: '#B3261E', onError: '#FFFFFF', errorContainer: '#F9DEDC', onErrorContainer: '#410E0B',
  scrim: '#000000', ripple: 'rgba(59,34,8,0.12)',
};

export function getTheme(dark: boolean, style: ThemeStyle): Theme {
  if (style === 'materialYou') return dark ? darkMaterialYou : lightMaterialYou;
  if (style === 'midnightExchange') return dark ? darkMidnightExchange : lightMidnightExchange;
  if (style === 'emeraldWallet') return dark ? darkEmeraldWallet : lightEmeraldWallet;
  if (style === 'aurora') return dark ? darkAurora : lightAurora;
  if (style === 'copperStudio') return dark ? darkCopperStudio : lightCopperStudio;
  return dark ? darkTheme : lightTheme;
}

export const ThemeContext = createContext<Theme>(darkTheme);
export const useTheme = () => useContext(ThemeContext);

export const type = {
  headline: { fontSize: 28, lineHeight: 36, fontWeight: '400' as const },
  titleLarge: { fontSize: 22, lineHeight: 28, fontWeight: '500' as const },
  titleMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500' as const, letterSpacing: 0.15 },
  titleSmall: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const, letterSpacing: 0.25 },
  bodySmall: { fontSize: 12, lineHeight: 16, fontWeight: '400' as const, letterSpacing: 0.4 },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '500' as const, letterSpacing: 0.1 },
  labelSmall: { fontSize: 11, lineHeight: 16, fontWeight: '500' as const, letterSpacing: 0.5 },
};
