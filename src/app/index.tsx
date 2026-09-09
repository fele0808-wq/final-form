import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColors, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { formatAppDate } from '@/constants/date-time';
import { useTheme } from '@/hooks/use-theme';

const recentForms = [
  { title: 'Customer feedback', detail: '8 responses · Edited today', color: AccentColors.green },
  { title: 'Event registration', detail: '24 responses · Edited yesterday', color: AccentColors.purple },
  { title: 'Team pulse check', detail: '12 responses · Edited May 18', color: AccentColors.green },
];

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                {formatAppDate().toUpperCase()}
              </ThemedText>
              <ThemedText type="subtitle" style={styles.heading}>
                Good morning, Fele
              </ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Open profile"
              accessibilityRole="button"
              style={({ pressed }) => [styles.avatar, { backgroundColor: theme.text }, pressed && styles.pressed]}>
              <ThemedText style={styles.avatarText} themeColor="background">
                F
              </ThemedText>
            </Pressable>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/explore')}
            style={({ pressed }) => [styles.createCard, pressed && styles.pressed]}>
            <View style={styles.createCopy}>
              <ThemedText type="small" style={styles.createLabel}>
                START FROM SCRATCH
              </ThemedText>
              <ThemedText style={styles.createTitle}>Build a form people want to fill out.</ThemedText>
              <ThemedText type="small" style={styles.createHint}>
                Choose a template or make your own
              </ThemedText>
            </View>
            <View style={styles.addButton}>
              <SymbolView name="plus" tintColor="#1C2B25" size={22} />
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Your workspace</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              This month
            </ThemedText>
          </View>
          <View style={styles.statsRow}>
            <Stat value="12" label="Forms" />
            <Stat value="248" label="Responses" />
            <Stat value="84%" label="Completion" />
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>Recent forms</ThemedText>
            <Pressable onPress={() => router.push('/explore')}>
              <ThemedText type="small" style={styles.viewAll}>View all</ThemedText>
            </Pressable>
          </View>
          <View style={styles.formsList}>
            {recentForms.map((form) => (
              <Pressable key={form.title} style={({ pressed }) => [styles.formRow, pressed && styles.pressed]}>
                <View style={[styles.formMark, { backgroundColor: form.color }]}>
                  <SymbolView name="doc.text" tintColor={AccentColors.charcoalText} size={20} />
                </View>
                <View style={styles.formCopy}>
                  <ThemedText style={styles.formTitle}>{form.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{form.detail}</ThemedText>
                </View>
                <SymbolView name="chevron.right" tintColor={theme.textSecondary} size={16} />
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.stat}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingBottom: BottomTabInset + Spacing.three,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.five,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
    paddingRight: Spacing.three,
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
  },
  heading: {
    fontSize: 31,
    lineHeight: 38,
    marginTop: Spacing.two,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    flexShrink: 0,
    marginRight: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  createCard: {
    backgroundColor: AccentColors.purple,
    borderRadius: 24,
    padding: Spacing.five,
    minHeight: 196,
    justifyContent: 'space-between',
  },
  createCopy: {
    maxWidth: 280,
    gap: Spacing.two,
  },
  createLabel: {
    color: AccentColors.charcoalText,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  createTitle: {
    color: AccentColors.charcoalText,
    fontSize: 27,
    lineHeight: 33,
    fontWeight: '800',
  },
  createHint: {
    color: AccentColors.charcoalText,
  },
  addButton: {
    backgroundColor: AccentColors.green,
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  viewAll: {
    color: AccentColors.green,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  stat: {
    flex: 1,
    minHeight: 104,
    borderRadius: 18,
    padding: Spacing.four,
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: 25,
    fontWeight: '700',
  },
  formsList: {
    gap: Spacing.three,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: 16,
    backgroundColor: '#25272C',
  },
  formMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.68,
  },
});
