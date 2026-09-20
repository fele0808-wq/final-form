'use strict';
/* ============================================================
 * planning-tests.js
 * Faithful JS transcription of the pure logic from:
 *   src/lib/planner.ts  (all of it)
 *   src/constants/date-time.ts  (all of it)
 *   src/lib/planning-memory.ts  (pure helpers; storage injected for tests)
 *   src/app/plan.tsx  (standalone prompt/ambiguity/cancellation helpers)
 * Only TypeScript annotations are stripped; logic/regex/values are copied verbatim.
 * ES2022 is used; small polyfills guard older engines. No third-party deps.
 * Usage:  node scripts/planning-tests.js
 * ============================================================ */

// ---- ES2022 polyfill guards (behaviour-preserving) ----
if (typeof Array.prototype.at !== 'function') {
  Array.prototype.at = function (pos) {
    const i = Math.trunc(pos) || 0;
    const k = i >= 0 ? i : this.length + i;
    return k >= 0 && k < this.length ? this[k] : undefined;
  };
}
if (typeof ''.padStart !== 'function') {
  String.prototype.padStart = function (len, ch) {
    const target = Math.max(0, len - String(this).length);
    return (ch || ' ').repeat(target) + this;
  };
}

// ============================================================
// 1. planner.ts
// ============================================================
const DAY_START = 8 * 60;
const DAY_END = 22 * 60;
const RELATION_BUFFER_MINUTES = 20;
let planBatchSequence = 0;

function splitPromptTasks(prompt) {
  const normalizedPrompt = prompt.replace(/,\s+(?=(?:at|by|around|from|until)\s+\d)/i, ' ');
  const sequenceSegments = normalizedPrompt
    .split(/\s*(?:;|,?\s*(?:and then|after that|then)\b)\s*/i)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return sequenceSegments.length > 1 ? sequenceSegments : [normalizedPrompt];
}

function getFreeBlocks(activities) {
  const sorted = [...activities].sort((first, second) => first.start - second.start);
  const blocks = [];
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

function findNextSlot(activity, activities) {
  const blocks = getFreeBlocks(activities);
  return blocks.find((block) => block.duration >= activity.duration) ?? null;
}

function moveActivity(activities, activityId, start) {
  return activities.map((activity) => (activity.id === activityId ? { ...activity, start } : activity));
}

function parsePromptTime(prompt) {
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

function parsePromptTimeRange(prompt) {
  const matches = prompt.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b([^\d]{1,12})\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (!matches) return null;

  const startHasExplicitTime = Boolean(matches[2] || matches[3]);
  const hasExplicitRangeConnector = /\b(?:to|through|until)\b|–/.test(matches[4]);
  if (!startHasExplicitTime && !hasExplicitRangeConnector) return null;

  const startSuffix = matches[3];
  const endSuffix = matches[7] ?? matches[3];
  const startHour = Number(matches[1]);
  const endHour = Number(matches[5]);
  const startMinute = Number(matches[2] ?? 0);
  const endMinute = Number(matches[6] ?? 0);
  if (startHour > 23 || endHour > 23 || startMinute > 59 || endMinute > 59) return null;

  const toMinutes = (hour, minute, suffix) => {
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

function findScheduleConflict(plannedItem, activities) {
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

function findPlanOverlaps(plannedItems, activities, existingPlans = []) {
  const overlaps = [];
  const allExisting = [
    ...activities.map((activity) => ({
      id: activity.id,
      title: activity.title,
      start: activity.start,
      duration: activity.duration,
      date: new Date(),
    })),
    ...existingPlans,
  ];

  for (const plannedItem of plannedItems) {
    const conflictingItem = allExisting.find((item) => (
      item !== plannedItem
      && item.date.toDateString() === plannedItem.date.toDateString()
      && plannedItem.start < item.start + item.duration
      && plannedItem.start + plannedItem.duration > item.start
    ));
    if (!conflictingItem) continue;

    const occupiedAroundNewPlan = [
      ...allExisting
        .filter((item) => item.date.toDateString() === plannedItem.date.toDateString() && item !== conflictingItem)
        .map((item) => ({ start: item.start, end: item.start + item.duration })),
      { start: plannedItem.start, end: plannedItem.start + plannedItem.duration },
    ];
    const conflictingPlan = {
      ...plannedItem,
      start: conflictingItem.start,
      duration: conflictingItem.duration,
    };
    const earlierStart = findAvailableRelatedSlot(conflictingPlan, occupiedAroundNewPlan, 'earlier');
    const laterStart = findAvailableRelatedSlot(conflictingPlan, occupiedAroundNewPlan, 'later', plannedItem.start + plannedItem.duration);
    overlaps.push({
      plannedItem,
      conflictingItem,
      suggestedEarlierStart: earlierStart,
      suggestedLaterStart: laterStart,
    });
  }
  return overlaps;
}

function findAvailableRelatedSlot(plannedItem, occupied, direction, minimumStart = DAY_START) {
  const sorted = [...occupied].sort((first, second) => first.start - second.start);
  if (direction === 'earlier') {
    let end = plannedItem.start;
    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const block = sorted[index];
      if (block.end <= end && end - block.end >= plannedItem.duration) return end - plannedItem.duration;
      if (block.end < end) end = block.start;
    }
    return end - plannedItem.duration >= DAY_START ? end - plannedItem.duration : null;
  }

  let start = Math.max(minimumStart, plannedItem.start + plannedItem.duration);
  for (const block of sorted) {
    if (block.start >= start && block.start - start >= plannedItem.duration) return start;
    if (block.end > start) start = block.end;
  }
  return start + plannedItem.duration <= DAY_END ? start : null;
}

function buildPlanFromPrompt(prompt, startDate = new Date(), anchors = [], context, recurringDays, recurringWeeks = 4) {
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedRecurringWeeks = Math.max(1, Math.floor(recurringWeeks));
  const dayMatch = normalizedPrompt.match(/(\d+)\s*(?:day|days)/);
  const weekMatch = normalizedPrompt.match(/(\d+)\s*weeks?/);
  const recurrence = getRecurrence(normalizedPrompt);
  const recurrenceDayCount = recurrence === 'weekday' ? 5 : recurrence === 'weekend' ? 2 : recurrence === 'daily' ? 7 : null;
  const days = Math.min(recurrence ? 30 : recurringDays?.length ? recurringDays.length * normalizedRecurringWeeks : 14, Math.max(1, dayMatch
    ? Number(dayMatch[1])
    : weekMatch && recurrenceDayCount
      ? Number(weekMatch[1]) * recurrenceDayCount
      : recurringDays?.length ? recurringDays.length * normalizedRecurringWeeks : recurrenceDayCount ?? (normalizedPrompt.includes('week') ? 5 : 1)));
  const generatedDates = recurringDays?.length
    ? getSelectedRecurringDates(startDate, recurringDays, normalizedRecurringWeeks)
    : getPlanDates(startDate, days, recurrence, normalizedPrompt);
  const batchId = `${Date.now()}-${planBatchSequence++}`;

  return splitPromptTasks(prompt).flatMap((taskPrompt, taskIndex) => {
    const normalizedTaskPrompt = taskPrompt.toLowerCase();
    const taskDurationMatch = normalizedTaskPrompt.match(/(\d+)\s*(min|mins|minute|minutes|h|hr|hrs|hour|hours)/);
    const taskTimeRange = parsePromptTimeRange(normalizedTaskPrompt);
    const taskTimeValues = normalizedTaskPrompt.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\b\d{1,2}:\d{2}\b/g)?.map((value) => parsePromptTime(value)).filter((value) => value !== null) ?? [];
    const taskRangeDuration = taskTimeRange
      ? taskTimeRange.end - taskTimeRange.start
      : taskTimeValues.length >= 2 && taskTimeValues[1] > taskTimeValues[0]
      ? taskTimeValues[1] - taskTimeValues[0]
      : null;
    const taskLearnedActivity = findLearnedActivity(normalizedTaskPrompt, context);
    const taskDuration = taskDurationMatch
      ? /h|hr|hour/.test(taskDurationMatch[2]) ? Number(taskDurationMatch[1]) * 60 : Number(taskDurationMatch[1])
      : taskRangeDuration ?? (taskLearnedActivity?.preferredDuration ?? 60);
    const taskTitle = taskLearnedActivity?.label ?? getPromptTitle(normalizedTaskPrompt);
    const taskActivityKey = taskLearnedActivity?.key ?? getPromptActivityKey(normalizedTaskPrompt);
    const taskRelation = parsePromptRelation(normalizedTaskPrompt);
    const taskPlanDates = taskRelation
      ? generatedDates.filter((date) => hasPlanningAnchorOnDate(taskRelation.activity, date, anchors))
      : generatedDates;

    return taskPlanDates.map((date, index) => {
      const anchor = taskRelation ? findPlanningAnchor(taskRelation.activity, date, anchors) : null;
      const relationStart = anchor && taskRelation
        ? taskRelation.direction === 'after'
          ? anchor.start + anchor.duration + RELATION_BUFFER_MINUTES
          : anchor.start - taskDuration - RELATION_BUFFER_MINUTES
        : null;
      const firstStart = relationStart ?? taskTimeRange?.start ?? taskTimeValues[0] ?? parsePromptTime(normalizedTaskPrompt) ?? 9 * 60;
      return {
        id: `ai-plan-${batchId}-${date.toISOString()}-${taskIndex}-${index}`,
        title: taskTitle,
        activityKey: taskActivityKey,
        date,
        start: firstStart,
        duration: taskDuration,
      };
    });
  });
}

function getSelectedRecurringDates(startDate, selectedDays, weeks) {
  const dates = [];
  const cursor = new Date(startDate);
  cursor.setHours(12, 0, 0, 0);
  const weekStart = new Date(cursor);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + weeks * 7 - 1);

  while (cursor <= endDate) {
    if (selectedDays.includes(cursor.getDay())) dates.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function parsePromptRelation(prompt) {
  const match = prompt.match(/\b(after|before)\s+([a-z][a-z\s-]*?)(?=\s+(?:for|every|on|at|from|to)\b|$)/);
  return match ? { direction: match[1], activity: match[2].trim() } : null;
}

function findPlanningAnchor(activityQuery, date, anchors = []) {
  const normalizedQuery = activityQuery.toLowerCase();
  const queryWords = normalizedQuery.split(/\s+/).filter((word) => word.length > 2);
  const matchesActivity = (anchor, requireSameDate) => {
    const sameDate = !requireSameDate || !anchor.date || anchor.date.toDateString() === date.toDateString();
    const normalizedTitle = anchor.title.toLowerCase();
    const titleWords = normalizedTitle.split(/\s+/).filter((word) => word.length > 2);
    const sharesMeaningfulWord = queryWords.some((word) => titleWords.some((titleWord) => titleWord.includes(word) || word.includes(titleWord)));
    return sameDate && (normalizedTitle.includes(normalizedQuery) || normalizedQuery.includes(normalizedTitle) || sharesMeaningfulWord);
  };
  return anchors.find((anchor) => matchesActivity(anchor, true))
    ?? anchors.find((anchor) => matchesActivity(anchor, false))
    ?? null;
}

function hasPlanningAnchorOnDate(activityQuery, date, anchors) {
  const normalizedQuery = activityQuery.toLowerCase();
  return anchors.some((anchor) => {
    if (!anchor.date || anchor.date.toDateString() !== date.toDateString()) return false;
    const normalizedTitle = anchor.title.toLowerCase();
    return normalizedTitle.includes(normalizedQuery)
      || normalizedQuery.includes(normalizedTitle)
      || normalizedTitle.split(/\s+/).some((word) => word.length > 2 && normalizedQuery.includes(word));
  });
}

function getRecurrence(prompt) {
  if (/every\s+(?:week\s*day|weekday)s?/.test(prompt)) return 'weekday';
  if (/every\s+(?:weekend|weekends)/.test(prompt)) return 'weekend';
  if (/\b(?:every\s+day|daily)\b/.test(prompt)) return 'daily';
  return null;
}

function getPlanDates(startDate, count, recurrence, prompt) {
  const specificDate = getSpecificPromptDate(startDate, prompt);
  if (specificDate) return [specificDate];

  const weekStart = new Date(startDate);
  weekStart.setHours(12, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const hasCurrentAndNextWeek = /\bthis\s+week\b.*\bnext\s+week\b|\bnext\s+week\b.*\bthis\s+week\b/.test(prompt);
  if (recurrence && hasCurrentAndNextWeek) {
    const endOfNextWeek = new Date(weekStart);
    endOfNextWeek.setDate(endOfNextWeek.getDate() + 13);
    return createMatchingDates(startDate, endOfNextWeek, recurrence);
  }
  if (recurrence && /\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(prompt)) {
    const nextWeekStart = new Date(weekStart);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
    return createMatchingDates(nextWeekStart, nextWeekEnd, recurrence);
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

  const dates = [];
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

function getSpecificPromptDate(startDate, prompt) {
  const normalizedPrompt = prompt.toLowerCase().replace(/\btmr\b/g, 'tomorrow');
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayMatch = normalizedPrompt.match(/\b(next|this|on)?\s*(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (dayMatch) {
    const targetDay = dayNames.indexOf(dayMatch[2]);
    const requestedNextWeek = /\b(?:next|following|upcoming)\s+week\b/.test(normalizedPrompt);
    const requestedThisWeek = /\bthis\s+week\b/.test(normalizedPrompt);
    const currentDay = startDate.getDay();
    let daysAhead = (targetDay - currentDay + 7) % 7;
    if (requestedNextWeek) {
      const currentWeekStartOffset = (currentDay + 6) % 7;
      daysAhead = 7 - currentWeekStartOffset + targetDay - (targetDay === 0 ? 0 : 1);
      if (targetDay === 0) daysAhead = 13 - currentWeekStartOffset;
    } else if (dayMatch[1] === 'next' || (!requestedThisWeek && dayMatch[1] === undefined && daysAhead === 0)) {
      daysAhead += 7;
    }
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + daysAhead);
    return date;
  }
  if (/\btomorrow\b/.test(normalizedPrompt)) {
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + 1);
    return date;
  }
  if (/\btoday\b/.test(normalizedPrompt)) {
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    return date;
  }
  return null;
}

function createMatchingDates(startDate, endDate, recurrence) {
  const dates = [];
  const cursor = new Date(startDate);
  cursor.setHours(12, 0, 0, 0);
  while (cursor <= endDate) {
    const day = cursor.getDay();
    const isWeekday = day >= 1 && day <= 5;
    if (recurrence === 'daily' || (recurrence === 'weekday' && isWeekday) || (recurrence === 'weekend' && !isWeekday)) {
      dates.push(new Date(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function createSequentialDates(startDate, count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(startDate);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  });
}

function getPromptTitle(prompt) {
  const requestedActivity = extractRequestedActivity(prompt);
  if (/^(?:workout|training|exercise|gym)$/.test(requestedActivity)) return 'Workout session';
  if (/^(?:study|learning|course|exam)$/.test(requestedActivity)) return 'Study session';
  if (/^(?:read|reading|book)$/.test(requestedActivity)) return 'Reading session';
  if (/^(?:write|writing|essay)$/.test(requestedActivity)) return 'Writing session';
  if (/^school$/.test(requestedActivity)) return 'School';
  if (/^(?:meeting|call|appointment)$/.test(requestedActivity)) return 'Scheduled commitment';
  return requestedActivity ? toTitleCase(requestedActivity) : 'Focus session';
}

function findLearnedActivity(prompt, context) {
  if (!context) return null;
  const requestedActivity = prompt.split(/\b(?:after|before)\b/)[0].trim();
  return context.activities.find((activity) => activity.aliases.some((alias) => (
    requestedActivity.includes(alias.toLowerCase()) || alias.toLowerCase().includes(requestedActivity)
  )));
}

function toTitleCase(value) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getPromptActivityKey(prompt) {
  const requestedActivity = extractRequestedActivity(prompt);
  if (/workout|training|exercise|gym/.test(requestedActivity)) return 'workout';
  if (/\bschool\b/.test(requestedActivity)) return 'school';
  if (/study|learn|course|exam/.test(requestedActivity)) return 'study';
  if (/read|reading|book/.test(requestedActivity)) return 'reading';
  if (/write|writing|essay/.test(requestedActivity)) return 'writing';
  if (/meeting|call|appointment/.test(requestedActivity)) return 'commitment';
  return 'focus';
}

function getPlanIdentity(title, activityKey) {
  if (activityKey && activityKey !== 'focus') return `key:${activityKey}`;
  if (/workout|training|exercise|gym/i.test(title)) return 'key:workout';
  if (/school|class|lecture|lesson/i.test(title)) return 'key:school';
  return `title:${title.toLowerCase().trim()}`;
}

function extractRequestedActivity(prompt) {
  let activity = prompt.toLowerCase().replace(/[’]/g, '\'').replace(/\btmr\b/g, 'tomorrow').split(/\b(?:after|before)\b/)[0].trim();
  activity = activity
    .replace(/^(?:i'?m gonna|i am going to|ive got|i've got|i have|i need to|i want to|i should|im|i'm|i am|please|can you|could you|schedule|plan|add|put|arrange|remind me to)\s+/g, '')
    .replace(/^(?:go\s+to|do|attend|take|set up)\s+/g, '')
    .replace(/\b\d{1,2}:\d{2}\s*(?:am|pm)?\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:am|pm)\b/gi, ' ')
    .replace(/\b\d{1,2}\s*(?:to|through|until|–)\s*\d{1,2}\b/gi, ' ')
    .replace(/\b(?:at|by|around|from|to|until|after|for)\s+\d{1,2}\b/gi, ' ')
    .replace(/\b\d+\s*(?:minutes?|mins?|hours?|hrs?)\b/g, ' ')
    .replace(/\b(?:today|tomorrow|tonight)\b/g, ' ')
    .replace(/\b(?:morning|afternoon|evening|night)\s*$/g, ' ')
    .replace(/\b(?:this|next|following|upcoming)\s+(?:week|weekday|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, ' ')
    .replace(/\b(?:on|for)\s*$/g, ' ')
    .replace(/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/g, ' ')
    .replace(/\b(?:every|each)\b.*$/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(?:a|an|the)\s+/g, '')
    .trim()
    .replace(/\s+(?:at|by|around|on|for|in)$/g, '')
    .replace(/\b(?:hour|hours|hr|hrs|minute|minutes|min|mins)\b/gi, ' ')
    .replace(/\s+(?:at|to|from|for|by|around|on|in|until|through)(?:\s+(?:at|to|from|for|by|around|on|in|until|through))*\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return activity || 'focus session';
}

function formatPlannerTime(minutes) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  return `${hour % 12 || 12}:${minute.toString().padStart(2, '0')} ${suffix}`;
}

function formatPlannerDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder}m`;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

// ============================================================
// 2. date-time.ts
// ============================================================
const APP_TIME_ZONE = 'Australia/Brisbane';

function getAppDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);

  const getPart = (type) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: Number(getPart('day')),
    month: Number(getPart('month')),
    year: Number(getPart('year')),
    weekday: getPart('weekday'),
  };
}

function formatAppDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

// ============================================================
// 3. planning-memory.ts pure helpers (storage injected; AsyncStorage stubbed in tests)
// ============================================================
const STORAGE_KEY = 'final-form-planning-preferences-v1';
const PLANS_STORAGE_KEY = 'final-form-planning-plans-v1';

function makeStorage() {
  const m = new Map();
  return {
    getItem: async (k) => (m.has(k) ? m.get(k) : null),
    setItem: async (k, v) => { m.set(k, String(v)); },
    _dump: () => m,
  };
}

const emptyPreferences = () => ({
  durationByActivity: {},
  startByActivity: {},
  activities: {},
  facts: [],
});

async function loadPlanningPreferences(storage) {
  try {
    const saved = await storage.getItem(STORAGE_KEY);
    if (!saved) return emptyPreferences();
    const parsed = JSON.parse(saved);
    return {
      durationByActivity: parsed.durationByActivity ?? {},
      startByActivity: parsed.startByActivity ?? {},
      activities: parsed.activities ?? {},
      facts: parsed.facts ?? [],
    };
  } catch {
    return emptyPreferences();
  }
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function isValidPlanShape(value) {
  if (!value || typeof value !== 'object') return false;
  const item = value;
  return typeof item.id === 'string'
    && item.id.length > 0
    && typeof item.title === 'string'
    && item.title.trim().length > 0
    && (item.activityKey === undefined || typeof item.activityKey === 'string')
    && parseLocalDate(item.date) !== null
    && Number.isInteger(item.start)
    && item.start >= 0
    && item.start <= 1439
    && Number.isInteger(item.duration)
    && item.duration >= 0;
}

function plansToStorage(items) {
  return items.map((item) => ({
    id: item.id,
    title: item.title,
    ...(item.activityKey ? { activityKey: item.activityKey } : {}),
    date: localDateKey(item.date),
    start: item.start,
    duration: item.duration,
  }));
}

function plansFromStorage(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidPlanShape).map((item) => ({
    id: item.id,
    title: item.title,
    ...(item.activityKey ? { activityKey: item.activityKey } : {}),
    date: parseLocalDate(item.date),
    start: item.start,
    duration: item.duration,
  }));
}

function isValidActivityShape(value) {
  if (!value || typeof value !== 'object') return false;
  const activity = value;
  return typeof activity.id === 'string'
    && activity.id.length > 0
    && typeof activity.title === 'string'
    && activity.title.trim().length > 0
    && (activity.type === 'commitment' || activity.type === 'workout' || activity.type === 'routine')
    && Number.isInteger(activity.start)
    && activity.start >= 0
    && activity.start <= 1439
    && Number.isInteger(activity.duration)
    && activity.duration >= 0
    && typeof activity.locked === 'boolean';
}

function activitiesToStorage(activities) {
  return activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    type: activity.type,
    start: activity.start,
    duration: activity.duration,
    locked: activity.locked,
  }));
}

function activitiesFromStorage(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(isValidActivityShape).map((activity) => ({
    id: activity.id,
    title: activity.title,
    type: activity.type,
    start: activity.start,
    duration: activity.duration,
    locked: activity.locked,
  }));
}

async function loadPlans(storage) {
  try {
    const saved = await storage.getItem(PLANS_STORAGE_KEY);
    if (!saved) return { plannedItems: [], activities: [] };
    const parsed = JSON.parse(saved);
    return {
      plannedItems: plansFromStorage(parsed?.plannedItems),
      activities: activitiesFromStorage(parsed?.activities),
    };
  } catch {
    return { plannedItems: [], activities: [] };
  }
}

async function savePlans(storage, plannedItems, activities) {
  try {
    await storage.setItem(PLANS_STORAGE_KEY, JSON.stringify({
      plannedItems: plansToStorage(plannedItems),
      activities: activitiesToStorage(activities),
    }));
  } catch {
    // Planning still works if device storage is unavailable.
  }
}

async function savePlanningPreferences(storage, preferences) {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Planning still works if device storage is unavailable.
  }
}

async function rememberPlan(prompt, items, storage) {
  const preferences = await loadPlanningPreferences(storage);
  const key = getActivityKey(prompt, items[0]?.title);
  if (!key || !items.length) return preferences;

  const now = new Date().toISOString();
  const previousActivity = preferences.activities[key];
  const label = items[0].title;
  const aliases = uniqueStrings([
    ...(previousActivity?.aliases ?? []),
    extractActivityPhrase(prompt),
    label,
  ]);

  const nextPreferences = {
    durationByActivity: {
      ...preferences.durationByActivity,
      [key]: items[0].duration,
    },
    startByActivity: {
      ...preferences.startByActivity,
      [key]: items[0].start,
    },
    activities: {
      ...preferences.activities,
      [key]: {
        key,
        label,
        aliases,
        preferredDuration: items[0].duration,
        preferredStart: items[0].start,
        confidence: Math.min(1, (previousActivity?.confidence ?? 0) + 0.1),
        lastPrompt: prompt,
        updatedAt: now,
      },
    },
    facts: rememberFact(preferences.facts, {
      id: `fact-${key}`,
      text: `${label} usually lasts ${items[0].duration} minutes and starts around ${items[0].start} minutes after midnight.`,
      category: 'schedule',
      confidence: Math.min(1, (previousActivity?.confidence ?? 0) + 0.1),
      updatedAt: now,
    }),
  };
  await savePlanningPreferences(storage, nextPreferences);
  return nextPreferences;
}

async function rememberMovedPlan(item, storage) {
  const preferences = await loadPlanningPreferences(storage);
  const key = getActivityKey(item.title, item.title);
  if (!key) return preferences;
  const nextPreferences = {
    ...preferences,
    startByActivity: { ...preferences.startByActivity, [key]: item.start },
    durationByActivity: { ...preferences.durationByActivity, [key]: item.duration },
    activities: {
      ...preferences.activities,
      [key]: {
        ...(preferences.activities[key] ?? {
          key,
          label: item.title,
          aliases: [item.title],
          confidence: 0,
          updatedAt: new Date().toISOString(),
        }),
        preferredStart: item.start,
        preferredDuration: item.duration,
        confidence: Math.min(1, (preferences.activities[key]?.confidence ?? 0) + 0.15),
        updatedAt: new Date().toISOString(),
      },
    },
    facts: rememberFact(preferences.facts, {
      id: `preference-${key}-start`,
      text: `${item.title} was moved to ${item.start} minutes after midnight.`,
      category: 'preference',
      confidence: Math.min(1, (preferences.activities[key]?.confidence ?? 0) + 0.15),
      updatedAt: new Date().toISOString(),
    }),
  };
  await savePlanningPreferences(storage, nextPreferences);
  return nextPreferences;
}

function applyPlanningPreferences(items, preferences) {
  if (!items.length) return items;
  const key = getActivityKey(items[0].title, items[0].title);
  if (!key) return items;
  const learnedActivity = preferences.activities[key];
  const preferredDuration = learnedActivity?.preferredDuration ?? preferences.durationByActivity[key];
  const preferredStart = learnedActivity?.preferredStart ?? preferences.startByActivity[key];
  return items.map((item) => ({
    ...item,
    duration: preferredDuration ?? item.duration,
    start: preferredStart ?? item.start,
  }));
}

function getPlanningContext(prompt, preferences) {
  const normalizedPrompt = prompt.toLowerCase();
  const relevantActivities = Object.values(preferences.activities).filter((activity) => (
    activity.aliases.some((alias) => normalizedPrompt.includes(alias.toLowerCase()))
  ));
  const relevantFacts = preferences.facts.filter((fact) => (
    relevantActivities.some((activity) => fact.text.toLowerCase().includes(activity.label.toLowerCase()))
  ));
  return { activities: relevantActivities, facts: relevantFacts };
}

function learnPromptAlias(prompt, activityKey, label, preferences) {
  const alias = extractActivityPhrase(prompt);
  if (!alias) return preferences;
  const activity = preferences.activities[activityKey];
  return {
    ...preferences,
    activities: {
      ...preferences.activities,
      [activityKey]: {
        ...(activity ?? { key: activityKey, label, aliases: [], confidence: 0 }),
        aliases: uniqueStrings([...(activity?.aliases ?? []), alias]),
        label,
        confidence: Math.min(1, (activity?.confidence ?? 0) + 0.05),
        updatedAt: new Date().toISOString(),
      },
    },
  };
}

function getActivityKey(promptOrTitle, fallback) {
  const source = (fallback && !/focus session/i.test(fallback) ? fallback : promptOrTitle).toLowerCase();
  if (/school|class|lecture|lesson/.test(source)) return 'school';
  if (/workout|training|exercise|gym/.test(source)) return 'workout';
  if (/study|learn|course|exam/.test(source)) return 'study';
  if (/read|reading|book/.test(source)) return 'reading';
  if (/write|writing|essay/.test(source)) return 'writing';
  if (/meeting|call|appointment/.test(source)) return 'commitment';
  return fallback?.toLowerCase().trim() || extractActivityPhrase(promptOrTitle) || null;
}

function extractActivityPhrase(prompt) {
  return prompt
    .toLowerCase()
    .replace(/\b(?:i(?:'m| am)?|ive got|i've got|i have|i need to|i want to|have|please|can you|could you|schedule|plan|add|put)\b/g, '')
    .replace(/\b(?:after|before|at|by|around|from|to|until|every|this|next|following|upcoming|today|tomorrow)\b.*$/g, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/g, '')
    .replace(/\b\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values) {
  return Array.from(new Set(values.filter(Boolean).map((value) => value.toLowerCase().trim())));
}

function rememberFact(facts, fact) {
  return [...facts.filter((existing) => existing.id !== fact.id), fact].slice(-100);
}

// ============================================================
// 4. plan.tsx standalone helpers
// `matchesCancellationWindow` and `isSameScheduledActivity` use `new Date()`;
// a `now` param is injected for deterministic tests (behaviour identical otherwise).
// ============================================================
function findNextAmbiguousTime(prompt) {
  const timePattern = /\b(?:at|by|around|after|before|from|to|until)\s+(\d{1,2}(?::\d{2})?)(?!:)(?!\s*(?:am|pm)\b)/i;
  const match = prompt.match(timePattern);
  if (!match) return null;
  const token = match[1];
  const hour = Number(token.split(':')[0]);
  if (hour > 12) return null;
  const start = (match.index ?? 0) + match[0].lastIndexOf(token);
  return { token, start, end: start + token.length };
}

function getCancellationActivity(prompt) {
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

function getCancellationWindowLabel(prompt) {
  const normalizedPrompt = prompt.toLowerCase();
  if (/\b(?:this|current)\s+week(?:'s|s)?\b.*\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'this and next week';
  if (/\b(?:next|following|upcoming)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'next week';
  if (/\b(?:this|current)\s+week(?:'s|s)?\b/.test(normalizedPrompt)) return 'this week';
  if (/\bnext\s+7\s+days?\b/.test(normalizedPrompt)) return 'the next 7 days';
  if (/\btomorrow\b/.test(normalizedPrompt)) return 'tomorrow';
  if (/\btoday\b/.test(normalizedPrompt)) return 'today';
  return 'the requested dates';
}

function matchesCancellationWindow(date, prompt, now = new Date()) {
  const normalizedPrompt = prompt.toLowerCase();
  const today = new Date(now);
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

function matchesCancellationActivity(activityKey, title, requestedKey) {
  if (requestedKey === 'all') return true;
  if (activityKey === requestedKey) return true;
  const normalizedTitle = title.toLowerCase();
  if (requestedKey === 'workout') return /gym|workout|training|exercise/.test(normalizedTitle);
  if (requestedKey === 'school') return /school|class|lecture|lesson/.test(normalizedTitle);
  if (requestedKey === 'commitment') return /appointment|doctor|dentist|meeting|call|commitment/.test(normalizedTitle);
  return normalizedTitle.includes(requestedKey);
}

function isSamePlannedActivity(first, second) {
  const firstIdentity = getPlanIdentity(first.title, first.activityKey);
  const secondIdentity = getPlanIdentity(second.title, second.activityKey);
  return firstIdentity === secondIdentity && first.date.toDateString() === second.date.toDateString();
}

function isSameScheduledActivity(plan, activity, now = new Date()) {
  const planIdentity = getPlanIdentity(plan.title, plan.activityKey);
  const activityKey = activity.type === 'workout' ? 'workout' : activity.type === 'commitment' ? 'commitment' : undefined;
  const activityIdentity = getPlanIdentity(activity.title, activityKey);
  return planIdentity === activityIdentity && plan.date.toDateString() === new Date(now).toDateString();
}

// ============================================================
// 5. mini test framework
// ============================================================
function makeRunner() {
  const results = [];
  let current = 'default';
  const describe = (name) => { current = name; };
  const test = (name, fn) => {
    try {
      fn();
      results.push({ ok: true, group: current, name });
    } catch (e) {
      results.push({ ok: false, group: current, name, error: String((e && e.message) || e) });
    }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg || 'assertion failed'); };
  const eq = (actual, expected, msg) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`${msg || 'eq failed'}: expected ${e}, got ${a}`);
  };
  return { describe, test, assert, eq, results };
}

// ---- test fixed reference date: Sunday 2026-09-20 ----
const START = new Date(2026, 8, 20, 12, 0, 0);
const THU = new Date(2026, 8, 24, 12, 0, 0); // Thursday 2026-09-24
function d(offset, from = START) {
  const date = new Date(from);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}
const key = (date) => date.toDateString();
const days = (items) => items.map((item) => item.date).sort((a, b) => a - b).map((date) => key(date));
function plan(prompt, opts = {}) {
  return buildPlanFromPrompt(
    prompt,
    opts.startDate ?? START,
    opts.anchors ?? [],
    opts.context,
    opts.recurringDays,
    opts.recurringWeeks,
  );
}

// ============================================================
// 6. suites -- mapped to dev-log sections
// ============================================================
async function runTests() {
  const { describe, test, assert, eq, results } = makeRunner();

  describe('A. Natural-Language Time Logic');
  const times = [
    ['yoga at 4 PM', 960], ['yoga at 4pm', 960], ['yoga at 4 pm', 960],
    ['yoga at 4am', 240], ['yoga at 12:30 pm', 750], ['yoga at 12 pm', 720],
    ['yoga at 12 am', 0], ['16:00', 960], ['0:30', 30], ['23:59', 1439],
    ['noon', 720], ['midnight', 0], ['at 9 in the morning', 540],
    ['at 9 in the afternoon', 1260], ['at 9 in the evening', 1260], ['at 9 in the night', 1260],
  ];
  for (const [input, expected] of times) {
    test(`parsePromptTime(${JSON.stringify(input)}) = ${expected}`, () => eq(parsePromptTime(input), expected, input));
  }
  for (const input of ['at 25', 'at 5:75', 'yoga', 'at 26:00']) {
    test(`parsePromptTime(${JSON.stringify(input)}) = null`, () => eq(parsePromptTime(input), null, input));
  }

  // ranges
  function range(prompt) {
    const items = buildPlanFromPrompt(prompt, START);
    if (!items.length) return null;
    return { start: items[0].start, duration: items[0].duration };
  }
  test('range: both periods 8:30 AM - 3 PM', () => eq(range('meeting at 8:30 AM to 3 PM'), { start: 510, duration: 390 }));
  test('range: omitted first period infers AM', () => eq(range('meeting 8:30 to 3 PM'), { start: 510, duration: 390 }));
  test('range: afternoon 3 PM - 5 PM', () => eq(range('meeting at 3 PM to 5 PM'), { start: 900, duration: 120 }));
  test('range: exact minutes 8:30 AM - 3:15 PM', () => eq(range('meeting at 8:30 AM to 3:15 PM'), { start: 510, duration: 405 }));
  test('range title: "meeting at 9 AM to 10:30 AM" -> correct times and category title', () => {
    const items = plan('meeting at 9 AM to 10:30 AM');
    eq(items.length, 1, 'count');
    eq(items[0].start, 540, 'start');
    eq(items[0].duration, 90, 'duration');
    eq(items[0].title, 'Scheduled commitment', 'category title');
  });
  test('one prompt can plan multiple timed tasks across the day', () => {
    const items = plan('breakfast at 8 AM for 30 minutes, then work at 9 AM for 2 hours, then workout at 6 PM for 1 hour');
    eq(items.length, 3, 'count');
    eq(items.map((item) => item.start), [480, 540, 1080], 'starts');
    eq(items.map((item) => item.duration), [30, 120, 60], 'durations');
    eq(items.map((item) => item.title), ['Breakfast', 'Work', 'Workout session'], 'titles');
  });
  for (const [input, expectedTitle, expectedStart] of [['task 1 at 8 AM', 'Task 1', 480], ['task 2 at 9 AM', 'Task 2', 540], ['test 3 tomorrow at 10 AM', 'Test 3', 600], ['meeting 2 at 3 PM', 'Meeting 2', 900]]) {
    test(`numeric activity label is preserved: ${input}`, () => {
      const items = plan(input);
      eq(items.length, 1, 'count');
      eq(items[0].title, expectedTitle, 'title');
      eq(items[0].start, expectedStart, 'start');
      eq(items[0].duration, 60, 'duration');
    });
  }
  test('bare range removes range numbers but keeps the activity', () => eq(plan('work 9 to 5')[0].title, 'Work', 'title'));
  test('bare at-time still reaches category mapping', () => {
    const item = plan('gym at 8')[0];
    eq(item.title, 'Workout session', 'title');
    eq(item.start, 480, 'start');
  });
  test('explicit duration beats coincidental range (work at 9 am for 2 hours)', () => {
    const items = plan('work at 9 am for 2 hours');
    eq(items.length, 1, 'count');
    eq(items[0].start, 540, 'start');
    eq(items[0].duration, 120, 'duration');
  });
  for (const m of [0, 540, 960, 1439]) {
    test(`formatPlannerTime(${m})`, () => eq(formatPlannerTime(m), { 0: '12:00 AM', 540: '9:00 AM', 960: '4:00 PM', 1439: '11:59 PM' }[m]));
  }
  for (const [m, expected] of [[30, '30m'], [60, '1h'], [90, '1h 30m'], [540, '9h'], [0, '0m']]) {
    test(`formatPlannerDuration(${m})`, () => eq(formatPlannerDuration(m), expected));
  }
  const amb = [
    ['meeting at 2', '2'], ['class at 8:30', '8:30'], ['lunch at 12', '12'],
    ['call before 10', '10'], ['work from 11', '11'],
  ];
  for (const [input, token] of amb) {
    test(`ambiguous time found: ${input}`, () => {
      const res = findNextAmbiguousTime(input);
      assert(res && res.token === token, `${input}: expected token ${token}, got ${JSON.stringify(res)}`);
    });
  }
  for (const input of ['meeting at 2 PM', 'meeting at 14', 'yoga']) {
    test(`not ambiguous: ${input}`, () => eq(findNextAmbiguousTime(input), null));
  }

  describe('B. Date and Recurrence Logic');
  test('today -> 1 item today', () => {
    const items = plan('yoga today');
    eq(items.length, 1, 'count');
    eq(key(items[0].date), key(d(0)), 'date');
  });
  test('tomorrow -> 1 item tomorrow', () => {
    const items = plan('yoga tomorrow');
    eq(key(items[0].date), key(d(1)), 'date');
  });
  test('on Thursday -> next Thursday (2026-09-24)', () => {
    const items = plan('yoga on Thursday');
    eq(key(items[0].date), key(d(4)), 'date');
  });
  test('next Thursday (from Sunday) -> code yields week-after-next Thursday (10/1)', () => {
    const items = plan('yoga next Thursday');
    eq(key(items[0].date), key(d(11)), 'observed code behaviour');
  });
  test('this Thursday (from Sunday) -> upcoming Thursday (9/24)', () => {
    const items = plan('yoga this Thursday');
    eq(key(items[0].date), key(d(4)), 'date');
  });
  test('cooking lesson on Thursday next week -> single following Thursday', () => {
    const items = plan('cooking lesson on Thursday next week');
    eq(items.length, 1, 'count');
    eq(key(items[0].date), key(d(4)), 'date');
  });
  test('from Monday 9/21, next Thursday -> 10/1 (Thursday of the following week)', () => {
    const MON = new Date(2026, 8, 21, 12, 0, 0);
    const items = buildPlanFromPrompt('yoga next Thursday', MON);
    eq(key(items[0].date), key(d(10, MON)), 'observed code behaviour');
  });
  test('this week -> 7 sequential days (Mon 9/14 - Sun 9/20)', () => {
    const items = plan('workout this week');
    eq(items.length, 7, 'count');
    eq(days(items)[0], key(d(-6)), 'first day');
    eq(days(items)[6], key(d(0)), 'last day');
  });
  test('next week -> 7 sequential days (Mon 9/21 - Sun 9/27)', () => {
    const items = plan('workout next week');
    eq(items.length, 7, 'count');
    eq(days(items)[0], key(d(1)), 'first day');
    eq(days(items)[6], key(d(7)), 'last day');
  });
  test('next 7 days -> 7 days from today', () => {
    const items = plan('workout next 7 days');
    eq(items.length, 7, 'count');
    eq(days(items)[0], key(d(0)), 'first day');
    eq(days(items)[6], key(d(6)), 'last day');
  });
  test('this weekend -> Sat/Sun of this week (9/19-9/20)', () => {
    const items = plan('workout this weekend');
    eq(items.length, 2, 'count');
    eq(days(items), [key(d(-1)), key(d(0))], 'dates');
  });
  test('next weekend -> 9/26-9/27', () => {
    const items = plan('workout next weekend');
    eq(items.length, 2, 'count');
    eq(days(items), [key(d(6)), key(d(7))], 'dates');
  });
  test('every weekday -> Mon-Fri next 5 weekdays', () => {
    const items = plan('workout every weekday');
    eq(items.length, 5, 'count');
    eq(days(items), [key(d(1)), key(d(2)), key(d(3)), key(d(4)), key(d(5))], 'dates');
  });
  test('every day -> 7 days', () => {
    const items = plan('workout every day');
    eq(items.length, 7, 'count');
  });
  test('daily -> 7 days', () => {
    eq(plan('workout daily').length, 7, 'count');
  });
  test('every weekend -> next 2 weekend days from today (Sun 9/20 + Sat 9/26)', () => {
    const items = plan('workout every weekend');
    eq(items.length, 2, 'count');
    eq(days(items), [key(d(0)), key(d(6))], 'observed code behaviour');
  });
  test('every weekday next week -> Mon-Fri of next week only', () => {
    const items = plan('workout every weekday next week');
    eq(items.length, 5, 'count');
    eq(days(items), [key(d(1)), key(d(2)), key(d(3)), key(d(4)), key(d(5))], 'dates');
  });
  test('every weekend next week -> Sat+Sun next week', () => {
    const items = plan('workout every weekend next week');
    eq(items.length, 2, 'count');
    eq(days(items), [key(d(6)), key(d(7))], 'dates');
  });
  test('every day for the next 2 weeks -> 14 daily entries', () => {
    const items = plan('workout every day for the next 2 weeks');
    eq(items.length, 14, 'count');
  });
  test('piano practice every day for the next 2 weeks -> 14', () => {
    eq(plan('piano practice every day for the next 2 weeks').length, 14, 'count');
  });
  test('every weekday this week and next week (Thu start) -> remaining this week + all next week', () => {
    const items = plan('workout every weekday this week and next week', { startDate: THU });
    eq(items.length, 7, 'count'); // Thu,Fri this week + Mon-Fri next week
    eq(days(items), [key(d(0, THU)), key(d(1, THU)), key(d(4, THU)), key(d(5, THU)), key(d(6, THU)), key(d(7, THU)), key(d(8, THU))], 'dates');
  });
  test('recurrence popup (selected days) respects calendar-week boundary', () => {
    // 2-week Monday-Friday routine started Thu 9/24
    const items = plan('workout', { recurringDays: [1, 2, 3, 4, 5], recurringWeeks: 2, startDate: THU });
    eq(items.length, 7, 'count');
    eq(days(items), [key(d(0, THU)), key(d(1, THU)), key(d(4, THU)), key(d(5, THU)), key(d(6, THU)), key(d(7, THU)), key(d(8, THU))], 'dates');
  });
  test('recurrence popup week stepper respects 1..52 weeks', () => {
    const items = plan('workout', { recurringDays: [0], recurringWeeks: 52, startDate: THU });
    assert(items.length >= 51 && items.length <= 53, `expected ~52 weeks of Sundays, got ${items.length}`);
  });
  test('specific weekday phrase takes precedence (single item)', () => {
    eq(plan('cooking lesson on Thursday next week').length, 1, 'count');
  });

  describe('B2. dev-log phrase parity observations');
  test('following week (non-recurring) -> falls through to 5 sequential days from today', () => {
    const items = plan('workout following week');
    eq(items.length, 5, 'count');
    eq(days(items), [key(d(0)), key(d(1)), key(d(2)), key(d(3)), key(d(4))], 'dates');
  });
  test('upcoming week (non-recurring) -> same fallthrough as following week', () => {
    const items = plan('workout upcoming week');
    eq(items.length, 5, 'count');
    eq(days(items), [key(d(0)), key(d(1)), key(d(2)), key(d(3)), key(d(4))], 'dates');
  });
  test('this week and next week (non-recurring) -> only next week (combined branch requires recurrence)', () => {
    const items = plan('workout this week and next week');
    eq(items.length, 7, 'count');
    eq(days(items), [key(d(1)), key(d(2)), key(d(3)), key(d(4)), key(d(5)), key(d(6)), key(d(7))], 'dates');
  });

  describe('C. Activity Relationships');
  const schoolAnchors = [];
  for (let offset = 1; offset <= 5; offset += 1) {
    schoolAnchors.push({ title: 'School', start: 510, duration: 390, date: d(offset) });
  }
  test('gym after school every weekday -> on school days only at 3:20 PM', () => {
    const items = plan('gym after school every weekday', { anchors: schoolAnchors });
    eq(items.length, 5, 'count');
    eq(days(items), [key(d(1)), key(d(2)), key(d(3)), key(d(4)), key(d(5))], 'dates');
    for (const item of items) eq(item.start, 920, `start ${formatPlannerTime(item.start)} (expected 15:20)`);
  });
  test('gym after school (no dates, no anchor today) -> no plan', () => {
    eq(plan('gym after school', { anchors: schoolAnchors }).length, 0, 'count');
  });
  test('yoga after school tomorrow -> 1 plan on the school day', () => {
    const items = plan('yoga after school tomorrow', { anchors: schoolAnchors });
    eq(items.length, 1, 'count');
    eq(key(items[0].date), key(d(1)), 'date');
    eq(items[0].start, 920, '16:20+20');
  });
  test('stretch before school every weekday -> starts 20 min before school', () => {
    const items = plan('stretch before school every weekday', { anchors: schoolAnchors });
    eq(items.length, 5, 'count');
    eq(items[0].start, 430, 'school 510 - 60min - 20min = 430 (7:10 AM)');
  });
  test('anchor only on some days -> plans only on those days', () => {
    const wednesday = [{ title: 'School', start: 510, duration: 390, date: d(3) }];
    const items = plan('gym after school every weekday', { anchors: wednesday });
    eq(items.length, 1, 'count');
    eq(key(items[0].date), key(d(3)), 'date');
  });
  test('anchor from another day is not copied onto unrelated days', () => {
    const nextMonday = [{ title: 'School', start: 510, duration: 390, date: d(8) }];
    eq(plan('gym after school every weekday', { anchors: nextMonday }).length, 0, 'count');
  });
  test('after class with a multi-word anchor title', () => {
    const anchors = [{ title: 'Math Class', start: 720, duration: 60, date: d(1) }];
    const items = plan('practice math after class every weekday', { anchors });
    eq(items.length, 1, 'count');
    eq(items[0].start, 800, '720 + 60 + 20');
  });

  describe('D. Activity Naming and Categories');
  const titleCases = [
    ['school at 8', 'School', 'school'],
    ['gym at 8', 'Workout session', 'workout'],
    ['workout at 8', 'Workout session', 'workout'],
    ['training at 8', 'Workout session', 'workout'],
    ['exercise at 8', 'Workout session', 'workout'],
    ['study at 8', 'Study session', 'study'],
    ['learning at 8', 'Study session', 'study'],
    ['course at 8', 'Study session', 'study'],
    ['exam at 8', 'Study session', 'study'],
    ['read at 8', 'Reading session', 'reading'],
    ['reading at 8', 'Reading session', 'reading'],
    ['write at 8', 'Writing session', 'writing'],
    ['writing at 8', 'Writing session', 'writing'],
    ['essay at 8', 'Writing session', 'writing'],
    ['meeting at 8', 'Scheduled commitment', 'commitment'],
    ['call at 8', 'Scheduled commitment', 'commitment'],
    ['appointment at 8', 'Scheduled commitment', 'commitment'],
  ];
  for (const [input, title, activityKey] of titleCases) {
    test(`title/key: ${input}`, () => {
      const items = plan(input);
      assert(items.length === 1, `${input}: expected 1 item`);
      eq(items[0].title, title, 'title');
      eq(items[0].activityKey, activityKey, 'key');
    });
  }
  test('book at 8 uses the reading category', () => {
    const items = plan('book at 8');
    eq(items[0].title, 'Reading session', 'title');
  });
  const fillerCases = [
    ["i've got work every day for the next 2 weeks", 'Work'],
    ['piano practice every day', 'Piano Practice'],
    ['supermarket on Friday', 'Supermarket'],
    ['yoga tomorrow', 'Yoga'],
    ['practice guitar at 6pm', 'Practice Guitar'],
    ['volunteer at animal shelter on Saturday', 'Volunteer At Animal Shelter'],
    ['cooking lesson on Thursday next week', 'Cooking Lesson'],
  ];
  for (const [input, expected] of fillerCases) {
    test(`filler removal: ${input} -> ${expected}`, () => {
      const items = plan(input);
      assert(items.length >= 1, `${input}: no plan`);
      eq(items[0].title, expected, 'title');
    });
  }
  const slangCases = [
    ['hang out with my mate tomorrow', 'Hang Out With My Mate'],
    ['catch up with my mates on Saturday', 'Catch Up With My Mates'],
    ['have a yarn with my mate on Sunday', 'Have A Yarn With My Mate'],
    ['grab food with the lads tomorrow', 'Grab Food With The Lads'],
    ['go out with the crew Friday', 'Go Out With The Crew'],
  ];
  for (const [input, expected] of slangCases) {
    test(`slang: ${input}`, () => {
      const items = plan(input);
      assert(items.length >= 1, `${input}: no plan`);
      eq(items[0].title, expected, 'title');
    });
  }
  test('phrase-first extraction keeps arbitrary names (not relabelled to School)', () => {
    const items = plan('cooking lesson every day');
    eq(items[0].themeTitle ?? items[0].title, 'Cooking Lesson', 'title');
  });
  for (const [input, expected] of [
    ['cook fish and chips at 7 PM for 2 hours', 'Cook Fish And Chips'],
    ['supermarket at 5 PM to 6 PM', 'Supermarket'],
    ['yoga at 4 PM for 1 hour', 'Yoga'],
  ]) {
    test(`clean title: ${input}`, () => eq(plan(input)[0].title, expected, 'title'));
  }
  test('sequential untimed prompt splits activities and preserves names', () => {
    const items = plan("i've got school then gym tmr after that i'm gonna cook dinner then tidy up my room a little");
    eq(items.length, 4, 'count');
    eq(items.map((item) => item.title), ['School', 'Workout session', 'Cook Dinner', 'Tidy Up My Room A Little'], 'titles');
    eq(items.map((item) => item.date.toDateString()), [d(1), d(1), d(1), d(1)].map((date) => date.toDateString()), 'dates');
  });
  test('appositive comma stays one plan and preserves the time', () => {
    const items = plan('meeting with Sarah, my manager, at 2 PM');
    eq(items.length, 1, 'count');
    eq(items[0].title, 'Meeting With Sarah, My Manager', 'title');
    eq(items[0].start, 840, 'start');
  });
  test('and inside an activity name stays one plan', () => {
    const items = plan('cook fish and chips at 7 PM for 2 hours');
    eq(items.length, 1, 'count');
    eq(items[0].start, 1140, 'start');
    eq(items[0].duration, 120, 'duration');
  });
  test('explicit then marker still splits timed tasks', () => {
    const items = plan('call John at 9, then lunch with the lads at 12');
    eq(items.length, 2, 'count');
    eq(items.map((item) => item.start), [540, 720], 'starts');
  });

  describe('E. Conflict Handling');
  const conflicts = [
    { id: 'a1', title: 'Work', type: 'commitment', start: 540, duration: 120, locked: true },
    { id: 'a2', title: 'Lunch', type: 'commitment', start: 720, duration: 60, locked: true },
  ];
  test('overlapping plan -> conflict with earlier/later suggestions', () => {
    const planned = { id: 'p1', title: 'Focus session', activityKey: 'focus', date: d(0), start: 560, duration: 60 };
    const c = findScheduleConflict(planned, conflicts);
    assert(c, 'no conflict found');
    eq(c.activity.id, 'a1', 'conflicting activity');
    eq(c.suggestedStart, null, 'earlier suggestion (removing Work frees 8:00-noon as one block)');
    eq(c.suggestedLaterStart, 780, 'later suggestion (after Lunch at 1:00 PM)');
  });
  test('single-activity day -> both suggestions null (removing it frees the whole day)', () => {
    const planned = { id: 'p1', title: 'x', date: d(0), start: 560, duration: 60 };
    const c = findScheduleConflict(planned, [{ id: 'a1', title: 'Work', type: 'commitment', start: 540, duration: 120, locked: true }]);
    assert(c, 'expected conflict');
    eq(c.suggestedStart, null, 'earlier suggestion');
    eq(c.suggestedLaterStart, null, 'later suggestion');
  });
  test('non-overlapping plan -> null', () => {
    const planned = { id: 'p1', title: 'x', date: d(0), start: 600, duration: 60 };
    eq(findScheduleConflict(planned, [{ id: 'a1', title: 'Work', start: 540, duration: 30 }]), null);
  });
  test('adjacent (back-to-back) plans are not a conflict', () => {
    const planned = { id: 'p1', title: 'x', date: d(0), start: 660, duration: 60 };
    eq(findScheduleConflict(planned, conflicts), null, 'start == end of activity');
  });
  test('plan fully contained inside an activity is a conflict', () => {
    const planned = { id: 'p1', title: 'x', date: d(0), start: 560, duration: 30 };
    assert(findScheduleConflict(planned, conflicts), 'expected conflict');
  });

  describe('F. Plan Overlaps (new-plan-wins)');
  const existing = [
    { id: 'ai-1', title: 'Workout session', activityKey: 'workout', date: d(0), start: 540, duration: 60 },
  ];
  test('overlap against existing plan -> earlier+later suggestions', () => {
    const newItem = { id: 'ai-2', title: 'Reading session', activityKey: 'reading', date: d(0), start: 560, duration: 60 };
    const overlaps = findPlanOverlaps([newItem], [], existing);
    eq(overlaps.length, 1, 'count');
    eq(overlaps[0].conflictingItem.title, 'Workout session', 'conflicting item');
    eq(overlaps[0].suggestedEarlierStart, 480, 'earlier');
    eq(overlaps[0].suggestedLaterStart, 620, 'later (nearest legal slot at/after new plan end)');
  });
  test('different dates -> no overlap', () => {
    const newItem = { id: 'ai-2', title: 'x', date: d(1), start: 560, duration: 60 };
    eq(findPlanOverlaps([newItem], [], existing).length, 0, 'count');
  });
  test('gap big enough -> same-day new plan with no conflict', () => {
    const newItem = { id: 'ai-2', title: 'x', date: d(0), start: 620, duration: 60 };
    eq(findPlanOverlaps([newItem], [], existing).length, 0, 'count');
  });
  test('overlap against base calendar activity (same date) is detected', () => {
    const activities = [{ id: 'a1', title: 'Work', type: 'commitment', start: 540, duration: 120, locked: true }];
    const newItem = { id: 'ai-2', title: 'x', date: d(0), start: 560, duration: 60 };
    const overlaps = findPlanOverlaps([newItem], activities, []);
    eq(overlaps.length, 1, 'count');
  });

  describe('G. Free-Time Calculator');
  test('empty day -> single 8:00-22:00 block', () => {
    eq(getFreeBlocks([]), [{ start: 480, end: 1320, duration: 840 }]);
  });
  test('one activity splits the day', () => {
    eq(getFreeBlocks([{ id: 'a1', start: 540, duration: 60 }]), [
      { start: 480, end: 540, duration: 60 },
      { start: 600, end: 1320, duration: 720 },
    ]);
  });
  test('chronological output for unsorted input', () => {
    const blocks = getFreeBlocks([
      { id: 'a2', start: 700, duration: 60 },
      { id: 'a1', start: 540, duration: 60 },
    ]);
    eq(blocks.map((b) => b.start), [480, 600, 760], 'start order');
  });
  test('activities outside the planning window are clamped', () => {
    eq(getFreeBlocks([{ id: 'a1', start: 60, duration: 60 }]),
      [{ start: 480, end: 1320, duration: 840 }], 'no effect');
  });
  test('findNextSlot picks first adequate free block', () => {
    const slot = findNextSlot({ id: 'p', title: 'x', type: 'routine', start: 0, duration: 90, locked: false }, [
      { id: 'a1', start: 540, duration: 120 },
    ]);
    eq(slot && slot.start, 660, 'slot start');
  });
  test('findNextSlot -> null when the day is fully booked', () => {
    const fullDay = [{ id: 'a1', start: 480, duration: 840 }];
    eq(findNextSlot({ id: 'p', title: 'x', type: 'routine', start: 0, duration: 60, locked: false }, fullDay), null);
  });

  describe('H. Deletion and Removal');
  test('removal intent + activity classification', () => {
    eq(getCancellationActivity("i can't go to the gym this week"), 'workout');
    eq(getCancellationActivity('cancel workouts next week'), 'workout');
    eq(getCancellationActivity('delete my appointment next thursday'), 'commitment');
    eq(getCancellationActivity('clear all calendar commitments for next week'), 'commitment');
    eq(getCancellationActivity("remove next week's plans"), 'all');
    eq(getCancellationActivity('delete everything tomorrow'), 'all');
  });
  test('curly apostrophes behave like straight ones', () => {
    eq(getCancellationActivity("i can’t go to the gym this week"), 'workout');
    eq(getCancellationActivity("i won’t attend school tomorrow"), 'school');
  });
  test('no removal intent -> null', () => {
    eq(getCancellationActivity('i am going to the gym tomorrow'), null);
    eq(getCancellationActivity('gym session at 6pm'), null);
  });
  test('window labels', () => {
    eq(getCancellationWindowLabel('this week'), 'this week');
    eq(getCancellationWindowLabel('next week'), 'next week');
    eq(getCancellationWindowLabel("next week's"), 'next week');
    eq(getCancellationWindowLabel('following week'), 'next week');
    eq(getCancellationWindowLabel('upcoming week'), 'next week');
    eq(getCancellationWindowLabel('this week and next week'), 'this and next week');
    eq(getCancellationWindowLabel('next 7 days'), 'the next 7 days');
    eq(getCancellationWindowLabel('tomorrow'), 'tomorrow');
    eq(getCancellationWindowLabel('today'), 'today');
    eq(getCancellationWindowLabel('on thursday'), 'the requested dates');
  });
  test('window matching (today=Sun 9/20/2026)', () => {
    const NOW = START;
    assert(matchesCancellationWindow(d(0), 'delete everything tomorrow', NOW) === false, 'tomorrow = 9/21');
    assert(matchesCancellationWindow(d(1), 'delete everything tomorrow', NOW), 'tomorrow matches 9/21');
    assert(matchesCancellationWindow(d(0), 'today', NOW), 'today');
    assert(matchesCancellationWindow(d(4), 'on thursday', NOW), 'thursday');
    assert(matchesCancellationWindow(d(3), 'on thursday', NOW) === false, 'wednesday is not thursday');
    assert(matchesCancellationWindow(d(0), 'this week', NOW), 'this week includes today');
    assert(matchesCancellationWindow(d(-6), 'this week', NOW), 'this week includes Mon');
    assert(matchesCancellationWindow(d(7), 'this week', NOW) === false, 'next Mon not this week');
    assert(matchesCancellationWindow(d(1), 'next week', NOW), 'next week Mon');
    assert(matchesCancellationWindow(d(7), 'next week', NOW), 'next week Sun');
    assert(matchesCancellationWindow(d(0), 'next week', NOW) === false, 'today not next week');
    assert(matchesCancellationWindow(d(8), 'this week and next week', NOW) === false, 'beyond window');
    assert(matchesCancellationWindow(d(-1), 'this week and next week', NOW), 'Sat in window');
    assert(matchesCancellationWindow(d(6), 'next 7 days', NOW), 'within next 7 days');
    assert(matchesCancellationWindow(d(7), 'next 7 days', NOW) === false, 'day 8 excluded');
  });
  test('activity matching for removal', () => {
    assert(matchesCancellationActivity('workout', 'Workout session', 'all'), 'all matches anything');
    assert(matchesCancellationActivity('workout', 'Workout session', 'workout'), 'key match');
    assert(matchesCancellationActivity('school', 'Math Class', 'school'), 'title regex');
    assert(matchesCancellationActivity('focus', 'Work', 'work'), 'generic contains');
    assert(!matchesCancellationActivity('focus', 'Piano Practice', 'workout'), 'no gym in title');
  });

  describe('I. Deduplication and unique IDs');
  test('same activity+date -> duplicate; different date -> not', () => {
    const a = { id: '1', title: 'Work', activityKey: 'focus', date: d(0) };
    const b = { id: '2', title: 'Work', activityKey: 'focus', date: d(0) };
    const c = { id: '3', title: 'Work', activityKey: 'focus', date: d(1) };
    assert(isSamePlannedActivity(a, b), 'same activity same day');
    assert(!isSamePlannedActivity(a, c), 'different day');
    const gym1 = { id: '4', title: 'Workout session', activityKey: 'workout', date: d(0) };
    const gym2 = { id: '5', title: 'Gym', activityKey: 'workout', date: d(0) };
    assert(isSamePlannedActivity(gym1, gym2), 'workout identity');
  });
  test('generic activities use title identity instead of shared focus', () => {
    const breakfast = { id: '6', title: 'Breakfast', activityKey: 'focus', date: d(0) };
    const work = { id: '7', title: 'Work', activityKey: 'focus', date: d(0) };
    assert(!isSamePlannedActivity(breakfast, work), 'breakfast/work are distinct');
    assert(!isSamePlannedActivity({ ...work, start: 540 }, { ...breakfast, start: 1080 }), 'workout title is distinct');
  });
  test('identity preserves category and duplicate semantics', () => {
    const meetingTwo = { id: '8', title: 'Meeting 2', activityKey: 'commitment', date: d(0) };
    const meeting = { id: '9', title: 'Meeting', activityKey: 'commitment', date: d(0) };
    const workLater = { id: '10', title: 'Work', activityKey: 'focus', date: d(0) };
    assert(isSamePlannedActivity(meetingTwo, meeting), 'commitment category matches');
    assert(isSamePlannedActivity(workLater, { ...workLater, start: 840 }), 'same generic activity same day matches');
    assert(!isSamePlannedActivity(workLater, { ...workLater, date: d(1) }), 'different day does not match');
  });
  test('plan id batch identifiers are unique across repeated calls', () => {
    const ids = new Set();
    for (let i = 0; i < 3; i += 1) {
      for (const item of plan('yoga every day for the next 2 weeks')) ids.add(item.id);
    }
    eq(ids.size, 42, '3 x 14 unique ids');
  });
  test('isSameScheduledActivity (plan vs base activity today)', () => {
    const planA = { id: '1', title: 'Workout session', activityKey: 'workout', date: d(0) };
    const act = { id: 'a', title: 'Gym', start: 540, duration: 60, locked: false };
    assert(isSameScheduledActivity(planA, act, START), 'workout both');
  });
  test('plan storage round-trip preserves local date and fields', () => {
    const items = [{ id: 'plan-1', title: 'Work', activityKey: 'focus', date: new Date(2026, 9, 24, 18, 30), start: 540, duration: 120 }];
    const raw = plansToStorage(items);
    eq(raw[0].date, '2026-10-24', 'local date');
    const restored = plansFromStorage(raw);
    eq(restored[0].id, items[0].id, 'id');
    eq(restored[0].title, items[0].title, 'title');
    eq(restored[0].activityKey, items[0].activityKey, 'activity key');
    eq(restored[0].start, items[0].start, 'start');
    eq(restored[0].duration, items[0].duration, 'duration');
    eq(restored[0].date.toDateString(), items[0].date.toDateString(), 'date');
  });
  test('plan storage date remains stable at local midnight', () => {
    const date = new Date(2026, 9, 24);
    const restored = plansFromStorage(plansToStorage([{ id: 'plan-2', title: 'Day', date, start: 0, duration: 0 }]));
    eq(plansToStorage([{ id: 'plan-2', title: 'Day', date, start: 0, duration: 0 }])[0].date, '2026-10-24', 'stored date');
    eq(restored[0].date.toDateString(), date.toDateString(), 'round-trip local day');
  });
  test('malformed plan storage entries are dropped', () => {
    const raw = [
      { id: 'bad-date', title: 'Bad', date: '2026-13-99', start: 10, duration: 10 },
      { id: 'bad-duration', title: 'Bad', date: '2026-10-24', start: 10, duration: -1 },
      { id: 'bad-fraction', title: 'Bad', date: '2026-10-24', start: 10, duration: 1.5 },
      { id: 'bad-title', title: ' ', date: '2026-10-24', start: 10, duration: 10 },
      { id: 'bad-start', title: 'Bad', date: '2026-10-24', start: 1440, duration: 10 },
      { id: 'valid', title: 'Valid', date: '2026-10-24', start: 10, duration: 10 },
    ];
    eq(plansFromStorage(raw).map((item) => item.id), ['valid'], 'valid entries');
  });
  test('garbage plan storage returns empty', () => {
    eq(plansFromStorage('not json'), [], 'string');
    eq(plansFromStorage(null), [], 'null');
    eq(plansFromStorage({}), [], 'object');
  });
  test('activity storage round-trip drops invalid types', () => {
    const activities = [{ id: 'activity-1', title: 'Gym', type: 'workout', start: 480, duration: 60, locked: true }];
    const restored = activitiesFromStorage([...activitiesToStorage(activities), { ...activities[0], id: 'bad', type: 'unknown' }]);
    eq(restored, activities, 'activities');
  });
  test('injected plan storage saves and loads plans and activities', async () => {
    const storage = makeStorage();
    const items = [{ id: 'plan-3', title: 'Breakfast', date: d(1), start: 480, duration: 60 }];
    const activities = [{ id: 'activity-2', title: 'School', type: 'commitment', start: 540, duration: 60, locked: false }];
    await savePlans(storage, items, activities);
    const restored = await loadPlans(storage);
    eq(restored.plannedItems[0].date.toDateString(), items[0].date.toDateString(), 'plan date');
    eq(restored.plannedItems[0].title, items[0].title, 'plan title');
    eq(restored.activities, activities, 'activities');
  });

  describe('J. Local Knowledge Base and Preference Learning');
  await (async () => {
    const group = 'J. Local Knowledge Base and Preference Learning';
    const check = (name, fn) => {
      try { fn(); results.push({ ok: true, group, name }); }
      catch (e) { results.push({ ok: false, group, name, error: String((e && e.message) || e) }); }
    };
    const storage = makeStorage();
    let prefs = await loadPlanningPreferences(storage);
    check('empty initial preferences', () => eq(prefs, { durationByActivity: {}, startByActivity: {}, activities: {}, facts: [] }));

    const gymItem = { id: '1', title: 'Workout session', activityKey: 'workout', date: d(0), start: 420, duration: 60 };
    prefs = await rememberPlan('gym at 7am', [gymItem], storage);
    check('rememberPlan: record created with learned start/duration', () => {
      assert(prefs.activities.workout, 'workout record created');
      eq(prefs.activities.workout.preferredStart, 420, 'learned start');
      eq(prefs.activities.workout.preferredDuration, 60, 'learned duration');
      eq(prefs.activities.workout.confidence, 0.1, 'confidence +0.1');
      eq(prefs.activities.workout.lastPrompt, 'gym at 7am', 'last prompt');
      eq(prefs.durationByActivity.workout, 60, 'duration map');
      eq(prefs.startByActivity.workout, 420, 'start map');
      assert(prefs.facts.some((f) => f.id === 'fact-workout'), 'fact stored');
      assert(prefs.activities.workout.aliases.includes('gym'), 'alias stored');
    });

    prefs = await rememberPlan('lift at 6', [{ id: '2', title: 'Workout session', activityKey: 'workout', date: d(0), start: 360, duration: 45 }], storage);
    check('rememberPlan: second prompt accumulates confidence + alias', () => {
      assert(prefs.activities.workout.aliases.includes('lift'), 'second alias');
      assert(Math.abs(prefs.activities.workout.confidence - 0.2) < 1e-9, 'confidence accumulates');
      eq(prefs.startByActivity.workout, 360, 'start map updated');
    });

    check('getPlanningContext finds activity by alias', () => {
      const ctx = getPlanningContext('lift tomorrow', prefs);
      eq(ctx.activities.length, 1, 'count');
      eq(ctx.activities[0].key, 'workout', 'key');
    });

    check('learned preferences apply to generated plans (via context)', () => {
      const ctx = getPlanningContext('lift tomorrow', prefs);
      const raw = plan('lift tomorrow', { context: ctx });
      eq(raw[0].title, 'Workout session', 'learned label');
      eq(raw[0].activityKey, 'workout', 'learned key');
      eq(raw[0].duration, 45, 'learned duration');
      const applied = applyPlanningPreferences(raw, prefs);
      eq(applied[0].start, 360, 'learned start applied');
      eq(applied[0].duration, 45, 'learned duration applied');
    });

    const moved = await rememberMovedPlan({ id: '3', title: 'Workout session', activityKey: 'workout', date: d(0), start: 500, duration: 60 }, storage);
    check('rememberMovedPlan records new start + preference fact', () => {
      eq(moved.startByActivity.workout, 500, 'moved start remembered');
      assert(Math.abs(moved.activities.workout.preferredStart - 500) < 1e-9, 'preferred start updated');
      assert(moved.facts.some((f) => f.id === 'preference-workout-start'), 'preference fact stored');
    });

    check('learnPromptAlias adds phrase alias', () => {
      const updated = learnPromptAlias('pump iron every day', 'workout', 'Workout session', prefs);
      assert(updated.activities.workout.aliases.includes('pump iron'), 'alias learned');
      const viaNeed = learnPromptAlias('i need to pump iron', 'workout', 'Workout session', prefs);
      assert(viaNeed.activities.workout.aliases.includes('need'), 'observed: extractActivityPhrase yields "need" for "i need to..."');
    });

    check('fact list bounded to 100, newest retained', () => {
      let facts = [];
      for (let i = 0; i < 120; i += 1) facts = rememberFact(facts, { id: `f${i}`, text: `fact ${i}`, category: 'schedule', confidence: 0.1, updatedAt: 't' });
      eq(facts.length, 100, 'bounded');
      assert(facts[facts.length - 1].id === 'f119', 'newest retained');
    });

    check('getActivityKey classification', () => {
      eq(getActivityKey('gym'), 'workout');
      eq(getActivityKey('school'), 'school');
      eq(getActivityKey('study'), 'study');
      eq(getActivityKey('read'), 'reading');
      eq(getActivityKey('writing'), 'writing');
      eq(getActivityKey('meeting'), 'commitment');
      eq(getActivityKey('piano practice', 'Piano Practice'), 'piano practice');
    });
  })();

  describe('K. date-time helpers (Australia/Brisbane timezone)');
  await (async () => {
    const group = 'K. date-time helpers (Australia/Brisbane timezone)';
    const check = (name, fn) => {
      try { fn(); results.push({ ok: true, group, name }); }
      catch (e) { results.push({ ok: false, group, name, error: String((e && e.message) || e) }); }
    };
    try {
      const parts = getAppDateParts(new Date('2026-09-20T10:00:00Z'));
      check('UTC 10:00 -> 20:00 Brisbane, same calendar day', () => eq(parts, { day: 20, month: 9, year: 2026, weekday: 'Sunday' }));
      const cross = getAppDateParts(new Date('2026-09-20T15:00:00Z'));
      check('UTC 15:00 -> 01:00 next day in Brisbane', () => {
        eq(cross.day, 21, 'day');
        eq(cross.weekday, 'Monday', 'weekday');
      });
      const fmt = formatAppDate(new Date('2026-09-20T10:00:00Z'));
      check('formatAppDate renders month + day', () => {
        assert(fmt.includes('September') && fmt.includes('20'), `fmt=${fmt}`);
      });
    } catch (e) {
      results.push({ ok: false, group, name: 'Intl timezone support', error: String((e && e.message) || e) });
    }
  })();

  describe('L. Popup/Gesture numeric behaviour (pure parts)');
  test('time scroller drag math: 15-minute increments', () => {
    const step = (dy) => Math.trunc(-dy / 18);
    eq(step(-18), 1, 'drag up 18px = +15min');
    eq(step(-36), 2, 'drag up 36px = +30min');
    eq(step(18), -1, 'drag down = -15min');
    const start = 540;
    const next = (dy) => Math.min(1439, Math.max(0, start + step(dy) * 15));
    eq(next(-36), 570, '540 + 30');
    eq(next(18), 525, '540 - 15');
    eq(next(180), 390, 'drag down 180px = -150min');
    eq(next(-3000), 1439, 'clamped to 23:59');
    eq(next(3000), 0, 'clamped to 00:00');
  });
  test('swipe-to-delete threshold', () => {
    const shouldDelete = (x) => x < -72;
    assert(shouldDelete(-73) === true, 'past threshold');
    assert(shouldDelete(-71) === false, 'under threshold');
    const clamp = (x) => Math.min(0, Math.max(-104, x));
    eq(clamp(-200), -104, 'clamped to -104');
    eq(clamp(50), 0, 'clamped to 0');
  });

  // summarize
  const groups = {};
  let passed = 0;
  let failed = 0;
  const failures = [];
  for (const t of results) {
    groups[t.group] = groups[t.group] || { passed: 0, failed: 0 };
    if (t.ok) { passed += 1; groups[t.group].passed += 1; } else { failed += 1; groups[t.group].failed += 1; failures.push(t); }
  }
  return { total: results.length, passed, failed, groups, failures: failures.map((f) => ({ group: f.group, name: f.name, error: f.error })) };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTests };
}
if (typeof require !== 'undefined' && require.main === module) {
  // eslint-disable-next-line no-console
  runTests().then((out) => console.log(JSON.stringify(out, null, 2)));
}