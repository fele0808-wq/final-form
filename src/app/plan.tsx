import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import * as Speech from 'expo-speech';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { AccentColors, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getAppDateParts, APP_TIME_ZONE, formatAppDate } from '@/constants/date-time';

const schedule = [
  { label: 'Next commitment', value: 'Design review', detail: '2:00 PM · 45 min', icon: 'calendar' },
  { label: 'Next workout', value: 'Upper body strength', detail: '4:00 PM · 50 min', icon: 'figure.strengthtraining.traditional' },
  { label: 'Next routine / reminder', value: 'Prep tomorrow', detail: '8:30 PM · 15 min', icon: 'checkmark.circle' },
];

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const eventTemplates = [
  { title: 'Deep work block', time: '9:00 AM · 90 min', kind: 'Focus time' },
  { title: 'Team check-in', time: '11:30 AM · 30 min', kind: 'Commitment' },
  { title: 'Strength session', time: '4:00 PM · 50 min', kind: 'Workout' },
  { title: 'Read and reset', time: '8:30 PM · 20 min', kind: 'Routine' },
];
function buildExampleEvents(daysInMonth: number) {
  return Array.from({ length: daysInMonth }, (_, index) => index + 1).reduce<Record<number, typeof eventTemplates>>((events, day) => {
  events[day] = [eventTemplates[(day - 1) % eventTemplates.length]];
  return events;
  }, {});
}

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const initialAppDate = getAppDateParts();

export default function PlanScreen() {
  const [prompt, setPrompt] = useState('');
  const [submittedPrompt, setSubmittedPrompt] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [displayMonth, setDisplayMonth] = useState(initialAppDate.month - 1);
  const [displayYear, setDisplayYear] = useState(initialAppDate.year);
  const [selectedDay, setSelectedDay] = useState(initialAppDate.day);

  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOffset = (new Date(displayYear, displayMonth, 1).getDay() + 6) % 7;
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const exampleEvents = buildExampleEvents(daysInMonth);

  const changeMonth = (direction: number) => {
    const nextDate = new Date(displayYear, displayMonth + direction, 1);
    const nextDaysInMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    setDisplayMonth(nextDate.getMonth());
    setDisplayYear(nextDate.getFullYear());
    setSelectedDay(Math.min(selectedDay, nextDaysInMonth));
  };

  const submitPrompt = () => {
    const nextPrompt = prompt.trim();
    if (!nextPrompt) return;
    setSubmittedPrompt(nextPrompt);
    setPrompt('');
  };

  const toggleSpeech = () => {
    const speechText = prompt.trim() || submittedPrompt;
    if (!speechText) return;

    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }

    setIsSpeaking(true);
    Speech.speak(speechText, {
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>{formatAppDate().toUpperCase()}</ThemedText>
              <ThemedText type="subtitle" style={styles.title}>Today</ThemedText>
            </View>
            <View style={styles.dayMark}>
              <ThemedText style={styles.dayNumber}>{initialAppDate.day}</ThemedText>
            </View>
          </View>

          <View style={styles.conversationBlock}>
            <View style={styles.conversationCard}>
              <ThemedText style={styles.planningTitle}>Planning session</ThemedText>
              <ThemedText style={styles.conversationTitle}>What do you want to make room for?</ThemedText>
              <View style={styles.inputCard}>
                <TextInput
                  accessibilityLabel="Tell final form what you want to plan"
                  multiline
                  onChangeText={setPrompt}
                  onSubmitEditing={submitPrompt}
                  placeholder="I want to..."
                  placeholderTextColor="#A7A9B2"
                  returnKeyType="send"
                  style={styles.input}
                  value={prompt}
                />
                <View style={styles.inputActions}>
                  <Pressable
                    accessibilityLabel={isSpeaking ? 'Stop reading planning request' : 'Read planning request aloud'}
                    accessibilityRole="button"
                    disabled={!prompt.trim() && !submittedPrompt}
                    onPress={toggleSpeech}
                    style={({ pressed }) => [styles.speechButton, !prompt.trim() && !submittedPrompt && styles.sendButtonDisabled, pressed && styles.pressed]}>
                    <SymbolView
                      name={{ ios: isSpeaking ? 'stop.fill' : 'speaker.wave.2.fill', android: isSpeaking ? 'stop' : 'volume_up', web: isSpeaking ? 'stop' : 'volume_up' }}
                      tintColor={AccentColors.purple}
                      size={17}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="Send planning request"
                    accessibilityRole="button"
                    disabled={!prompt.trim()}
                    onPress={submitPrompt}
                    style={({ pressed }) => [styles.sendButton, !prompt.trim() && styles.sendButtonDisabled, pressed && styles.pressed]}>
                    <SymbolView name="arrow.up" tintColor={AccentColors.charcoalText} size={18} />
                  </Pressable>
                </View>
              </View>
              <ThemedText type="small" style={styles.planningHint}>Shape the rest of your day</ThemedText>
            </View>
            {submittedPrompt ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.responseText}>
                Planning around: {submittedPrompt}
              </ThemedText>
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Open available time calendar"
            accessibilityRole="button"
            onPress={() => setCalendarVisible(true)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView style={styles.freeCard}>
            <View style={styles.freeCardTop}>
              <ThemedText type="small" style={styles.freeLabel}>AVAILABLE TODAY</ThemedText>
              <SymbolView name="sparkles" tintColor={AccentColors.charcoalText} size={20} />
            </View>
            <ThemedText style={styles.freeTime}>3h 42m free</ThemedText>
            <ThemedText type="small" style={styles.freeHint}>
              Enough room to make progress without rushing. Tap to open calendar.
            </ThemedText>
            </ThemedView>
          </Pressable>

          <View style={styles.sectionHeader}>
            <ThemedText style={styles.sectionTitle}>What&apos;s ahead</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">Today</ThemedText>
          </View>

          <View style={styles.scheduleList}>
            {schedule.map((item) => (
              <View key={item.label} style={styles.scheduleRow}>
                <View style={styles.scheduleIcon}>
                  <SymbolView
                    name={{
                      ios: item.icon as SFSymbol,
                      android: item.icon as AndroidSymbol,
                      web: item.icon as AndroidSymbol,
                    }}
                    tintColor={AccentColors.green}
                    size={19}
                  />
                </View>
                <View style={styles.scheduleCopy}>
                  <ThemedText type="small" themeColor="textSecondary">{item.label}</ThemedText>
                  <ThemedText style={styles.scheduleValue}>{item.value}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{item.detail}</ThemedText>
                </View>
                <SymbolView name="chevron.right" tintColor="#A7A9B2" size={16} />
              </View>
            ))}
          </View>

        </ScrollView>
      </SafeAreaView>

      <Modal
        animationType="slide"
        onRequestClose={() => setCalendarVisible(false)}
        transparent
        visible={calendarVisible}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <View>
                <ThemedText type="small" style={styles.eyebrow}>YOUR TIME</ThemedText>
                <ThemedText style={styles.calendarTitle}>{monthNames[displayMonth]} {displayYear}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{daysInMonth} days · example schedule</ThemedText>
              </View>
              <Pressable
                accessibilityLabel="Close calendar"
                accessibilityRole="button"
                onPress={() => setCalendarVisible(false)}
                style={styles.closeButton}>
                <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
              </Pressable>
            </View>

            <View style={styles.calendarControls}>
              <Pressable accessibilityLabel="Previous month" accessibilityRole="button" onPress={() => changeMonth(-1)} style={styles.monthButton}>
                <SymbolView name="chevron.left" tintColor="#A7A9B2" size={16} />
              </Pressable>
              <ThemedText type="small" themeColor="textSecondary">{APP_TIME_ZONE} · select a day</ThemedText>
              <Pressable accessibilityLabel="Next month" accessibilityRole="button" onPress={() => changeMonth(1)} style={styles.monthButton}>
                <SymbolView name="chevron.right" tintColor="#A7A9B2" size={16} />
              </Pressable>
            </View>

            <View style={styles.weekRow}>
              {weekDays.map((day, index) => (
                <ThemedText key={`${day}-${index}`} type="small" themeColor="textSecondary" style={styles.weekDay}>
                  {day}
                </ThemedText>
              ))}
            </View>
            <View style={styles.calendarGrid}>
              {Array.from({ length: firstDayOffset }).map((_, index) => <View key={`empty-${index}`} style={styles.calendarDay} />)}
              {calendarDays.map((day) => (
                <Pressable
                  key={day}
                  accessibilityLabel={`Select ${monthNames[displayMonth]} ${day}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedDay(day)}
                  style={[styles.calendarDay, day === selectedDay && styles.selectedDay]}>
                  <ThemedText style={[styles.calendarDayText, day === selectedDay && styles.selectedDayText]}>
                    {day}
                  </ThemedText>
                  <View style={styles.availabilityDot} />
                </Pressable>
              ))}
            </View>

            <View style={styles.agendaHeader}>
              <ThemedText style={styles.agendaTitle}>{monthNames[displayMonth]} {selectedDay}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{exampleEvents[selectedDay].length} event</ThemedText>
            </View>
            {exampleEvents[selectedDay].map((event) => (
              <View key={`${selectedDay}-${event.title}`} style={styles.agendaCard}>
                <ThemedText type="small" themeColor="textSecondary">{event.time}</ThemedText>
                <ThemedText style={styles.agendaItem}>{event.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{event.kind}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </Modal>
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
  eyebrow: {
    color: AccentColors.green,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
    marginTop: Spacing.two,
  },
  dayMark: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: AccentColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    color: AccentColors.charcoalText,
    fontSize: 19,
    fontWeight: '800',
  },
  freeCard: {
    backgroundColor: AccentColors.purple,
    borderRadius: 24,
    padding: Spacing.five,
    minHeight: 210,
    justifyContent: 'space-between',
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
  },
  calendarSheet: {
    backgroundColor: '#17181B',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  calendarTitle: {
    fontSize: 30,
    lineHeight: 36,
    marginTop: Spacing.two,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#25272C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.two,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#25272C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekDay: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.two,
  },
  calendarDay: {
    width: '14.285%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  calendarDayText: {
    fontSize: 14,
    fontWeight: '700',
  },
  selectedDay: {
    backgroundColor: AccentColors.green,
    borderRadius: 14,
  },
  selectedDayText: {
    color: AccentColors.charcoalText,
  },
  availabilityDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: AccentColors.purple,
    position: 'absolute',
    bottom: 4,
  },
  agendaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginTop: Spacing.two,
  },
  agendaTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  agendaCard: {
    backgroundColor: '#25272C',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  agendaItem: {
    fontSize: 16,
    fontWeight: '800',
  },
  freeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  freeLabel: {
    color: AccentColors.charcoalText,
    fontSize: 11,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  freeTime: {
    color: AccentColors.charcoalText,
    fontSize: 48,
    lineHeight: 54,
    fontWeight: '800',
  },
  freeHint: {
    color: AccentColors.charcoalText,
    maxWidth: 280,
  },
  conversationBlock: {
    gap: Spacing.two,
  },
  conversationCard: {
    backgroundColor: AccentColors.green,
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  conversationTitle: {
    color: AccentColors.charcoalText,
    fontSize: 20,
    lineHeight: 27,
    fontWeight: '800',
  },
  inputCard: {
    minHeight: 112,
    borderRadius: 20,
    padding: Spacing.three,
    backgroundColor: '#25272C',
    borderWidth: 1,
    borderColor: '#3A3D44',
    justifyContent: 'space-between',
  },
  input: {
    color: AccentColors.purple,
    fontFamily: 'ManropeSemiBold',
    fontSize: 16,
    lineHeight: 24,
    minHeight: 48,
    padding: 0,
  },
  sendButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AccentColors.green,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
  },
  inputActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  speechButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#3A3D44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  responseText: {
    paddingHorizontal: Spacing.one,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
  },
  scheduleList: {
    gap: Spacing.three,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: 18,
    backgroundColor: '#25272C',
  },
  scheduleIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#303239',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scheduleCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  scheduleValue: {
    fontSize: 17,
    fontWeight: '800',
  },
  planningTitle: {
    color: AccentColors.charcoalText,
    fontSize: 17,
    fontWeight: '800',
  },
  planningHint: {
    color: AccentColors.charcoalText,
    marginTop: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
