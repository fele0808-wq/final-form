import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Dimensions, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { AccentColors } from '@/constants/theme';

const screenWidth = Dimensions.get('window').width;
const sheetHeight = Dimensions.get('window').height * 0.84;
const cubeSize = 76;

type SwipeSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
};

export function SwipeSheet({ visible, onClose, children }: SwipeSheetProps) {
  const scale = useSharedValue(1);
  const burstProgress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = 1;
      burstProgress.value = 0;
    }
  }, [burstProgress, scale, visible]);

  const popAndClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    scale.value = withSequence(
      withTiming(0.35, { duration: 120 }),
      withTiming(0, { duration: 140 }),
    );
    burstProgress.value = withDelay(90, withTiming(1, { duration: 300 }, (finished) => {
      if (finished) runOnJS(onClose)();
    }));
  };

  const gesture = Gesture.Pan()
    .activeOffsetY(12)
    .failOffsetX([-24, 24])
    .onUpdate((event) => {
      const dragDistance = Math.max(0, event.translationY);
      scale.value = Math.max(0.35, 1 - dragDistance / 450);
    })
    .onEnd((event) => {
      const shouldClose = event.translationY > 120 || event.velocityY > 900;
      if (shouldClose) {
        runOnJS(popAndClose)();
      } else {
        scale.value = withSpring(1, {
          damping: 22,
          stiffness: 150,
          overshootClamping: true,
        });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    width: interpolate(burstProgress.value, [0, 0.35, 0.65, 1], [screenWidth, screenWidth, cubeSize, 0]),
    height: interpolate(burstProgress.value, [0, 0.35, 0.65, 1], [sheetHeight, sheetHeight, cubeSize, 0]),
    borderRadius: interpolate(burstProgress.value, [0, 0.35, 0.65, 1], [28, 28, 8, cubeSize / 2]),
    transform: [{ scale: scale.value }],
  }));

  const colorWashStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burstProgress.value, [0.2, 0.45, 0.75, 1], [0, 0.4, 1, 1]),
    borderRadius: interpolate(burstProgress.value, [0.35, 0.65, 1], [28, 8, cubeSize / 2]),
  }));

  const burstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(burstProgress.value, [0, 0.25, 1], [0, 1, 0]),
    transform: [
      { scale: interpolate(burstProgress.value, [0, 0.25, 1], [0.35, 1, 2.4]) },
      { rotate: `${interpolate(burstProgress.value, [0, 1], [0, 35])}deg` },
    ],
  }));

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close popup"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <GestureDetector gesture={gesture}>
          <Animated.View style={[styles.sheet, sheetStyle]}>
            <View style={styles.handle} />
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.scrollContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
            <Animated.View pointerEvents="none" style={[styles.colorWash, colorWashStyle]} />
          </Animated.View>
        </GestureDetector>
        <Animated.View pointerEvents="none" style={[styles.burstVisual, burstStyle]}>
          <View style={[styles.paintParticle, styles.particleTop]} />
          <View style={[styles.paintParticle, styles.particleRight]} />
          <View style={[styles.paintParticle, styles.particleBottom]} />
          <View style={[styles.paintParticle, styles.particleLeft]} />
          <View style={[styles.paintParticleSmall, styles.particleTopRight]} />
          <View style={[styles.paintParticleSmall, styles.particleBottomLeft]} />
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  sheet: {
    backgroundColor: '#17181B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 32,
    height: '84%',
    width: '100%',
    alignSelf: 'center',
    overflow: 'hidden',
    gap: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: AccentColors.green,
    opacity: 0.8,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  colorWash: {
    ...StyleSheet.absoluteFill,
    backgroundColor: AccentColors.purple,
  },
  burstVisual: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paintParticle: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 6,
    backgroundColor: AccentColors.purple,
  },
  paintParticleSmall: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: AccentColors.purple,
  },
  particleTop: { transform: [{ translateY: -118 }] },
  particleRight: { transform: [{ translateX: 118 }] },
  particleBottom: { transform: [{ translateY: 118 }] },
  particleLeft: { transform: [{ translateX: -118 }] },
  particleTopRight: { transform: [{ translateX: 92 }, { translateY: -92 }] },
  particleBottomLeft: { transform: [{ translateX: -92 }, { translateY: 92 }] },
});
