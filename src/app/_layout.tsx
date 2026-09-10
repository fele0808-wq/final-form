import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';

SplashScreen.preventAutoHideAsync();

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Manrope: require('@/assets/fonts/Manrope-Regular.ttf'),
    ManropeMedium: require('@/assets/fonts/Manrope-Medium.ttf'),
    ManropeSemiBold: require('@/assets/fonts/Manrope-SemiBold.ttf'),
    ManropeBold: require('@/assets/fonts/Manrope-Bold.ttf'),
    ManropeExtraBold: require('@/assets/fonts/Manrope-ExtraBold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AppTabs />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
