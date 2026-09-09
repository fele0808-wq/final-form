import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const recentForms = [
  { title: 'Customer feedback', detail: '8 responses · Edited today', color: '#D7F4E8' },
  { title: 'Event registration', detail: '24 responses · Edited yesterday', color: '#FBE3C5' },
  { title: 'Team pulse check', detail: '12 responses · Edited May 18', color: '#DCE8FB' },
];

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <ThemedText type="small" themeColor="textSecondary" style={styles.eyebrow}>
                TUESDAY, MAY 21
              </ThemedText>
              <ThemedText type="subtitle" style={styles.heading}>
                Good morning, Fele
              </ThemedText>
            </View>
            <View style={[styles.avatar, { backgroundColor: theme.text }]}>
              <ThemedText style={styles.avatarText} themeColor="background">
                F
              </ThemedText>
            </View>
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
                  <SymbolView name="doc.text" tintColor="#1C2B25" size={20} />
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 1,
    fontWeight: '700',
  },
  heading: {
    fontSize: 29,
    lineHeight: 36,
    marginTop: Spacing.one,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  createCard: {
    backgroundColor: '#B9EAD5',
    borderRadius: 18,
    padding: Spacing.four,
    minHeight: 174,
    justifyContent: 'space-between',
  },
  createCopy: {
    maxWidth: 280,
    gap: Spacing.one,
  },
  createLabel: {
    color: '#426659',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  createTitle: {
    color: '#1C2B25',
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '700',
  },
  createHint: {
    color: '#426659',
  },
  addButton: {
    backgroundColor: '#EAF9F1',
    width: 42,
    height: 42,
    borderRadius: 21,
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
    color: '#40836B',
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  stat: {
    flex: 1,
    minHeight: 88,
    borderRadius: 14,
    padding: Spacing.three,
    justifyContent: 'space-between',
  },
  statValue: {
    fontSize: 25,
    fontWeight: '700',
  },
  formsList: {
    gap: Spacing.two,
  },
  formRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  formMark: {
    width: 48,
    height: 48,
    borderRadius: 14,
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
