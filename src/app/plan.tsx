import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SwipeSheet } from '@/components/swipe-sheet';
import { AccentColors, BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { getAppDateParts, APP_TIME_ZONE, formatAppDate } from '@/constants/date-time';
import { DAY_END, DAY_START, buildPlanFromPrompt, findScheduleConflict, formatPlannerDuration, formatPlannerTime, getFreeBlocks, type Activity, type PlannedItem, type PlanningAnchor, type ScheduleConflict } from '@/lib/planner';

const schedule: Array<{
  id: string;
  label: string;
  title: string;
  value: string;
  detail: string;
  type: 'commitment' | 'workout' | 'routine';
  start: number;
  duration: number;
  locked: boolean;
  icon: string;
}> = [];

const weekDays = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const initialAppDate = getAppDateParts();

type SpeechRecognitionModule = {
  addListener: (event: string, listener: (payload: SpeechEvent) => void) => { remove: () => void };
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  start: (options: { lang: string; interimResults: boolean; continuous: boolean }) => void;
  stop: () => void;
};

type SpeechEvent = {
  results?: Array<{ transcript?: string }>;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

type AmbiguousTime = {
  token: string;
  start: number;
  end: number;
};

function findNextAmbiguousTime(prompt: string): AmbiguousTime | null {
  const timePattern = /\b(?:at|by|around|after|before|from|to|until)\s+(\d{1,2}(?::\d{2})?)(?!:)(?!\s*(?:am|pm)\b)/i;
  const match = prompt.match(timePattern);
  if (!match) return null;
  const token = match[1];
  const hour = Number(token.split(':')[0]);
  if (hour > 12) return null;
  const start = (match.index ?? 0) + match[0].lastIndexOf(token);
  return { token, start, end: start + token.length };
}

let speechRecognitionModule: SpeechRecognitionModule | null = null;

if (Platform.OS !== 'web') {
  try {
    speechRecognitionModule = require('expo-speech-recognition').ExpoSpeechRecognitionModule;
  } catch {
    speechRecognitionModule = null;
  }
}

function SwipeToDeleteRow({ children, onDelete, rowStyle: baseStyle }: { children: React.ReactNode; onDelete: () => void; rowStyle?: StyleProp<ViewStyle> }) {
  const translationX = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      translationX.value = Math.min(0, Math.max(-104, event.translationX));
    })
    .onEnd(() => {
      if (translationX.value < -72) {
        runOnJS(onDelete)();
        translationX.value = withTiming(-420, { duration: 180 });
      } else {
        translationX.value = withSpring(0, { damping: 20, stiffness: 180 });
      }
    });
  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translationX.value }],
  }));

  return (
    <View style={styles.swipeActivityTrack}>
      <View style={styles.deleteActivityAction}>
        <SymbolView name="trash" tintColor="#FFFFFF" size={18} />
        <ThemedText type="small" style={styles.deleteActivityText}>Delete</ThemedText>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={[baseStyle, styles.swipeDeleteRow, rowStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function PlanScreen() {
  const [activities, setActivities] = useState(schedule);
  const [prompt, setPrompt] = useState('');
  const [submittedPrompt, setSubmittedPrompt] = useState('');
  const [proposal, setProposal] = useState<{ activityId: string; start: number } | null>(null);
  const [plannedItems, setPlannedItems] = useState<PlannedItem[]>([]);
  const [timeConflict, setTimeConflict] = useState<ScheduleConflict | null>(null);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingTime, setPendingTime] = useState<AmbiguousTime | null>(null);
  const [overviewDate, setOverviewDate] = useState<Date | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: 'Tell me what you want to arrange. I can calculate the number of days and spread sessions across your plan.' },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [activeModal, setActiveModal] = useState<'calendar' | 'freeTime' | 'timePeriod' | 'dayOverview' | null>(null);
  const [displayMonth, setDisplayMonth] = useState(initialAppDate.month - 1);
  const [displayYear, setDisplayYear] = useState(initialAppDate.year);
  const [selectedDay, setSelectedDay] = useState(initialAppDate.day);
  const openModal = (modal: 'calendar' | 'freeTime') => {
    setActiveModal(modal);
  };

  useEffect(() => {
    if (!speechRecognitionModule) return;

    const startSubscription = speechRecognitionModule.addListener('start', () => setIsListening(true));
    const endSubscription = speechRecognitionModule.addListener('end', () => setIsListening(false));
    const resultSubscription = speechRecognitionModule.addListener('result', (event) => {
      setPrompt(event.results?.[0]?.transcript ?? '');
    });
    const errorSubscription = speechRecognitionModule.addListener('error', () => setIsListening(false));

    return () => {
      startSubscription.remove();
      endSubscription.remove();
      resultSubscription.remove();
      errorSubscription.remove();
    };
  }, []);

  const daysInMonth = new Date(displayYear, displayMonth + 1, 0).getDate();
  const firstDayOffset = (new Date(displayYear, displayMonth, 1).getDay() + 6) % 7;
  const calendarDays = Array.from({ length: daysInMonth }, (_, index) => index + 1);
  const today = new Date();
  const selectedCalendarDate = new Date(displayYear, displayMonth, selectedDay);
  const calendarEvents = [
    ...(selectedCalendarDate.toDateString() === today.toDateString()
      ? activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        time: `${formatPlannerTime(activity.start)} · ${formatPlannerDuration(activity.duration)}`,
        kind: activity.type,
      }))
      : []),
    ...plannedItems
      .filter((item) => item.date.toDateString() === selectedCalendarDate.toDateString())
      .map((item) => ({
        id: item.id,
        title: item.title,
        time: `${formatPlannerTime(item.start)} · ${formatPlannerDuration(item.duration)}`,
        kind: 'AI plan',
      })),
  ];
  const calendarEventDates = new Set([
    ...(activities.length ? [today.toDateString()] : []),
    ...plannedItems.map((item) => item.date.toDateString()),
  ]);
  const todaysPlannedActivities: Activity[] = plannedItems
    .filter((item) => item.date.toDateString() === today.toDateString())
    .map((item) => ({
      id: item.id,
      title: item.title,
      type: 'routine' as const,
      start: item.start,
      duration: item.duration,
      locked: true,
    }));
  const scheduledActivities = [...activities, ...todaysPlannedActivities];
  const freeBlocks = getFreeBlocks(scheduledActivities);
  const freeTime = {
    blocks: freeBlocks,
    total: freeBlocks.reduce((sum, block) => sum + block.duration, 0),
  };
  const arrangedDate = plannedItems[0]?.date ?? today;
  const arrangedActivities = arrangedDate.toDateString() === today.toDateString() ? activities : [];
  const arrangedItems = plannedItems.filter((item) => item.date.toDateString() === arrangedDate.toDateString());
  const overviewItems = overviewDate ? [
    ...(overviewDate.toDateString() === new Date().toDateString()
      ? activities.map((activity) => ({
        id: activity.id,
        title: activity.title,
        start: activity.start,
        duration: activity.duration,
        kind: activity.type,
      }))
      : []),
    ...plannedItems
      .filter((item) => item.date.toDateString() === overviewDate.toDateString())
      .map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        duration: item.duration,
        kind: 'AI plan',
      })),
  ].sort((first, second) => first.start - second.start) : [];

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
    const ambiguousTime = findNextAmbiguousTime(nextPrompt);
    if (ambiguousTime) {
      setPendingPrompt(nextPrompt);
      setPendingTime(ambiguousTime);
      setActiveModal('timePeriod');
      return;
    }
    completePrompt(nextPrompt);
  };

  const chooseTimePeriod = (period: 'AM' | 'PM') => {
    if (!pendingTime) return;
    const clarifiedPrompt = `${pendingPrompt.slice(0, pendingTime.start)}${pendingTime.token} ${period}${pendingPrompt.slice(pendingTime.end)}`;
    const nextAmbiguousTime = findNextAmbiguousTime(clarifiedPrompt);
    if (nextAmbiguousTime) {
      setPendingPrompt(clarifiedPrompt);
      setPendingTime(nextAmbiguousTime);
      return;
    }
    completePrompt(clarifiedPrompt);
  };

  const completePrompt = (clarifiedPrompt: string) => {
    const nextPrompt = clarifiedPrompt.trim();
    if (!nextPrompt) return;
    setSubmittedPrompt(nextPrompt);
    setPrompt('');
    setPendingPrompt('');
    setPendingTime(null);
    setActiveModal(null);

    const planningAnchors: PlanningAnchor[] = [
      ...activities.map((activity) => ({
        title: activity.title,
        start: activity.start,
        duration: activity.duration,
        date: new Date(),
      })),
      ...plannedItems.map((item) => ({
        title: item.title,
        start: item.start,
        duration: item.duration,
        date: item.date,
      })),
    ];
    const nextPlan = buildPlanFromPrompt(nextPrompt, new Date(), planningAnchors);
    setPlannedItems((current) => [...current, ...nextPlan]);
    const nextConflict = findScheduleConflict(nextPlan[0], activities);
    setTimeConflict(nextConflict);
    setChatMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: nextPrompt },
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: nextConflict
          ? `You already have ${nextConflict.activity.title} at ${formatPlannerTime(nextConflict.activity.start)}. I can move this earlier${nextConflict.suggestedLaterStart !== null ? ` or later` : ''}.`
          : `I arranged ${nextPlan.length} ${nextPlan.length === 1 ? 'day' : 'days'} of ${nextPlan[0].title.toLowerCase()} at ${formatPlannerDuration(nextPlan[0].duration)} each, starting at ${formatPlannerTime(nextPlan[0].start)}.`,
      },
    ]);

    const workout = activities.find((activity) => activity.id === 'workout');
    const nextSlot = /workout|training|exercise|gym/i.test(nextPrompt) && workout
      ? getFreeBlocks(activities.filter((activity) => activity.id !== workout.id))
        .find((block) => block.duration >= workout.duration)
      : null;
    setProposal(nextSlot && workout ? { activityId: workout.id, start: nextSlot.start } : null);
  };

  const acceptTimeSuggestion = (suggestedStart: number | null) => {
    if (suggestedStart === null) return;
    const conflictedItemId = timeConflict?.plannedItem.id;
    setPlannedItems((current) => current.map((item) => (
      item.id === conflictedItemId ? { ...item, start: suggestedStart } : item
    )));
    setTimeConflict(null);
  };

  const acceptProposal = () => {
    if (!proposal) return;
    setActivities((current) => current.map((activity) => (
      activity.id === proposal.activityId ? { ...activity, start: proposal.start } : activity
    )));
    setProposal(null);
  };

  const deleteActivity = (activityId: string) => {
    setActivities((current) => current.filter((activity) => activity.id !== activityId));
    if (proposal?.activityId === activityId) setProposal(null);
    if (timeConflict?.activity.id === activityId) setTimeConflict(null);
  };

  const deletePlannedItem = (plannedItemId: string) => {
    setPlannedItems((current) => current.filter((item) => item.id !== plannedItemId));
    if (timeConflict?.plannedItem.id === plannedItemId) setTimeConflict(null);
  };

  const deleteOverviewItem = (itemId: string) => {
    if (activities.some((activity) => activity.id === itemId)) {
      deleteActivity(itemId);
    } else {
      deletePlannedItem(itemId);
    }
  };

  const toggleListening = async () => {
    if (!speechRecognitionModule) return;

    if (isListening) {
      speechRecognitionModule.stop();
      return;
    }

    const permission = await speechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) return;

    speechRecognitionModule.start({
      lang: 'en-AU',
      interimResults: true,
      continuous: false,
    });
  };

  const formatPlanDate = (date: Date) => date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });

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
                    accessibilityLabel={isListening ? 'Stop speech to text' : 'Start speech to text'}
                    accessibilityRole="button"
                    disabled={!speechRecognitionModule}
                    onPress={toggleListening}
                    style={({ pressed }) => [styles.speechButton, !speechRecognitionModule && styles.sendButtonDisabled, isListening && styles.speechButtonActive, pressed && styles.pressed]}>
                    <SymbolView
                      name={{ ios: isListening ? 'stop.fill' : 'mic.fill', android: isListening ? 'stop' : 'mic', web: isListening ? 'stop' : 'mic' }}
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
            <View style={styles.chatHistory}>
              {chatMessages.slice(-3).map((message) => (
                <View key={message.id} style={[styles.chatBubble, message.role === 'user' && styles.userBubble]}>
                  <ThemedText type="small" style={message.role === 'user' ? styles.userBubbleText : styles.assistantBubbleText}>
                    {message.text}
                  </ThemedText>
                </View>
              ))}
            </View>
            {arrangedItems.length || arrangedActivities.length ? (
              <Pressable
                accessibilityLabel="Open arranged plan day overview"
                accessibilityRole="button"
                onPress={() => {
                  setOverviewDate(arrangedDate);
                  setActiveModal('dayOverview');
                }}
                style={({ pressed }) => [styles.planPreview, pressed && styles.pressed]}>
                <View style={styles.planPreviewHeader}>
                  <View>
                    <ThemedText style={styles.proposalTitle}>Your arranged plan</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{formatPlanDate(arrangedDate)} · {arrangedActivities.length + arrangedItems.length} scheduled {arrangedActivities.length + arrangedItems.length === 1 ? 'item' : 'items'}</ThemedText>
                  </View>
                  <SymbolView name="sparkles" tintColor={AccentColors.green} size={18} />
                </View>
                {arrangedActivities.map((item) => (
                  <View key={`arranged-${item.id}`} style={styles.scheduleRow}>
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
                      <ThemedText type="small" themeColor="textSecondary">Today · {formatPlannerTime(item.start)} · {formatPlannerDuration(item.duration)}</ThemedText>
                    </View>
                    <SymbolView name="chevron.right" tintColor="#A7A9B2" size={16} />
                  </View>
                ))}
                {arrangedItems.map((item) => (
                  <View key={item.id} style={styles.planRow}>
                    <View style={styles.planDayBadge}>
                      <ThemedText type="small" style={styles.planDayText}>{item.date.getDate()}</ThemedText>
                    </View>
                    <View style={styles.planRowCopy}>
                      <ThemedText style={styles.planItemTitle}>{item.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{formatPlanDate(item.date)} · {formatPlannerTime(item.start)} · {formatPlannerDuration(item.duration)}</ThemedText>
                    </View>
                  </View>
                ))}
              </Pressable>
            ) : null}
            {timeConflict ? (
              <View style={styles.proposalCard}>
                <ThemedText style={styles.proposalTitle}>That time is already booked</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  You already have {timeConflict.activity.title} at {formatPlannerTime(timeConflict.activity.start)}. Choose an available time that works better.
                </ThemedText>
                {timeConflict.suggestedStart !== null || timeConflict.suggestedLaterStart !== null ? (
                  <View style={styles.proposalActions}>
                    <Pressable onPress={() => setTimeConflict(null)} style={styles.rejectButton}>
                      <ThemedText type="small" themeColor="textSecondary">Keep time</ThemedText>
                    </Pressable>
                    {timeConflict.suggestedStart !== null ? (
                      <Pressable onPress={() => acceptTimeSuggestion(timeConflict.suggestedStart)} style={styles.acceptButton}>
                        <ThemedText type="small" style={styles.acceptText}>Earlier · {formatPlannerTime(timeConflict.suggestedStart)}</ThemedText>
                      </Pressable>
                    ) : null}
                    {timeConflict.suggestedLaterStart !== null ? (
                      <Pressable onPress={() => acceptTimeSuggestion(timeConflict.suggestedLaterStart)} style={styles.laterButton}>
                        <ThemedText type="small" style={styles.laterText}>Later · {formatPlannerTime(timeConflict.suggestedLaterStart)}</ThemedText>
                      </Pressable>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ) : null}
            {proposal ? (
              <View style={styles.proposalCard}>
                <ThemedText style={styles.proposalTitle}>I found a better slot</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Move Upper body strength to {formatPlannerTime(proposal.start)}?
                </ThemedText>
                <View style={styles.proposalActions}>
                  <Pressable onPress={() => setProposal(null)} style={styles.rejectButton}>
                    <ThemedText type="small" themeColor="textSecondary">Reject</ThemedText>
                  </Pressable>
                  <Pressable onPress={acceptProposal} style={styles.acceptButton}>
                    <ThemedText type="small" style={styles.acceptText}>Accept</ThemedText>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>

          <Pressable
            accessibilityLabel="Open free time blocks"
            accessibilityRole="button"
            onPress={() => openModal('freeTime')}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView style={styles.freeCard}>
            <View style={styles.freeCardTop}>
              <ThemedText type="small" style={styles.freeLabel}>FREE TIME</ThemedText>
              <SymbolView name="sparkles" tintColor={AccentColors.charcoalText} size={20} />
            </View>
            <ThemedText style={styles.freeTime}>{formatPlannerDuration(freeTime.total)} free</ThemedText>
            <ThemedText type="small" style={styles.freeHint}>
              {formatPlannerTime(DAY_START)}–{formatPlannerTime(DAY_END)} day · Tap to see your free blocks.
            </ThemedText>
            </ThemedView>
          </Pressable>

          <Pressable
            accessibilityLabel="Open monthly calendar"
            accessibilityRole="button"
            onPress={() => openModal('calendar')}
            style={({ pressed }) => [styles.calendarButton, pressed && styles.pressed]}>
            <View style={styles.calendarButtonIcon}>
              <SymbolView name="calendar" tintColor={AccentColors.green} size={20} />
            </View>
            <View style={styles.calendarButtonCopy}>
              <ThemedText style={styles.calendarButtonTitle}>Calendar</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Browse events month by month</ThemedText>
            </View>
            <SymbolView name="chevron.right" tintColor="#A7A9B2" size={16} />
          </Pressable>

        </ScrollView>
      </SafeAreaView>

      <SwipeSheet visible={activeModal === 'calendar'} onClose={() => setActiveModal(null)}>
        <View style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <View>
                <ThemedText type="small" style={styles.eyebrow}>YOUR TIME</ThemedText>
                <ThemedText style={styles.calendarTitle}>{monthNames[displayMonth]} {displayYear}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{daysInMonth} days · your schedule</ThemedText>
              </View>
              <Pressable
                accessibilityLabel="Close calendar"
                accessibilityRole="button"
                onPress={() => setActiveModal(null)}
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
                  {calendarEventDates.has(new Date(displayYear, displayMonth, day).toDateString()) ? (
                    <View style={styles.availabilityDot} />
                  ) : null}
                </Pressable>
              ))}
            </View>

            <View style={styles.agendaHeader}>
              <ThemedText style={styles.agendaTitle}>{monthNames[displayMonth]} {selectedDay}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{calendarEvents.length} {calendarEvents.length === 1 ? 'event' : 'events'}</ThemedText>
            </View>
            {calendarEvents.length ? calendarEvents.map((event) => (
              <View key={event.id} style={styles.agendaCard}>
                <ThemedText type="small" themeColor="textSecondary">{event.time}</ThemedText>
                <ThemedText style={styles.agendaItem}>{event.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{event.kind}</ThemedText>
              </View>
            )) : (
              <ThemedText type="small" themeColor="textSecondary">
                Add a plan in the planning session to see it here.
              </ThemedText>
            )}
        </View>
      </SwipeSheet>

      <SwipeSheet visible={activeModal === 'freeTime'} onClose={() => setActiveModal(null)}>
        <View style={styles.calendarSheet}>
            <View style={styles.calendarHeader}>
              <View>
                <ThemedText type="small" style={styles.eyebrow}>YOUR TIME</ThemedText>
                <ThemedText style={styles.calendarTitle}>Free time blocks</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Calculated from today&apos;s events</ThemedText>
              </View>
              <Pressable
                accessibilityLabel="Close free time"
                accessibilityRole="button"
                onPress={() => setActiveModal(null)}
                style={styles.closeButton}>
                <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
              </Pressable>
            </View>
            <ThemedView style={styles.freeSummary}>
              <ThemedText type="small" style={styles.freeLabel}>TOTAL AVAILABLE</ThemedText>
              <ThemedText style={styles.modalFreeTime}>{formatPlannerDuration(freeTime.total)}</ThemedText>
              <ThemedText type="small" style={styles.freeHint}>{freeTime.blocks.length} blocks between {formatPlannerTime(DAY_START)} and {formatPlannerTime(DAY_END)}</ThemedText>
            </ThemedView>
            <View style={styles.freeBlocksList}>
              {freeTime.blocks.map((block) => (
                <View key={`${block.start}-${block.end}`} style={styles.freeBlockRow}>
                  <View style={styles.freeBlockIndicator} />
                  <View style={styles.freeBlockCopy}>
                    <ThemedText style={styles.freeBlockTime}>{formatPlannerTime(block.start)} – {formatPlannerTime(block.end)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">{formatPlannerDuration(block.duration)} available</ThemedText>
                  </View>
                  <SymbolView name="arrow.up.right" tintColor={AccentColors.green} size={16} />
                </View>
              ))}
            </View>
        </View>
      </SwipeSheet>

      <SwipeSheet
        visible={activeModal === 'timePeriod'}
        onClose={() => {
          setActiveModal(null);
          setPendingPrompt('');
          setPendingTime(null);
        }}>
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>ONE QUICK CHECK</ThemedText>
              <ThemedText style={styles.calendarTitle}>AM or PM?</ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Close time period popup"
              accessibilityRole="button"
              onPress={() => {
                setActiveModal(null);
                setPendingPrompt('');
                setPendingTime(null);
              }}
              style={styles.closeButton}>
              <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timePeriodPrompt}>
            Which part of the day should I use for this time? I&apos;ll tell the planner and arrange it around your existing commitments.
          </ThemedText>
          {pendingPrompt && pendingTime ? (
            <Text style={styles.highlightedPrompt}>
              {pendingPrompt.slice(0, pendingTime.start)}
              <Text style={styles.highlightedTime}>{pendingPrompt.slice(pendingTime.start, pendingTime.end)}</Text>
              {pendingPrompt.slice(pendingTime.end)}
            </Text>
          ) : null}
          <View style={styles.timePeriodActions}>
            <Pressable
              accessibilityLabel="Plan in the morning"
              accessibilityRole="button"
              onPress={() => chooseTimePeriod('AM')}
              style={({ pressed }) => [styles.timePeriodButton, pressed && styles.pressed]}>
              <ThemedText style={styles.timePeriodButtonTitle}>AM</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Morning</ThemedText>
            </Pressable>
            <Pressable
              accessibilityLabel="Plan in the afternoon or evening"
              accessibilityRole="button"
              onPress={() => chooseTimePeriod('PM')}
              style={({ pressed }) => [styles.timePeriodButton, pressed && styles.pressed]}>
              <ThemedText style={styles.timePeriodButtonTitle}>PM</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Afternoon / evening</ThemedText>
            </Pressable>
          </View>
        </View>
      </SwipeSheet>

      <SwipeSheet visible={activeModal === 'dayOverview'} onClose={() => setActiveModal(null)}>
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>DAY OVERVIEW</ThemedText>
              <ThemedText style={styles.calendarTitle}>
                {overviewDate ? formatPlanDate(overviewDate) : 'Your day'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">Everything arranged for this day</ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Close day overview"
              accessibilityRole="button"
              onPress={() => setActiveModal(null)}
              style={styles.closeButton}>
              <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
            </Pressable>
          </View>
          <View style={styles.overviewSummary}>
            <ThemedText type="small" style={styles.freeLabel}>SCHEDULED TIME</ThemedText>
            <ThemedText style={styles.overviewSummaryTime}>
              {formatPlannerDuration(overviewItems.reduce((total, item) => total + item.duration, 0))}
            </ThemedText>
            <ThemedText type="small" style={styles.freeHint}>{overviewItems.length} {overviewItems.length === 1 ? 'item' : 'items'} across your day</ThemedText>
          </View>
          <View style={styles.overviewList}>
            {overviewItems.map((item) => (
              <SwipeToDeleteRow key={item.id} onDelete={() => deleteOverviewItem(item.id)} rowStyle={styles.overviewRow}>
                <View style={styles.overviewTime}>
                  <ThemedText type="small" style={styles.overviewTimeText}>{formatPlannerTime(item.start)}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{formatPlannerDuration(item.duration)}</ThemedText>
                </View>
                <View style={styles.overviewRowCopy}>
                  <ThemedText style={styles.planItemTitle}>{item.title}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">{item.kind}</ThemedText>
                </View>
                <View style={styles.overviewIndicator} />
              </SwipeToDeleteRow>
            ))}
          </View>
        </View>
      </SwipeSheet>
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
  timePeriodPrompt: {
    lineHeight: 22,
  },
  highlightedPrompt: {
    color: '#E8E8EB',
    backgroundColor: '#25272C',
    borderRadius: 14,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontFamily: 'ManropeSemiBold',
    fontSize: 16,
    lineHeight: 24,
  },
  highlightedTime: {
    color: AccentColors.charcoalText,
    backgroundColor: AccentColors.green,
    fontFamily: 'ManropeExtraBold',
  },
  timePeriodActions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  timePeriodButton: {
    flex: 1,
    minHeight: 92,
    borderRadius: 18,
    padding: Spacing.three,
    justifyContent: 'center',
    backgroundColor: '#25272C',
    borderWidth: 1,
    borderColor: '#3A3D44',
    gap: Spacing.one,
  },
  timePeriodButtonTitle: {
    color: AccentColors.green,
    fontSize: 24,
    fontWeight: '800',
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
  calendarButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#25272C',
    borderRadius: 18,
    padding: Spacing.three,
  },
  calendarButtonIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#303239',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarButtonCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  calendarButtonTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  freeSummary: {
    backgroundColor: AccentColors.purple,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  overviewSummary: {
    backgroundColor: AccentColors.green,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  overviewSummaryTime: {
    color: AccentColors.charcoalText,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '800',
  },
  overviewList: {
    gap: Spacing.two,
  },
  overviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#25272C',
    borderRadius: 18,
    padding: Spacing.three,
  },
  overviewTime: {
    width: 72,
    gap: Spacing.one,
  },
  overviewTimeText: {
    color: AccentColors.purple,
    fontWeight: '800',
  },
  overviewRowCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  overviewIndicator: {
    width: 8,
    height: 40,
    borderRadius: 4,
    backgroundColor: AccentColors.green,
  },
  modalFreeTime: {
    color: AccentColors.charcoalText,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '800',
  },
  freeBlocksSection: {
    gap: Spacing.three,
  },
  freeBlocksList: {
    gap: Spacing.two,
  },
  freeBlockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    backgroundColor: '#25272C',
    borderRadius: 18,
    padding: Spacing.three,
  },
  freeBlockIndicator: {
    width: 8,
    height: 40,
    borderRadius: 4,
    backgroundColor: AccentColors.green,
  },
  freeBlockCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  freeBlockTime: {
    fontSize: 16,
    fontWeight: '800',
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
  speechButtonActive: {
    backgroundColor: AccentColors.purple,
  },
  sendButtonDisabled: {
    opacity: 0.35,
  },
  responseText: {
    paddingHorizontal: Spacing.one,
  },
  chatHistory: {
    gap: Spacing.two,
  },
  chatBubble: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
    backgroundColor: '#25272C',
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#303239',
  },
  assistantBubbleText: {
    color: '#E8E8EB',
  },
  userBubbleText: {
    color: AccentColors.purple,
  },
  planPreview: {
    backgroundColor: '#25272C',
    borderRadius: 18,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  planPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  planDayBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: AccentColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planDayText: {
    color: AccentColors.charcoalText,
    fontWeight: '800',
  },
  planRowCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  planItemTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  proposalCard: {
    backgroundColor: '#25272C',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  proposalTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  proposalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  rejectButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: '#303239',
  },
  acceptButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: AccentColors.purple,
  },
  acceptText: {
    color: AccentColors.charcoalText,
  },
  laterButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    backgroundColor: AccentColors.green,
  },
  laterText: {
    color: AccentColors.charcoalText,
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
  swipeActivityTrack: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#B93855',
  },
  swipeDeleteRow: {
    width: '100%',
  },
  deleteActivityAction: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: Spacing.one,
    paddingHorizontal: Spacing.four,
  },
  deleteActivityText: {
    color: '#FFFFFF',
    fontWeight: '800',
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
