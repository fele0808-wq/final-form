export type Activity = {
  id: string;
  title: string;
  type: 'commitment' | 'workout' | 'routine';
  start: number;
  duration: number;
  locked: boolean;
};

export type FreeBlock = {
  start: number;
  end: number;
  duration: number;
};

export type PlannedItem = {
  id: string;
  title: string;
  date: Date;
  start: number;
  duration: number;
};

export type PlanningAnchor = {
  title: string;
  start: number;
  duration: number;
  date?: Date;
};

export type ScheduleConflict = {
  plannedItem: PlannedItem;
  activity: Activity;
  suggestedStart: number | null;
  suggestedLaterStart: number | null;
};

export const DAY_START = 8 * 60;
export const DAY_END = 22 * 60;
export const RELATION_BUFFER_MINUTES = 20;

let planBatchSequence = 0;

export function getFreeBlocks(activities: Activity[]): FreeBlock[] {
  const sorted = [...activities].sort((first, second) => first.start - second.start);
  const blocks: FreeBlock[] = [];
  let cursor = DAY_START;

  for (const activity of sorted) {
    const start = Math.max(DAY_START, activity.start);
    const end = Math.min(DAY_END, activity.start + activity.duration);
    if (start > cursor) blocks.push({ start: cursor, end: start, duration: start - cursor });
    cursor = Math.max(cursor, end);
  }

  if (cursor < DAY_END) blocks.push({ start: cursor, end: DAY_END, duration: DAY_END - cursor });
  return blocks;
}

export function findNextSlot(activity: Activity, activities: Activity[]) {
  const blocks = getFreeBlocks(activities);
  return blocks.find((block) => block.duration >= activity.duration) ?? null;
}

export function moveActivity(activities: Activity[], activityId: string, start: number) {
  return activities.map((activity) => (
    activity.id === activityId ? { ...activity, start } : activity
  ));
}

export function parsePromptTime(prompt: string) {
  const normalizedPrompt = prompt.toLowerCase()
    .replace(/\bin the (afternoon|evening|night)\b/g, 'pm')
    .replace(/\bin the morning\b/g, 'am');
  if (/\b(midnight|12\s*am)\b/.test(normalizedPrompt)) return 0;
  if (/\b(noon|12\s*pm)\b/.test(normalizedPrompt)) return 12 * 60;

  const explicitTimeMatch = normalizedPrompt.match(/(?:at|by|around|after)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (explicitTimeMatch) {
    const hourValue = Number(explicitTimeMatch[1] ?? explicitTimeMatch[4]);
    const minute = Number(explicitTimeMatch[2] ?? explicitTimeMatch[5] ?? 0);
    const suffix = explicitTimeMatch[3] ?? explicitTimeMatch[6];
    if (hourValue < 1 || hourValue > 12 || minute > 59) return null;
    return (suffix === 'pm' ? (hourValue === 12 ? 12 : hourValue + 12) : hourValue === 12 ? 0 : hourValue) * 60 + minute;
  }

  const twentyFourHourMatch = normalizedPrompt.match(/\b(\d{1,2}):(\d{2})\b/);
  if (twentyFourHourMatch) {
    const hour = Number(twentyFourHourMatch[1]);
    const minute = Number(twentyFourHourMatch[2]);
    if (hour > 23 || minute > 59) return null;
    return hour * 60 + minute;
  }

  const timeMatch = normalizedPrompt.match(/(?:at|by|around|after)\s+(\d{1,2})\b/);
  if (!timeMatch) return null;

  const hourValue = Number(timeMatch[1]);
  const minute = 0;
  const suffix = undefined;
  if (hourValue > 23 || minute > 59 || (suffix && (hourValue < 1 || hourValue > 12))) return null;
  return hourValue * 60 + minute;
}

function parsePromptTimeRange(prompt: string) {
  const matches = prompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b[^\d]{1,12}\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!matches) return null;

  const startSuffix = matches[3];
  const endSuffix = matches[6] ?? matches[3];
  const startHour = Number(matches[1]);
  const endHour = Number(matches[4]);
  const startMinute = Number(matches[2] ?? 0);
  const endMinute = Number(matches[5] ?? 0);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;

  const toMinutes = (hour: number, minute: number, suffix?: string) => {
    if (!suffix) return hour * 60 + minute;
    if (hour < 1 || hour > 12) return null;
    return (suffix.toLowerCase() === 'pm' ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour) * 60 + minute;
  };
  let start = toMinutes(startHour, startMinute, startSuffix);
  let end = toMinutes(endHour, endMinute, endSuffix);
  if (start === null || end === null) return null;
  if (!matches[3] && matches[6]) {
    const inferredStartSuffix = endSuffix.toLowerCase() === 'pm' && startHour < 12 ? 'am' : endSuffix;
    start = toMinutes(startHour, startMinute, inferredStartSuffix);
  }
  if (!matches[6] && end !== null && start !== null && end <= start && endHour < 12) {
    end = toMinutes(endHour, endMinute, 'pm');
  }
  return start !== null && end !== null && end > start ? { start, end } : null;
}

export function findScheduleConflict(plannedItem: PlannedItem, activities: Activity[]): ScheduleConflict | null {
  const activity = activities.find((candidate) => (
    plannedItem.start < candidate.start + candidate.duration
      && plannedItem.start + plannedItem.duration > candidate.start
  ));
  if (!activity) return null;

  const earlierBlocks = getFreeBlocks(activities.filter((candidate) => candidate.id !== activity.id))
    .filter((block) => block.end <= plannedItem.start && block.duration >= plannedItem.duration);
  const earlierBlock = earlierBlocks.at(-1);
  const laterBlock = getFreeBlocks(activities.filter((candidate) => candidate.id !== activity.id))
    .find((block) => block.start >= activity.start + activity.duration && block.duration >= plannedItem.duration);
  return {
    plannedItem,
    activity,
    suggestedStart: earlierBlock ? earlierBlock.end - plannedItem.duration : null,
    suggestedLaterStart: laterBlock?.start ?? null,
  };
}

export function buildPlanFromPrompt(prompt: string, startDate = new Date(), anchors: PlanningAnchor[] = []): PlannedItem[] {
  const normalizedPrompt = prompt.toLowerCase();
  const dayMatch = normalizedPrompt.match(/(\d+)\s*(?:day|days)/);
  const weekMatch = normalizedPrompt.match(/(\d+)\s*weeks?/);
  const recurrence = getRecurrence(normalizedPrompt);
  const recurringDays = recurrence === 'weekday' ? 5 : recurrence === 'weekend' ? 2 : null;
  const days = Math.min(recurrence ? 30 : 14, Math.max(1, dayMatch
    ? Number(dayMatch[1])
    : weekMatch && recurringDays
      ? Number(weekMatch[1]) * recurringDays
      : recurringDays ?? (normalizedPrompt.includes('week') ? 5 : 1)));
  const durationMatch = normalizedPrompt.match(/(\d+)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours)/);
  const timeRange = parsePromptTimeRange(normalizedPrompt);
  const timeValues = normalizedPrompt.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/g)?.map((value) => parsePromptTime(value)).filter((value): value is number => value !== null) ?? [];
  const rangeDuration = timeRange
    ? timeRange.end - timeRange.start
    : timeValues.length >= 2 && timeValues[1] > timeValues[0]
    ? timeValues[1] - timeValues[0]
    : null;
  const duration = rangeDuration ?? (durationMatch
    ? /h|hr|hour/.test(durationMatch[2]) ? Number(durationMatch[1]) * 60 : Number(durationMatch[1])
    : 60);
  const title = getPromptTitle(normalizedPrompt);
  const planDates = getPlanDates(startDate, days, recurrence, normalizedPrompt);
  const relation = parsePromptRelation(normalizedPrompt);
  const batchId = `${Date.now()}-${planBatchSequence++}`;

  return planDates.map((date, index) => {
    const anchor = relation ? findPlanningAnchor(relation.activity, date, anchors) : null;
    const relationStart = anchor && relation
      ? relation.direction === 'after'
        ? anchor.start + anchor.duration + RELATION_BUFFER_MINUTES
        : anchor.start - duration - RELATION_BUFFER_MINUTES
      : null;
    const firstStart = relationStart ?? timeRange?.start ?? timeValues[0] ?? parsePromptTime(normalizedPrompt) ?? 9 * 60;
    return {
      id: `ai-plan-${batchId}-${date.toISOString()}-${index}`,
      title,
      date,
      start: firstStart,
      duration,
    };
  });
}

function parsePromptRelation(prompt: string) {
  const match = prompt.match(/\b(after|before)\s+([a-z][a-z\s-]*?)(?=\s+(?:for|every|on|at|from|to)\b|$)/);
  return match ? { direction: match[1] as 'after' | 'before', activity: match[2].trim() } : null;
}

function findPlanningAnchor(activityQuery: string, date: Date, anchors: PlanningAnchor[] = []) {
  const normalizedQuery = activityQuery.toLowerCase();
  const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);
  return anchors.find((anchor) => {
    const sameDate = !anchor.date || anchor.date.toDateString() === date.toDateString();
    const normalizedTitle = anchor.title.toLowerCase();
    const titleWords = normalizedTitle.split(/\s+/).filter((word) => word.length > 2);
    const sharesMeaningfulWord = queryWords.some((word) => titleWords.some((titleWord) => titleWord.includes(word) || word.includes(titleWord)));
    return sameDate && (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle) || sharesMeaningfulWord);
  }) ?? null;
}

function getRecurrence(prompt: string): 'weekday' | 'weekend' | null {
  if (/every\s+(?:week\s*day|weekday)s?/.test(prompt)) return 'weekday';
  if (/every\s+(?:weekend|weekends)/.test(prompt)) return 'weekend';
  return null;
}

function getPlanDates(startDate: Date, count: number, recurrence: 'weekday' | 'weekend' | null, prompt: string) {
  const weekStart = new Date(startDate);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const hasCurrentAndNextWeek = /\bthis\s+week\b.*\bnext\s+week\b|\bnext\s+week\b.*\bthis\s+week\b/.test(prompt);
  if (recurrence && hasCurrentAndNextWeek) {
    const endOfNextWeek = new Date(weekStart);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 13);
    return createMatchingDates(startDate, endOfNextWeek, recurrence);
  }
  if (!recurrence && /\bnext\s+week\b/.test(prompt)) {
    weekStart.setDate(weekStart.getDate() + 7);
    return createSequentialDates(weekStart, 7);
  }
  if (!recurrence && /\bthis\s+week\b/.test(prompt)) {
    return createSequentialDates(weekStart, 7);
  }
  if (!recurrence && /\bnext\s+7\s+days?\b/.test(prompt)) {
    return createSequentialDates(startDate, 7);
  }
  if (!recurrence && /\b(?:this|next)\s+weekend\b/.test(prompt)) {
    const weekendStart = new Date(weekStart);
    weekendStart.setDate(weekendStart.getDate() + (prompt.includes('next weekend') ? 12 : 5));
    return createSequentialDates(weekendStart, 2);
  }

  const dates: Date[] = [];
  let offset = 0;
  while (dates.length < count && offset < 370) {
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + offset);
    const day = date.getDay();
    const isWeekday = day >= 1 && day <= 5;
    const matches = recurrence === 'weekday' ? isWeekday : recurrence === 'weekend' ? !isWeekday : true;
    if (matches) dates.push(date);
    offset += 1;
  }
  return dates;
}

function createMatchingDates(startDate: Date, endDate: Date, recurrence: 'weekday' | 'weekend') {
  const dates: Date[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(12, 0, 0, 0);
  while (cursor <= endDate) {
    const day = cursor.getDay();
    const isWeekday = day >= 1 && day <= 5;
    if ((recurrence === 'weekday' && isWeekday) || (recurrence === 'weekend' && !isWeekday)) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function createSequentialDates(startDate: Date, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function getPromptTitle(prompt: string) {
  const requestedActivity = prompt.split(/\b(?:after|before)\b/)[0];
  if (/workout|training|exercise|gym/.test(requestedActivity)) return 'Workout session';
  if (/study|learn|course|exam/.test(requestedActivity)) return 'Study session';
  if (/read|reading|book/.test(requestedActivity)) return 'Reading session';
  if (/write|writing|essay/.test(requestedActivity)) return 'Writing session';
  if (/school|class|lecture|lesson/.test(requestedActivity)) return 'School';
  if (/meeting|call|appointment/.test(requestedActivity)) return 'Scheduled commitment';
  return 'Focus session';
}

export function formatPlannerTime(minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

export function formatPlannerDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}
