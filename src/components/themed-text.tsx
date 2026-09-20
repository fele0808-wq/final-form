import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { FontFaces, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'], fontFamily: Fonts.sans },
        type === 'default' && styles.default,
        type === 'title' && styles.title,
        type === 'small' && styles.small,
        type === 'smallBold' && styles.smallBold,
        type === 'subtitle' && styles.subtitle,
        type === 'link' && styles.link,
        type === 'linkPrimary' && styles.linkPrimary,
        type === 'code' && styles.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontFamily: FontFaces.semibold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  smallBold: {
    fontFamily: FontFaces.bold,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 800,
  },
  default: {
    fontFamily: FontFaces.semibold,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 600,
  },
  title: {
    fontFamily: FontFaces.extrabold,
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 52,
  },
  subtitle: {
    fontFamily: FontFaces.extrabold,
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 800,
  },
  link: {
    fontFamily: FontFaces.bold,
    lineHeight: 30,
    fontSize: 14,
    fontWeight: 700,
  },
  linkPrimary: {
    fontFamily: FontFaces.bold,
    lineHeight: 30,
    fontSize: 14,
    fontWeight: 700,
    color: '#D14DFF',
  },
  code: {
    fontFamily: FontFaces.bold,
    fontWeight: Platform.select({ android: 700 }) ?? 700,
    fontSize: 12,
  },
});
