/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const AccentColors = {
  purple: '#D14DFF',
  green: '#B8FF3D',
  charcoalText: '#202124',
} as const;

export const Colors = {
  light: {
    text: AccentColors.purple,
    background: '#17181B',
    backgroundElement: '#25272C',
    backgroundSelected: '#B8FF3D',
    textSecondary: '#A7A9B2',
  },
  dark: {
    text: AccentColors.purple,
    background: '#17181B',
    backgroundElement: '#25272C',
    backgroundSelected: '#B8FF3D',
    textSecondary: '#A7A9B2',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const FontFaces = {
  regular: 'Manrope',
  medium: 'ManropeMedium',
  semibold: 'ManropeSemiBold',
  bold: 'ManropeBold',
  extrabold: 'ManropeExtraBold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'Manrope',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'Manrope',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'Manrope',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'Manrope',
  },
  default: {
    sans: 'Manrope',
    serif: 'Manrope',
    rounded: 'Manrope',
    mono: 'Manrope',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-display)',
    rounded: 'var(--font-display)',
    mono: 'var(--font-display)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
