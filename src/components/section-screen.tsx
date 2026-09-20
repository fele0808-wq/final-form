import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColors, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

type SectionScreenProps = {
  name: string;
  description: string;
};

export default function SectionScreen({ name, description }: SectionScreenProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="small" style={styles.eyebrow}>
            FINAL FORM
          </ThemedText>
          <ThemedText type="title" style={styles.brand}>
            final form
          </ThemedText>
          <View style={styles.rule} />
          <ThemedText type="subtitle" style={styles.sectionName}>
            {name}
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.description}>
            {description}
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.emptyState}>
            <ThemedText style={styles.emptyTitle}>Your {name.toLowerCase()} space</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.emptyCopy}>
              This section is ready for your {name.toLowerCase()} workflow.
            </ThemedText>
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  content: {
    padding: Spacing.five,
    paddingTop: Spacing.six,
    gap: Spacing.four,
  },
  eyebrow: {
    color: AccentColors.green,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  brand: {
    fontSize: 44,
    lineHeight: 50,
    fontWeight: '800',
  },
  rule: {
    height: 1,
    backgroundColor: AccentColors.purple,
    marginVertical: Spacing.two,
  },
  sectionName: {
    fontSize: 30,
  },
  description: {
    fontSize: 17,
    lineHeight: 25,
    maxWidth: 380,
  },
  emptyState: {
    marginTop: Spacing.five,
    borderRadius: 22,
    padding: Spacing.five,
    minHeight: 190,
    justifyContent: 'flex-end',
    gap: Spacing.one,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  emptyCopy: {
    maxWidth: 300,
  },
});