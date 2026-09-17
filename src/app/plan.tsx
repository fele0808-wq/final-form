import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';
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
import { DAY_END, DAY_START, buildPlanFromPrompt, findPlanOverlaps, findScheduleConflict, formatPlannerDuration, formatPlannerTime, getFreeBlocks, type Activity, type PlanOverlap, type PlannedItem, type PlanningAnchor, type ScheduleConflict } from '@/lib/planner';
import { applyPlanningPreferences, getPlanningContext, loadPlanningPreferences, rememberMovedPlan, rememberPlan, type PlanningPreferences } from '@/lib/planning-memory';

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

type DuplicateConfirmation = {
  prompt: string;
  duplicateItems: PlannedItem[];
  recurringDays?: number[];
  recurringWeeks?: number;
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

function getCancellationActivity(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase().replace(/[’]/g, '\'');
  const hasRemovalIntent = /\b(?:can(?:not|\s*'?\s*t)|can not|won\s*'?\s*t|will not|cancel|remove|delete|clear|erase|wipe|skip|not going|no longer|do\s*not\s*want|don\s*'?\s*t want)\b/.test(normalizedPrompt);
  const clearsCalendarCommitments = /\b(?:clear|remove|delete|erase|wipe)\b.*\b(?:calendar\s+)?commitments?\b/.test(normalizedPrompt);
  if (!hasRemovalIntent && !clearsCalendarCommitments) return null;
  if (/gym|workout|training|exercise/.test(normalizedPrompt)) return 'workout';
  if (/school|class|lecture|lesson/.test(normalizedPrompt)) return 'school';
  if (/study|learn|course|exam/.test(normalizedPrompt)) return 'study';
  if (/read|reading|book/.test(normalizedPrompt)) return 'reading';
  if (/write|writing|essay/.test(normalizedPrompt)) return 'writing';
  if (/appointment|doctor|dentist|meeting|call|commitment/.test(normalizedPrompt)) return 'commitment';
  return 'all';
}

function getCancellationWindowLabel(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();
  if (/\b(?:this|current)\s+week(?:'s|s)?\b.*\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'this and next week';
  if (/\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'next week';
  if (/\b(?:this|current)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'this week';
  if (/\bnext\s+7\s+days?\b/.test(normalizedPrompt)) return 'the next 7 days';
  if (/\btomorrow\b/.test(normalizedPrompt)) return 'tomorrow';
  if (/\btoday\b/.test(normalizedPrompt)) return 'today';
  return 'the requested dates';
}

function matchesCancellationWindow(date: Date, prompt: string) {
  const normalizedPrompt = prompt.toLowerCase();
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const target = new Date(date);
  target.setHours(12, 0, 0, 0);
  if (/\btoday\b/.test(normalizedPrompt)) return target.toDateString() === today.toDateString();
  if (/\btomorrow\b/.test(normalizedPrompt)) {
    today.setDate(today.getDate() + 1);
    return target.toDateString() === today.toDateString();
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = normalizedPrompt.match(/\b(next|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const targetDay = dayNames.indexOf(dayMatch[2]);
    const daysAhead = (targetDay - today.getDay() + 7) % 7 || (dayMatch[1] === 'next' || !dayMatch[1] ? 7 : 0);
    today.setDate(today.getDate() + daysAhead);
    return target.toDateString() === today.toDateString();
  }

  const weekStart = new Date(today);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const hasThisWeek = /\b(?:this|current)\s+week(?:'s|s)?\b/.test(normalizedPrompt);
  const hasNextWeek = /\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(normalizedPrompt);
  if (hasThisWeek || hasNextWeek) {
    const rangeStart = new Date(weekStart);
    const rangeEnd = new Date(weekStart);
    if (hasThisWeek && hasNextWeek) {
      rangeEnd.setDate(rangeEnd.getDate() + 14);
    } else if (hasNextWeek) {
      rangeStart.setDate(rangeStart.getDate() + 7);
      rangeEnd.setDate(rangeEnd.getDate() + 14);
    } else {
      rangeEnd.setDate(rangeEnd.getDate() + 7);
    }
    return target >= rangeStart && target < rangeEnd;
  }
  if (/\bnext\s+7\s+days?\b/.test(normalizedPrompt)) {
    const rangeEnd = new Date(today);
    rangeEnd.setDate(rangeEnd.getDate() + 7);
    return target >= today && target < rangeEnd;
  }
  return true;
}

function matchesCancellationActivity(activityKey: string, title: string, requestedKey: string) {
  if (requestedKey === 'all') return true;
  if (activityKey === requestedKey) return true;
  const normalizedTitle = title.toLowerCase();
  if (requestedKey === 'workout') return /gym|workout|training|exercise/.test(normalizedTitle);
  if (requestedKey === 'school') return /school|class|lecture|lesson/.test(normalizedTitle);
  if (requestedKey === 'commitment') return /appointment|doctor|dentist|meeting|call|commitment/.test(normalizedTitle);
  return normalizedTitle.includes(requestedKey);
}

function isSamePlannedActivity(first: PlannedItem, second: PlannedItem) {
  const getIdentity = (item: PlannedItem) => item.activityKey
    ?? (/workout|training|exercise|gym/i.test(item.title) ? 'workout'
      : /school|class|lecture|lesson/i.test(item.title) ? 'school'
        : item.title.toLowerCase().trim());
  const firstIdentity = getIdentity(first);
  const secondIdentity = getIdentity(second);
  return firstIdentity === secondIdentity && first.date.toDateString() === second.date.toDateString();
}

function isSameScheduledActivity(plan: PlannedItem, activity: Activity) {
  const planIdentity = plan.activityKey
    ?? (/workout|training|exercise|gym/i.test(plan.title) ? 'workout' : /school|class|lecture|lesson/i.test(plan.title) ? 'school' : plan.title.toLowerCase().trim());
  const activityIdentity = /workout|training|exercise|gym/i.test(activity.title) ? 'workout' : /school|class|lecture|lesson/i.test(activity.title) ? 'school' : activity.title.toLowerCase().trim();
  return planIdentity === activityIdentity && plan.date.toDateString() === new Date().toDateString();
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

function TimeScroller({ label, minutes, onChange }: { label: string; minutes: number; onChange: (minutes: number) => void }) {
  const startingMinutes = useSharedValue(minutes);
  const lastStep = useSharedValue(0);
  const gesture = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .failOffsetX([-16, 16])
    .onStart(() => {
      startingMinutes.value = minutes;
      lastStep.value = 0;
    })
    .onUpdate((event) => {
      const step = Math.trunc(-event.translationY / 18);
      if (step === lastStep.value) return;
      lastStep.value = step;
      const nextMinutes = Math.min(1439, Math.max(0, startingMinutes.value + step * 15));
      runOnJS(onChange)(nextMinutes);
    });

  return (
    <View style={styles.scheduleTimeField}>
      <ThemedText type="small" themeColor="textSecondary">{label}</ThemedText>
      <GestureDetector gesture={gesture}>
        <View accessibilityLabel={`${label} ${formatPlannerTime(minutes)}. Swipe up or down to change`} style={styles.timeScroller}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timeScrollerHint}>DRAG</ThemedText>
          <ThemedText style={styles.sliderTimeValue}>{formatPlannerTime(minutes)}</ThemedText>
          <SymbolView name="chevron.up.chevron.down" tintColor={AccentColors.green} size={16} />
        </View>
      </GestureDetector>
    </View>
  );
}

function OverlapTimeChoice({ label, initialMinutes, onApply }: { label: string; initialMinutes: number; onApply: (minutes: number) => void }) {
  const [minutes, setMinutes] = useState(initialMinutes);
  return (
    <View style={styles.overlapTimeChoice}>
      <TimeScroller label={label} minutes={minutes} onChange={setMinutes} />
      <Pressable onPress={() => onApply(minutes)} style={styles.overlapApplyButton}>
        <ThemedText type="small" style={styles.overlapApplyText}>Use this time</ThemedText>
      </Pressable>
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
  const [planOverlaps, setPlanOverlaps] = useState<PlanOverlap[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState('');
  const [pendingTime, setPendingTime] = useState<AmbiguousTime | null>(null);
  const [duplicateConfirmation, setDuplicateConfirmation] = useState<DuplicateConfirmation | null>(null);
  const [pendingSchedulePrompt, setPendingSchedulePrompt] = useState('');
  const [scheduleStartMinutes, setScheduleStartMinutes] = useState(9 * 60);
  const [scheduleEndMinutes, setScheduleEndMinutes] = useState(10 * 60);
  const [scheduleRepeats, setScheduleRepeats] = useState(false);
  const [scheduleDays, setScheduleDays] = useState([1, 2, 3, 4, 5]);
  const [scheduleRepeatWeeks, setScheduleRepeatWeeks] = useState(4);
  const [planningPreferences, setPlanningPreferences] = useState<PlanningPreferences>({ durationByActivity: {}, startByActivity: {}, activities: {}, facts: [] });
  const [overviewDate, setOverviewDate] = useState<Date | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: 'Tell me what you want to arrange. I can calculate the number of days and spread sessions across your plan.' },
  ]);
  const [isListening, setIsListening] = useState(false);
  const [activeModal, setActiveModal] = useState<'calendar' | 'freeTime' | 'timePeriod' | 'scheduleWindow' | 'dayOverview' | 'duplicateConfirmation' | 'overlapConfirmation' | null>(null);
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

  useEffect(() => {
    loadPlanningPreferences().then(setPlanningPreferences);
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
        start: activity.start,
        time: `${formatPlannerTime(activity.start)} · ${formatPlannerDuration(activity.duration)}`,
        kind: activity.type,
      }))
      : []),
    ...plannedItems
      .filter((item) => item.date.toDateString() === selectedCalendarDate.toDateString())
      .map((item) => ({
        id: item.id,
        title: item.title,
        start: item.start,
        time: `${formatPlannerTime(item.start)} · ${formatPlannerDuration(item.duration)}`,
        kind: 'AI plan',
      })),
  ].sort((first, second) => first.start - second.start);
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
  const arrangedEntries = [
    ...arrangedActivities.map((item) => ({ kind: 'activity' as const, item, start: item.start, id: item.id })),
    ...arrangedItems.map((item) => ({ kind: 'plan' as const, item, start: item.start, id: item.id })),
  ].sort((first, second) => first.start - second.start);
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
    const cancellationActivity = getCancellationActivity(nextPrompt);
    if (cancellationActivity) {
      const matchingPlans = plannedItems.filter((item) => (
        matchesCancellationActivity(item.activityKey ?? '', item.title, cancellationActivity)
        && matchesCancellationWindow(item.date, nextPrompt)
      ));
      const matchingActivities = activities.filter((activity) => (
        matchesCancellationActivity(activity.type, activity.title, cancellationActivity)
        && matchesCancellationWindow(new Date(), nextPrompt)
      ));
      setSubmittedPrompt(nextPrompt);
      setPrompt('');
      if (matchingPlans.length || matchingActivities.length) {
        const removedIds = new Set(matchingPlans.map((item) => item.id));
        setPlannedItems((current) => current.filter((item) => !removedIds.has(item.id)));
        const removedActivityIds = new Set(matchingActivities.map((activity) => activity.id));
        setActivities((current) => current.filter((activity) => !removedActivityIds.has(activity.id)));
        if (timeConflict && removedIds.has(timeConflict.plannedItem.id)) setTimeConflict(null);
        if (cancellationActivity === 'all') setPlanOverlaps([]);
        const removedCount = matchingPlans.length + matchingActivities.length;
        const removedDays = new Set([
          ...matchingPlans.map((item) => item.date.toDateString()),
          ...(matchingActivities.length ? [new Date().toDateString()] : []),
        ]).size;
        const windowLabel = getCancellationWindowLabel(nextPrompt);
        const removedLabel = cancellationActivity === 'all' ? 'calendar plans' : `${cancellationActivity} ${removedCount === 1 ? 'plan' : 'plans'}`;
        setChatMessages((current) => [...current,
          { id: `user-${Date.now()}`, role: 'user', text: nextPrompt },
          { id: `assistant-${Date.now()}-removed`, role: 'assistant', text: `Removed ${removedCount} ${removedLabel} across ${removedDays} ${removedDays === 1 ? 'day' : 'days'} in ${windowLabel}.` },
        ]);
      } else {
        const targetLabel = cancellationActivity === 'all' ? 'calendar plans' : `${cancellationActivity} plans`;
        setChatMessages((current) => [...current,
          { id: `user-${Date.now()}`, role: 'user', text: nextPrompt },
          { id: `assistant-${Date.now()}-none`, role: 'assistant', text: `I couldn&apos;t find any ${targetLabel} in that time window.` },
        ]);
      }
      return;
    }
    const ambiguousTime = findNextAmbiguousTime(nextPrompt);
    if (ambiguousTime) {
      setPendingPrompt(nextPrompt);
      setPendingTime(ambiguousTime);
      setActiveModal('timePeriod');
      return;
    }
    const hasExplicitTime = /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b|\b(?:noon|midnight)\b/i.test(nextPrompt);
    if (!hasExplicitTime) {
      setPendingSchedulePrompt(nextPrompt);
      setScheduleRepeats(false);
      setScheduleDays([1, 2, 3, 4, 5]);
      setScheduleRepeatWeeks(4);
      setActiveModal('scheduleWindow');
      return;
    }
    completePrompt(nextPrompt);
  };

  const submitScheduleWindow = () => {
    if (scheduleEndMinutes <= scheduleStartMinutes || (scheduleRepeats && !scheduleDays.length)) return;
    completePrompt(`${pendingSchedulePrompt} from ${formatPlannerTime(scheduleStartMinutes)} to ${formatPlannerTime(scheduleEndMinutes)}`, false, scheduleRepeats ? scheduleDays : undefined, scheduleRepeats ? scheduleRepeatWeeks : undefined);
    setPendingSchedulePrompt('');
  };

  const toggleScheduleDay = (day: number) => {
    setScheduleDays((current) => current.includes(day)
      ? current.filter((value) => value !== day)
      : [...current, day].sort((first, second) => first - second));
  };

  const setSchedulePeriod = (value: number, period: 'AM' | 'PM', setValue: (minutes: number) => void) => {
    const hourInDay = Math.floor(value / 60) % 12;
    const minute = value % 60;
    setValue((period === 'PM' ? 12 : 0) * 60 + hourInDay * 60 + minute);
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

  const completePrompt = (clarifiedPrompt: string, allowDuplicates = false, recurringDays?: number[], recurringWeeks?: number) => {
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
    const planningContext = getPlanningContext(nextPrompt, planningPreferences);
    const generatedPlan = buildPlanFromPrompt(nextPrompt, new Date(), planningAnchors, planningContext, recurringDays, recurringWeeks);
    const hasExplicitTiming = /\b(?:at|by|around|after|before|from|to|until)\s+\d|\d+\s*(?:min|mins|minute|minutes|h|hr|hrs|hour|hours)\b/i.test(nextPrompt);
    const requestedPlan = hasExplicitTiming ? generatedPlan : applyPlanningPreferences(generatedPlan, planningPreferences);
    const duplicateItems = requestedPlan.filter((item, index) => (
      plannedItems.some((existing) => isSamePlannedActivity(existing, item))
      || activities.some((activity) => isSameScheduledActivity(item, activity))
      || requestedPlan.slice(0, index).some((previous) => isSamePlannedActivity(previous, item))
    ));
    if (duplicateItems.length && !allowDuplicates) {
      setDuplicateConfirmation({ prompt: nextPrompt, duplicateItems, recurringDays, recurringWeeks });
      setActiveModal('duplicateConfirmation');
      return;
    }
    const addedPlan = requestedPlan.filter((item, index) => (
      allowDuplicates
        || (!plannedItems.some((existing) => isSamePlannedActivity(existing, item))
          && !activities.some((activity) => isSameScheduledActivity(item, activity))
          && !requestedPlan.slice(0, index).some((previous) => isSamePlannedActivity(previous, item)))
    ));
    const mergedPlans = allowDuplicates
      ? [...plannedItems, ...addedPlan]
      : [...plannedItems, ...addedPlan].filter((item, index, allItems) => (
        !allItems.slice(0, index).some((previous) => isSamePlannedActivity(previous, item))
      ));
    if (mergedPlans.length !== plannedItems.length || mergedPlans.length !== [...plannedItems, ...addedPlan].length) {
      setPlannedItems(mergedPlans);
    }
    const overlaps = findPlanOverlaps(addedPlan, activities, [...plannedItems, ...addedPlan]);
    setPlanOverlaps(overlaps);
    if (overlaps.length) setActiveModal('overlapConfirmation');
    if (addedPlan.length) rememberPlan(nextPrompt, addedPlan).then(setPlanningPreferences);
    const nextConflict = addedPlan.length ? findScheduleConflict(addedPlan[0], activities) : null;
    setTimeConflict(nextConflict);
    setChatMessages((current) => [
      ...current,
      { id: `user-${Date.now()}`, role: 'user', text: nextPrompt },
      {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: !addedPlan.length
          ? `${requestedPlan[0]?.title ?? 'That activity'} is already scheduled for those days.`
          : nextConflict
          ? `You already have ${nextConflict.activity.title} at ${formatPlannerTime(nextConflict.activity.start)}. I can move this earlier${nextConflict.suggestedLaterStart !== null ? ` or later` : ''}.`
          : `I arranged ${addedPlan.length} ${addedPlan.length === 1 ? 'day' : 'days'} of ${addedPlan[0].title.toLowerCase()} at ${formatPlannerDuration(addedPlan[0].duration)} each, starting at ${formatPlannerTime(addedPlan[0].start)}.`,
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
    setPlannedItems((current) => current.map((item) => {
      if (item.id !== conflictedItemId) return item;
      const movedItem = { ...item, start: suggestedStart };
      rememberMovedPlan(movedItem).then(setPlanningPreferences);
      return movedItem;
    }));
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
    setPlanOverlaps((current) => current.filter((overlap) => overlap.plannedItem.id !== plannedItemId));
  };

  const deleteOverviewItem = (itemId: string) => {
    if (activities.some((activity) => activity.id === itemId)) {
      deleteActivity(itemId);
    } else {
      deletePlannedItem(itemId);
    }
  };

  const moveOverlappingPlan = (overlap: PlanOverlap, start: number) => {
    const conflictingId = overlap.conflictingItem.id;
    if (!conflictingId) return;
    if (activities.some((activity) => activity.id === conflictingId)) {
      setActivities((current) => current.map((activity) => (
        activity.id === conflictingId ? { ...activity, start } : activity
      )));
    } else {
      setPlannedItems((current) => current.map((item) => (
        item.id === conflictingId ? { ...item, start } : item
      )));
    }
    setPlanOverlaps((current) => current.filter((item) => item.plannedItem.id !== overlap.plannedItem.id));
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
      <View pointerEvents="none" style={styles.topographicPattern}>
        <Image source={require('@/assets/images/topographic-map-charcoal.png')} contentFit="cover" style={styles.topographicImage} />
        <Svg height="100%" width="100%" viewBox="0 0 400 900" preserveAspectRatio="none" style={styles.cleanTopographicMap}>
          <Path d="M18 108 C18 58 70 27 124 43 C175 58 190 107 161 143 C135 176 76 183 38 153 C24 142 18 126 18 108 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M31 108 C31 72 70 49 112 57 C151 65 164 101 142 128 C121 153 78 159 49 138 C37 130 31 119 31 108 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M45 107 C45 84 72 69 101 74 C128 79 140 101 125 119 C111 137 82 140 60 126 C50 120 45 113 45 107 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M59 106 C59 94 75 86 91 89 C107 92 113 104 105 114 C96 125 80 126 68 118 C62 115 59 110 59 106 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M69 105 C69 100 77 96 85 98 C93 99 97 105 93 110 C89 115 80 115 74 112 C71 110 69 108 69 105 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />

          <Path d="M238 92 C264 45 334 30 371 67 C406 101 391 157 352 181 C315 204 254 185 237 145 C229 126 229 108 238 92 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M251 98 C272 62 324 51 354 78 C382 103 371 143 341 161 C310 180 270 166 255 137 C248 123 247 110 251 98 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M265 103 C280 79 316 72 338 91 C358 108 351 134 330 147 C308 160 282 150 270 130 C265 121 263 112 265 103 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M280 108 C289 95 309 91 321 102 C333 112 329 127 317 134 C303 143 288 135 282 124 C279 119 278 113 280 108 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />

          <Path d="M-32 300 C1 251 73 239 112 278 C150 316 132 374 88 396 C44 419 -15 396 -31 355 C-38 337 -39 318 -32 300 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M-18 305 C10 270 61 262 91 292 C121 322 107 363 75 380 C42 397 -2 379 -14 349 C-20 335 -21 319 -18 305 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M-4 310 C17 286 51 282 72 304 C93 326 84 352 61 365 C37 378 9 365 0 344 C-5 333 -6 320 -4 310 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M10 315 C24 301 45 300 56 313 C68 327 63 343 48 351 C33 360 17 351 11 338 C8 330 8 322 10 315 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />

          <Path d="M142 310 C174 264 243 260 273 300 C303 340 279 393 237 409 C195 425 147 402 136 365 C130 345 132 326 142 310 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M153 316 C180 282 231 280 254 311 C277 342 258 381 227 394 C195 407 159 389 151 360 C147 344 148 329 153 316 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M166 322 C186 298 220 299 236 320 C252 342 239 369 218 378 C196 388 174 375 168 354 C165 343 164 332 166 322 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M180 329 C192 316 211 317 220 330 C230 343 222 358 210 364 C197 370 185 361 181 350 C179 343 178 335 180 329 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />

          <Path d="M48 526 C78 478 145 472 180 510 C215 548 198 605 157 626 C116 647 58 625 44 586 C38 567 39 545 48 526 Z" fill="none" stroke="#34373D" strokeOpacity="0.7" strokeWidth="1.2" />
          <Path d="M60 532 C85 495 134 491 161 520 C188 550 176 591 146 607 C115 623 73 607 63 579 C58 563 58 546 60 532 Z" fill="none" stroke="#34373D" strokeOpacity="0.7" strokeWidth="1.2" />
          <Path d="M73 538 C91 512 124 511 143 530 C162 551 154 578 135 589 C115 600 87 590 79 571 C74 560 72 548 73 538 Z" fill="none" stroke="#34373D" strokeOpacity="0.7" strokeWidth="1.2" />
          <Path d="M87 545 C98 530 117 530 127 541 C138 553 133 567 121 574 C109 581 94 575 89 563 C86 557 85 550 87 545 Z" fill="none" stroke="#34373D" strokeOpacity="0.7" strokeWidth="1.2" />

          <Path d="M249 555 C282 509 352 507 387 548 C421 588 400 644 358 663 C316 682 263 659 249 621 C243 601 243 576 249 555 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M261 562 C288 527 340 526 368 556 C396 588 379 628 348 643 C317 658 278 640 268 612 C263 597 259 577 261 562 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M275 570 C294 545 329 545 348 566 C367 587 357 613 337 624 C317 635 291 624 283 604 C279 594 273 580 275 570 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />
          <Path d="M290 578 C302 564 321 565 330 575 C341 587 334 600 322 606 C310 612 298 605 294 595 C291 589 288 583 290 578 Z" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.2" />

          <Path d="M-28 760 C12 708 84 705 119 749 C154 794 132 849 87 868 C42 887 -16 862 -28 820 C-34 800 -35 779 -28 760 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M-14 767 C19 729 71 728 99 760 C127 793 112 833 78 848 C44 862 2 844 -7 814 C-12 799 -13 781 -14 767 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M0 774 C24 747 60 748 80 771 C99 793 90 819 68 829 C45 839 18 826 10 805 C5 795 0 783 0 774 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
          <Path d="M15 782 C30 766 49 767 60 779 C72 792 67 807 54 813 C41 819 26 811 21 800 C18 794 14 787 15 782 Z" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.2" />
        </Svg>
        <Svg height="100%" width="100%" viewBox="0 0 400 900" preserveAspectRatio="none" style={styles.generatedContourFallback}>
          <Path d="M0 0 H400 V900 H0 Z" fill="#17181B" fillOpacity="0.96" />
          <Path d="M-34 80 C8 30 73 20 111 55 C148 89 131 133 83 143 C35 153 22 201 73 219 C124 237 173 207 190 163 C206 121 253 109 291 136 C330 164 319 215 279 231 C238 248 226 287 269 305 C312 323 354 302 385 270 C415 240 447 249 463 278" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1.4" />
          <Path d="M-30 101 C16 49 70 44 103 73 C136 102 123 126 80 137 C38 148 33 187 76 201 C119 215 161 191 178 151 C195 111 250 94 295 122 C339 150 331 197 287 215 C243 233 242 267 278 284 C315 302 356 283 388 252 C418 223 449 231 466 258" fill="none" stroke="#34373D" strokeOpacity="0.62" strokeWidth="1.2" />
          <Path d="M-29 124 C12 78 64 72 94 95 C124 118 112 138 76 149 C42 159 44 177 79 188 C114 198 148 177 164 141 C183 98 238 78 293 107 C346 135 345 179 298 198 C251 217 254 246 286 263 C319 280 355 260 390 231 C421 205 450 211 470 239" fill="none" stroke="#34373D" strokeOpacity="0.56" strokeWidth="1.1" />
          <Path d="M-20 148 C15 110 57 104 84 122 C109 139 102 153 73 164 C48 174 53 187 83 195 C113 203 138 184 151 151 C168 108 222 82 280 104 C337 126 354 165 309 184 C264 203 266 228 294 243 C323 258 354 240 388 214 C418 191 450 192 474 220" fill="none" stroke="#34373D" strokeOpacity="0.5" strokeWidth="1.05" />
          <Path d="M-54 396 C0 342 71 351 94 402 C116 452 78 492 31 482 C-16 472 -33 512 4 541 C41 570 104 549 125 494 C146 438 207 417 255 451 C302 485 285 543 239 558 C192 573 194 615 237 631 C280 647 332 624 363 582 C394 541 440 546 468 581" fill="none" stroke="#34373D" strokeOpacity="0.65" strokeWidth="1.4" />
          <Path d="M-42 416 C8 367 61 373 82 414 C103 455 73 478 34 471 C-5 464 -17 501 17 524 C51 548 97 530 117 482 C139 429 195 411 239 441 C283 470 272 517 231 534 C190 551 192 589 231 603 C271 617 319 596 349 558 C380 519 425 523 456 557" fill="none" stroke="#34373D" strokeOpacity="0.58" strokeWidth="1.2" />
          <Path d="M-28 438 C16 397 51 397 70 428 C89 458 67 467 38 462 C8 457 -1 488 27 506 C56 524 91 508 108 468 C129 422 176 407 216 431 C255 455 251 495 218 510 C185 526 188 557 222 570 C256 582 293 565 322 531 C351 497 394 499 428 531" fill="none" stroke="#34373D" strokeOpacity="0.52" strokeWidth="1.1" />
          <Path d="M-15 459 C22 427 45 424 61 444 C77 465 61 459 43 457 C23 455 16 477 38 491 C59 505 84 492 100 458 C120 419 155 410 187 429 C219 448 220 478 194 492 C167 506 171 531 198 542 C226 552 251 539 276 510 C302 482 337 480 368 502" fill="none" stroke="#34373D" strokeOpacity="0.46" strokeWidth="1" />
          <Path d="M282 -24 C252 21 267 60 313 73 C359 86 380 119 351 153 C322 187 336 224 381 238 C426 252 441 295 408 329 C375 363 386 401 431 416" fill="none" stroke="#34373D" strokeOpacity="0.5" strokeWidth="1.3" />
          <Path d="M301 -30 C277 16 288 47 327 61 C366 75 397 111 369 143 C341 175 353 207 393 221 C433 235 452 275 420 309 C388 343 398 375 439 390" fill="none" stroke="#34373D" strokeOpacity="0.44" strokeWidth="1.1" />
          <Path d="M318 -24 C300 14 310 35 340 48 C374 62 410 95 386 124 C362 153 371 184 405 197 C439 210 463 247 433 279 C403 311 411 341 448 356" fill="none" stroke="#34373D" strokeOpacity="0.4" strokeWidth="1" />
          <Path d="M70 700 C112 649 169 660 187 704 C205 748 180 790 139 786 C99 783 88 819 119 844 C150 869 202 858 218 814 C235 769 281 755 319 782 C356 808 348 852 311 868 C274 883 279 918 318 932" fill="none" stroke="#34373D" strokeOpacity="0.52" strokeWidth="1.25" />
          <Path d="M86 716 C121 675 158 681 174 711 C190 741 172 771 142 769 C111 767 103 795 127 815 C152 836 190 828 204 793 C219 754 258 744 289 766 C320 788 316 821 284 835 C252 849 258 879 291 892" fill="none" stroke="#34373D" strokeOpacity="0.46" strokeWidth="1.05" />
          <Path d="M102 731 C130 703 151 706 164 724 C176 742 164 753 145 752 C126 751 120 772 137 786 C154 800 177 795 189 773 C201 748 228 740 251 755 C274 770 275 792 252 802 C229 813 234 833 258 843" fill="none" stroke="#34373D" strokeOpacity="0.4" strokeWidth="1" />
          <Path d="M0 615 C52 598 91 609 116 638 M0 632 C48 615 85 626 109 653 M0 649 C43 635 77 643 99 668 M400 530 C350 512 314 526 287 558 M400 548 C355 532 324 543 298 572 M400 566 C362 553 334 563 310 588" fill="none" stroke="#34373D" strokeOpacity="0.34" strokeWidth="1" />
          <Path d="M-30 20 C12 4 56 14 76 48 C96 82 77 111 43 118 C9 125 -2 153 22 176 C46 198 89 190 105 158 C121 126 155 115 184 132 C213 149 211 180 183 196 C155 212 158 240 187 255 C216 270 252 256 273 228 C294 200 328 199 351 221 C374 243 369 278 343 294" fill="none" stroke="#34373D" strokeOpacity="0.5" strokeWidth="1.15" />
          <Path d="M-24 39 C12 25 47 32 64 59 C81 86 69 104 40 110 C11 116 5 143 27 161 C49 179 82 174 96 147 C111 119 143 108 169 123 C195 138 194 164 170 179 C145 195 149 218 174 231 C200 245 229 232 248 208 C268 183 298 183 319 203 C340 223 337 252 314 268" fill="none" stroke="#34373D" strokeOpacity="0.58" strokeWidth="1.1" />
          <Path d="M-17 58 C11 47 38 52 52 72 C66 92 58 99 36 104 C15 109 11 130 31 145 C50 159 73 154 85 135 C98 112 125 103 147 116 C169 129 170 148 148 162 C127 176 131 196 153 207 C175 218 201 207 217 187 C234 167 259 168 278 185 C296 202 294 226 275 242" fill="none" stroke="#34373D" strokeOpacity="0.64" strokeWidth="1.05" />
          <Path d="M-8 78 C13 70 31 73 41 87 C51 101 46 107 31 110 C17 114 16 128 32 139 C47 149 64 145 73 128 C84 110 105 104 123 114 C140 124 143 140 125 151 C108 162 112 177 130 187 C148 196 168 188 181 172 C195 155 216 155 231 168 C246 181 246 199 231 214" fill="none" stroke="#34373D" strokeOpacity="0.7" strokeWidth="1" />
          <Path d="M-4 94 C12 88 24 90 32 101 C39 111 36 116 26 119 C16 122 16 132 28 140 C39 147 51 144 59 132 C67 118 84 113 98 121 C111 129 114 140 101 149 C88 158 92 169 105 176 C119 183 132 178 142 166 C153 153 167 153 178 163 C189 173 190 185 180 196" fill="none" stroke="#34373D" strokeOpacity="0.78" strokeWidth="1" />
          <Path d="M195 330 C224 285 278 273 316 300 C354 327 348 370 312 389 C277 408 280 447 319 463 C358 479 389 466 415 438" fill="none" stroke="#34373D" strokeOpacity="0.52" strokeWidth="1.2" />
          <Path d="M204 347 C230 310 272 299 302 321 C333 344 329 375 299 391 C270 407 273 435 305 449 C337 462 367 452 391 428" fill="none" stroke="#34373D" strokeOpacity="0.6" strokeWidth="1.1" />
          <Path d="M215 363 C237 333 268 326 291 343 C313 360 312 382 288 395 C265 408 268 425 293 436 C318 446 345 438 365 418" fill="none" stroke="#34373D" strokeOpacity="0.68" strokeWidth="1.05" />
          <Path d="M226 378 C242 357 265 352 281 365 C297 377 296 391 278 401 C261 410 264 423 282 430 C300 438 321 431 337 416" fill="none" stroke="#34373D" strokeOpacity="0.76" strokeWidth="1" />
          <Path d="M232 390 C244 376 260 373 271 382 C282 391 281 400 269 407 C258 413 260 422 272 426 C284 431 298 427 308 417" fill="none" stroke="#34373D" strokeOpacity="0.82" strokeWidth="1" />
          <Path d="M-80 590 C-34 548 20 549 47 582 C74 615 60 653 20 665 C-20 677 -27 716 8 739 C43 762 89 747 112 710 C135 673 184 666 217 693 C250 720 245 761 211 780 C177 799 183 833 217 851 C251 869 291 857 319 825" fill="none" stroke="#34373D" strokeOpacity="0.48" strokeWidth="1.2" />
          <Path d="M-66 612 C-26 577 16 579 37 605 C59 632 48 659 16 669 C-16 680 -20 709 10 727 C40 746 76 732 96 701 C116 670 155 663 183 686 C211 709 208 742 179 758 C150 774 155 802 184 818 C213 834 248 823 272 796" fill="none" stroke="#34373D" strokeOpacity="0.56" strokeWidth="1.1" />
          <Path d="M-51 634 C-18 606 12 608 28 628 C44 648 36 667 12 675 C-12 683 -14 704 11 718 C35 732 64 720 80 694 C96 669 128 663 151 681 C174 699 172 726 148 739 C125 752 130 775 153 788 C177 801 204 793 224 770" fill="none" stroke="#34373D" strokeOpacity="0.64" strokeWidth="1.05" />
          <Path d="M-37 654 C-11 632 11 634 21 649 C31 665 25 677 8 682 C-8 688 -8 702 11 713 C29 723 50 714 62 694 C75 674 98 671 116 685 C133 699 132 718 114 729 C96 739 101 755 118 765 C135 775 155 770 170 754" fill="none" stroke="#34373D" strokeOpacity="0.72" strokeWidth="1" />
          <Path d="M-25 672 C-7 657 8 659 15 670 C22 681 18 688 7 692 C-3 696 -2 706 10 713 C21 719 35 714 43 701 C52 687 67 684 79 693 C91 702 91 714 78 721 C65 729 69 739 81 746 C93 753 106 749 116 739" fill="none" stroke="#34373D" strokeOpacity="0.8" strokeWidth="1" />
        </Svg>
      </View>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View>
              <View style={styles.statusEyebrow}>
                <View style={styles.statusDot} />
                <ThemedText type="small" style={styles.eyebrow}>{formatAppDate().toUpperCase()}</ThemedText>
              </View>
              <ThemedText type="subtitle" style={styles.title}>Today</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.headerSubline}>PERSONAL OPERATING SYSTEM · ONLINE</ThemedText>
            </View>
            <View style={styles.dayMark}>
              <ThemedText type="small" style={styles.dayMarkLabel}>DAY</ThemedText>
              <ThemedText style={styles.dayNumber}>{initialAppDate.day}</ThemedText>
            </View>
          </View>

          <View style={styles.conversationBlock}>
            <View style={styles.conversationCard}>
              <View style={styles.cardKickerRow}>
                <ThemedText style={styles.planningTitle}>Planning session</ThemedText>
                <ThemedText type="small" style={styles.liveKicker}>LIVE INPUT</ThemedText>
              </View>
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
                {arrangedEntries.map((entry) => entry.kind === 'activity' ? (
                  <View key={`arranged-${entry.id}`} style={styles.scheduleRow}>
                    <View style={styles.scheduleIcon}>
                      <SymbolView
                        name={{
                          ios: entry.item.icon as SFSymbol,
                          android: entry.item.icon as AndroidSymbol,
                          web: entry.item.icon as AndroidSymbol,
                        }}
                        tintColor={AccentColors.green}
                        size={19}
                      />
                    </View>
                    <View style={styles.scheduleCopy}>
                      <ThemedText type="small" themeColor="textSecondary">{entry.item.label}</ThemedText>
                      <ThemedText style={styles.scheduleValue}>{entry.item.value}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">Today · {formatPlannerTime(entry.item.start)} · {formatPlannerDuration(entry.item.duration)}</ThemedText>
                    </View>
                    <SymbolView name="chevron.right" tintColor="#A7A9B2" size={16} />
                  </View>
                ) : (
                  <View key={`arranged-${entry.id}`} style={styles.planRow}>
                    <View style={styles.planDayBadge}>
                      <ThemedText type="small" style={styles.planDayText}>{entry.item.date.getDate()}</ThemedText>
                    </View>
                    <View style={styles.planRowCopy}>
                      <ThemedText style={styles.planItemTitle}>{entry.item.title}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">{formatPlanDate(entry.item.date)} · {formatPlannerTime(entry.item.start)} · {formatPlannerDuration(entry.item.duration)}</ThemedText>
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
              <View style={styles.freeLabelRow}>
                <View style={styles.freeLabelMark} />
                <ThemedText type="small" style={styles.freeLabel}>FREE TIME</ThemedText>
              </View>
              <SymbolView name="sparkles" tintColor={AccentColors.charcoalText} size={20} />
            </View>
            <ThemedText style={styles.freeTime}>{formatPlannerDuration(freeTime.total)}</ThemedText>
            <ThemedText type="small" style={styles.freeTimeLabel}>AVAILABLE WINDOW</ThemedText>
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
              <SwipeToDeleteRow key={event.id} onDelete={() => deleteOverviewItem(event.id)} rowStyle={styles.agendaCard}>
                <ThemedText type="small" themeColor="textSecondary">{event.time}</ThemedText>
                <ThemedText style={styles.agendaItem}>{event.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{event.kind}</ThemedText>
              </SwipeToDeleteRow>
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

      <SwipeSheet
        visible={activeModal === 'scheduleWindow'}
        onClose={() => {
          setActiveModal(null);
          setPendingSchedulePrompt('');
        }}>
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>SET YOUR TIME</ThemedText>
              <ThemedText style={styles.calendarTitle}>When should it happen?</ThemedText>
            </View>
            <Pressable
              accessibilityLabel="Close schedule time popup"
              accessibilityRole="button"
              onPress={() => {
                setActiveModal(null);
                setPendingSchedulePrompt('');
              }}
              style={styles.closeButton}>
              <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timePeriodPrompt}>
            I can plan “{pendingSchedulePrompt}”. Choose a start and end time so I can place it around your other plans.
          </ThemedText>
          <Pressable
            accessibilityLabel={scheduleRepeats ? 'Turn off weekly repeat' : 'Make this a recurring weekly activity'}
            accessibilityRole="button"
            onPress={() => setScheduleRepeats((current) => !current)}
            style={[styles.repeatToggle, scheduleRepeats && styles.repeatToggleSelected]}>
            <View style={styles.repeatToggleCopy}>
              <ThemedText style={styles.repeatToggleTitle}>Repeats weekly</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{scheduleRepeats ? `Repeats for ${scheduleRepeatWeeks} ${scheduleRepeatWeeks === 1 ? 'week' : 'weeks'} · ${scheduleDays.length} ${scheduleDays.length === 1 ? 'day' : 'days'} selected` : 'Choose the days this activity happens'}</ThemedText>
            </View>
            <View style={[styles.repeatIndicator, scheduleRepeats && styles.repeatIndicatorSelected]}>
              <View style={styles.repeatIndicatorDot} />
            </View>
          </Pressable>
          {scheduleRepeats ? (
            <View style={styles.weekdayPicker}>
              {[
                [1, 'M'], [2, 'T'], [3, 'W'], [4, 'T'], [5, 'F'], [6, 'S'], [0, 'S'],
              ].map(([day, label]) => (
                <Pressable
                  key={`${day}-${label}`}
                  accessibilityLabel={`${scheduleDays.includes(day as number) ? 'Remove' : 'Add'} ${label} from recurring days`}
                  accessibilityRole="button"
                  onPress={() => toggleScheduleDay(day as number)}
                  style={[styles.weekdayChoice, scheduleDays.includes(day as number) && styles.weekdayChoiceSelected]}>
                  <ThemedText style={scheduleDays.includes(day as number) ? styles.weekdayChoiceSelectedText : styles.weekdayChoiceText}>{label}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          {scheduleRepeats ? (
            <View style={styles.repeatWeeksRow}>
              <View style={styles.repeatToggleCopy}>
                <ThemedText style={styles.repeatToggleTitle}>How many weeks?</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">Choose the length of this routine</ThemedText>
              </View>
              <View style={styles.repeatWeeksControls}>
                <Pressable
                  accessibilityLabel="Decrease recurring weeks"
                  accessibilityRole="button"
                  disabled={scheduleRepeatWeeks <= 1}
                  onPress={() => setScheduleRepeatWeeks((current) => Math.max(1, current - 1))}
                  style={[styles.repeatWeeksButton, scheduleRepeatWeeks <= 1 && styles.sendButtonDisabled]}>
                  <ThemedText style={styles.repeatWeeksButtonText}>-</ThemedText>
                </Pressable>
                <ThemedText style={styles.repeatWeeksValue}>{scheduleRepeatWeeks}</ThemedText>
                <Pressable
                  accessibilityLabel="Increase recurring weeks"
                  accessibilityRole="button"
                  disabled={scheduleRepeatWeeks >= 52}
                  onPress={() => setScheduleRepeatWeeks((current) => Math.min(52, current + 1))}
                  style={[styles.repeatWeeksButton, scheduleRepeatWeeks >= 52 && styles.sendButtonDisabled]}>
                  <ThemedText style={styles.repeatWeeksButtonText}>+</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}
          <View style={styles.scheduleTimeFields}>
            <TimeScroller label="STARTS" minutes={scheduleStartMinutes} onChange={setScheduleStartMinutes} />
            <TimeScroller label="ENDS" minutes={scheduleEndMinutes} onChange={setScheduleEndMinutes} />
          </View>
          <View style={styles.schedulePeriodFields}>
            <View style={styles.schedulePeriodColumn}>
              <ThemedText type="small" themeColor="textSecondary">START PERIOD</ThemedText>
              <View style={styles.periodToggle}>
                {(['AM', 'PM'] as const).map((period) => (
                  <Pressable key={`start-${period}`} accessibilityLabel={`Start time ${period}`} accessibilityRole="button" onPress={() => setSchedulePeriod(scheduleStartMinutes, period, setScheduleStartMinutes)} style={[styles.periodButton, (scheduleStartMinutes >= 720 ? 'PM' : 'AM') === period && styles.periodButtonSelected]}>
                    <ThemedText type="small" style={(scheduleStartMinutes >= 720 ? 'PM' : 'AM') === period ? styles.periodButtonSelectedText : styles.periodButtonText}>{period}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.schedulePeriodColumn}>
              <ThemedText type="small" themeColor="textSecondary">END PERIOD</ThemedText>
              <View style={styles.periodToggle}>
                {(['AM', 'PM'] as const).map((period) => (
                  <Pressable key={`end-${period}`} accessibilityLabel={`End time ${period}`} accessibilityRole="button" onPress={() => setSchedulePeriod(scheduleEndMinutes, period, setScheduleEndMinutes)} style={[styles.periodButton, (scheduleEndMinutes >= 720 ? 'PM' : 'AM') === period && styles.periodButtonSelected]}>
                    <ThemedText type="small" style={(scheduleEndMinutes >= 720 ? styles.periodButtonSelectedText : styles.periodButtonText)}>{period}</ThemedText>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Add schedule time"
            accessibilityRole="button"
            onPress={submitScheduleWindow}
            style={({ pressed }) => [styles.scheduleTimeConfirm, pressed && styles.pressed]}>
            <ThemedText style={styles.scheduleTimeConfirmText}>Add to plan</ThemedText>
            <SymbolView name="arrow.up.right" tintColor={AccentColors.charcoalText} size={17} />
          </Pressable>
        </View>
      </SwipeSheet>

      <SwipeSheet
        visible={activeModal === 'duplicateConfirmation'}
        onClose={() => {
          setActiveModal(null);
          setDuplicateConfirmation(null);
        }}>
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>ALREADY PLANNED</ThemedText>
              <ThemedText style={styles.calendarTitle}>Add another copy?</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close duplicate plan popup" accessibilityRole="button" onPress={() => { setActiveModal(null); setDuplicateConfirmation(null); }} style={styles.closeButton}>
              <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timePeriodPrompt}>
            This plan already exists on {duplicateConfirmation?.duplicateItems.length ?? 0} {duplicateConfirmation?.duplicateItems.length === 1 ? 'day' : 'days'}. Would you like to add another copy anyway?
          </ThemedText>
          <View style={styles.duplicateDateList}>
            {duplicateConfirmation?.duplicateItems.map((item) => (
              <View key={item.id} style={styles.duplicateDateRow}>
                <SymbolView name="calendar" tintColor={AccentColors.green} size={17} />
                <ThemedText type="small" style={styles.duplicateDateText}>{formatPlanDate(item.date)} · {item.title}</ThemedText>
              </View>
            ))}
          </View>
          <View style={styles.proposalActions}>
            <Pressable
              onPress={() => {
                setActiveModal(null);
                setDuplicateConfirmation(null);
              }}
              style={styles.rejectButton}>
              <ThemedText type="small" themeColor="textSecondary">Keep existing</ThemedText>
            </Pressable>
            <Pressable
              onPress={() => {
                const duplicatePrompt = duplicateConfirmation?.prompt;
                const duplicateDays = duplicateConfirmation?.recurringDays;
                const duplicateWeeks = duplicateConfirmation?.recurringWeeks;
                setDuplicateConfirmation(null);
                if (duplicatePrompt) completePrompt(duplicatePrompt, true, duplicateDays, duplicateWeeks);
              }}
              style={styles.acceptButton}>
              <ThemedText type="small" style={styles.acceptText}>Add anyway</ThemedText>
            </Pressable>
          </View>
        </View>
      </SwipeSheet>

      <SwipeSheet
        visible={activeModal === 'overlapConfirmation'}
        onClose={() => {
          setActiveModal(null);
          setPlanOverlaps([]);
        }}>
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <View>
              <ThemedText type="small" style={styles.eyebrow}>OVERLAPPING PLANS</ThemedText>
              <ThemedText style={styles.calendarTitle}>How should I move them?</ThemedText>
            </View>
            <Pressable accessibilityLabel="Close overlap popup" accessibilityRole="button" onPress={() => { setActiveModal(null); setPlanOverlaps([]); }} style={styles.closeButton}>
              <SymbolView name="xmark" tintColor={AccentColors.purple} size={18} />
            </Pressable>
          </View>
          <ThemedText type="small" themeColor="textSecondary" style={styles.timePeriodPrompt}>
            I found {planOverlaps.length} {planOverlaps.length === 1 ? 'overlap' : 'overlaps'}. Choose an earlier or later slot for each plan, or keep the requested time.
          </ThemedText>
          <View style={styles.duplicateDateList}>
            {planOverlaps.map((overlap) => (
              <View key={overlap.plannedItem.id} style={styles.overlapCard}>
                <ThemedText style={styles.proposalTitle}>{overlap.plannedItem.title}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Your new {overlap.plannedItem.title} stays at {formatPlannerTime(overlap.plannedItem.start)}. {overlap.conflictingItem.title} is currently in the way at {formatPlannerTime(overlap.conflictingItem.start)}.
                </ThemedText>
                <View style={styles.overlapChoices}>
                  {overlap.suggestedEarlierStart !== null ? (
                    <OverlapTimeChoice label="MOVE EXISTING EARLIER TO" initialMinutes={overlap.suggestedEarlierStart} onApply={(minutes) => moveOverlappingPlan(overlap, minutes)} />
                  ) : null}
                  {overlap.suggestedLaterStart !== null ? (
                    <OverlapTimeChoice label="MOVE EXISTING LATER TO" initialMinutes={overlap.suggestedLaterStart} onApply={(minutes) => moveOverlappingPlan(overlap, minutes)} />
                  ) : null}
                </View>
                <Pressable onPress={() => setPlanOverlaps((current) => current.filter((item) => item.plannedItem.id !== overlap.plannedItem.id))} style={styles.rejectButton}>
                  <ThemedText type="small" themeColor="textSecondary">Keep requested time</ThemedText>
                </Pressable>
              </View>
            ))}
          </View>
          <Pressable onPress={() => { setActiveModal(null); setPlanOverlaps([]); }} style={styles.scheduleTimeConfirm}>
            <ThemedText style={styles.scheduleTimeConfirmText}>Done</ThemedText>
          </Pressable>
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
  topographicPattern: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    opacity: 1,
    backgroundColor: '#17181B',
    display: 'none',
  },
  topographicImage: {
    ...StyleSheet.absoluteFill,
    opacity: 1,
  },
  cleanTopographicMap: {
    ...StyleSheet.absoluteFill,
    display: 'none',
  },
  generatedContourFallback: {
    display: 'none',
  },
  contourLine: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: '#34373D',
    borderRadius: 999,
    transform: [{ rotate: '-12deg' }],
  },
  contourIslandOne: {
    width: 290,
    height: 118,
    top: 116,
    right: -42,
  },
  contourIslandTwo: {
    width: 390,
    height: 178,
    top: 86,
    right: -82,
    opacity: 0.72,
  },
  contourIslandThree: {
    width: 500,
    height: 248,
    top: 52,
    right: -126,
    opacity: 0.52,
  },
  contourIslandFour: {
    width: 620,
    height: 328,
    top: 22,
    right: -178,
    opacity: 0.34,
  },
  contourRidgeOne: {
    width: 360,
    height: 110,
    top: 280,
    left: -188,
    opacity: 0.38,
    transform: [{ rotate: '18deg' }],
  },
  contourRidgeTwo: {
    width: 480,
    height: 170,
    top: 248,
    left: -224,
    opacity: 0.28,
    transform: [{ rotate: '18deg' }],
  },
  contourRidgeThree: {
    width: 250,
    height: 90,
    top: 420,
    right: -116,
    opacity: 0.3,
    transform: [{ rotate: '-28deg' }],
  },
  contourRidgeFour: {
    width: 370,
    height: 146,
    top: 394,
    right: -164,
    opacity: 0.2,
    transform: [{ rotate: '-28deg' }],
  },
  safeArea: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingBottom: BottomTabInset + Spacing.two,
  },
  content: {
    position: 'relative',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statusEyebrow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: AccentColors.green,
  },
  headerSubline: {
    marginTop: Spacing.two,
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '800',
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
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#25272C',
    borderWidth: 1,
    borderColor: AccentColors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayNumber: {
    color: AccentColors.green,
    fontSize: 24,
    fontWeight: '800',
  },
  dayMarkLabel: {
    color: AccentColors.green,
    fontSize: 9,
    letterSpacing: 1.5,
    fontWeight: '800',
  },
  freeCard: {
    backgroundColor: AccentColors.purple,
    borderRadius: 20,
    padding: Spacing.five,
    minHeight: 210,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E784FF',
    shadowColor: AccentColors.purple,
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
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
  repeatToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#25272C',
    borderRadius: 16,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#3A3D44',
  },
  repeatToggleSelected: {
    borderColor: AccentColors.green,
  },
  repeatToggleCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  repeatToggleTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  repeatIndicator: {
    width: 44,
    height: 26,
    borderRadius: 13,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'flex-start',
    backgroundColor: '#3A3D44',
  },
  repeatIndicatorSelected: {
    backgroundColor: AccentColors.green,
    alignItems: 'flex-end',
  },
  repeatIndicatorDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E8E8EB',
  },
  weekdayPicker: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.one,
  },
  weekdayChoice: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25272C',
    borderWidth: 1,
    borderColor: '#3A3D44',
  },
  weekdayChoiceSelected: {
    backgroundColor: AccentColors.green,
    borderColor: AccentColors.green,
  },
  weekdayChoiceText: {
    color: '#A7A9B2',
    fontWeight: '800',
  },
  weekdayChoiceSelectedText: {
    color: AccentColors.charcoalText,
    fontWeight: '800',
  },
  repeatWeeksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#25272C',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  repeatWeeksControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  repeatWeeksButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AccentColors.green,
  },
  repeatWeeksButtonText: {
    color: AccentColors.charcoalText,
    fontSize: 20,
    lineHeight: 22,
    fontWeight: '800',
  },
  repeatWeeksValue: {
    minWidth: 24,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
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
  scheduleTimeFields: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  schedulePeriodFields: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  schedulePeriodColumn: {
    flex: 1,
    gap: Spacing.two,
  },
  scheduleTimeField: {
    flex: 1,
    gap: Spacing.two,
  },
  timeScroller: {
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#25272C',
    borderRadius: 16,
    paddingVertical: Spacing.two,
    gap: Spacing.one,
  },
  timeScrollerHint: {
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: '800',
  },
  sliderTimeValue: {
    color: AccentColors.purple,
    fontSize: 22,
    fontWeight: '800',
  },
  periodToggle: {
    flexDirection: 'row',
    backgroundColor: '#25272C',
    borderRadius: 12,
    padding: Spacing.one,
    gap: Spacing.one,
  },
  periodButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: 9,
  },
  periodButtonSelected: {
    backgroundColor: AccentColors.green,
  },
  periodButtonText: {
    color: '#A7A9B2',
    fontWeight: '800',
  },
  periodButtonSelectedText: {
    color: AccentColors.charcoalText,
    fontWeight: '800',
  },
  scheduleTimeConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: AccentColors.green,
    borderRadius: 20,
    paddingVertical: Spacing.three,
  },
  scheduleTimeConfirmText: {
    color: AccentColors.charcoalText,
    fontWeight: '800',
  },
  duplicateDateList: {
    gap: Spacing.two,
  },
  duplicateDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: '#25272C',
    borderRadius: 14,
    padding: Spacing.three,
  },
  overlapCard: {
    backgroundColor: '#25272C',
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  overlapChoices: {
    gap: Spacing.two,
  },
  overlapTimeChoice: {
    gap: Spacing.two,
  },
  overlapApplyButton: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    backgroundColor: AccentColors.green,
  },
  overlapApplyText: {
    color: AccentColors.charcoalText,
    fontWeight: '800',
  },
  duplicateDateText: {
    flex: 1,
    color: '#E8E8EB',
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
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: '#D8FF88',
  },
  cardKickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveKicker: {
    color: AccentColors.charcoalText,
    fontSize: 9,
    letterSpacing: 1.2,
    fontWeight: '800',
    opacity: 0.65,
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
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: '#3A3D44',
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
  freeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  freeLabelMark: {
    width: 22,
    height: 4,
    borderRadius: 2,
    backgroundColor: AccentColors.charcoalText,
  },
  planRowCopy: {
    flex: 1,
    gap: Spacing.one,
  },
  planItemTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  freeTimeLabel: {
    color: AccentColors.charcoalText,
    fontSize: 10,
    letterSpacing: 1.4,
    fontWeight: '800',
    opacity: 0.7,
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
