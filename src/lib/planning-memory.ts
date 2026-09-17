import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PlannedItem } from '@/lib/planner';

const STORAGE_KEY = 'final-form-planning-preferences-v1';

export type PlanningPreferences = {
  durationByActivity: Record<string, number>;
  startByActivity: Record<string, number>;
  activities: Record<string, ActivityMemory>;
  facts: PlanningFact[];
};

export type ActivityMemory = {
  key: string;
  label: string;
  aliases: string[];
  preferredDuration?: number;
  preferredStart?: number;
  confidence: number;
  lastPrompt?: string;
  updatedAt: string;
};

export type PlanningFact = {
  id: string;
  text: string;
  category: 'schedule' | 'preference' | 'correction';
  confidence: number;
  updatedAt: string;
};

const emptyPreferences = (): PlanningPreferences => ({
  durationByActivity: {},
  startByActivity: {},
  activities: {},
  facts: [],
});

export async function loadPlanningPreferences() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyPreferences();
    const parsed = JSON.parse(saved) as Partial<PlanningPreferences>;
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

export async function rememberPlan(prompt: string, items: PlannedItem[]) {
  const preferences = await loadPlanningPreferences();
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

  const nextPreferences: PlanningPreferences = {
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
  await savePlanningPreferences(nextPreferences);
  return nextPreferences;
}

export async function rememberMovedPlan(item: PlannedItem) {
  const preferences = await loadPlanningPreferences();
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
  await savePlanningPreferences(nextPreferences);
  return nextPreferences;
}

export function applyPlanningPreferences(items: PlannedItem[], preferences: PlanningPreferences) {
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

export function getPlanningContext(prompt: string, preferences: PlanningPreferences) {
  const normalizedPrompt = prompt.toLowerCase();
  const relevantActivities = Object.values(preferences.activities).filter((activity) => (
    activity.aliases.some((alias) => normalizedPrompt.includes(alias.toLowerCase()))
  ));
  const relevantFacts = preferences.facts.filter((fact) => (
    relevantActivities.some((activity) => fact.text.toLowerCase().includes(activity.label.toLowerCase()))
  ));
  return { activities: relevantActivities, facts: relevantFacts };
}

export function learnPromptAlias(prompt: string, activityKey: string, label: string, preferences: PlanningPreferences) {
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

async function savePlanningPreferences(preferences: PlanningPreferences) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Planning still works if device storage is unavailable.
  }
}

function getActivityKey(promptOrTitle: string, fallback?: string) {
  const source = (fallback && !/focus session/i.test(fallback) ? fallback : promptOrTitle).toLowerCase();
  if (/school|class|lecture|lesson/.test(source)) return 'school';
  if (/workout|training|exercise|gym/.test(source)) return 'workout';
  if (/study|learn|course|exam/.test(source)) return 'study';
  if (/read|reading|book/.test(source)) return 'reading';
  if (/write|writing|essay/.test(source)) return 'writing';
  if (/meeting|call|appointment/.test(source)) return 'commitment';
  return fallback?.toLowerCase().trim() || extractActivityPhrase(promptOrTitle) || null;
}

function extractActivityPhrase(prompt: string) {
  return prompt
    .toLowerCase()
    .replace(/\b(?:i(?:'m| am)?|ive got|i've got|i have|i need to|i want to|have|please|can you|could you|schedule|plan|add|put)\b/g, '')
    .replace(/\b(?:after|before|at|by|around|from|to|until|every|this|next|following|upcoming|today|tomorrow)\b.*$/g, '')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/g, '')
    .replace(/\b\d+\s*(?:minutes?|mins?|hours?|hrs?|days?|weeks?)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean).map((value) => value.toLowerCase().trim())));
}

function rememberFact(facts: PlanningFact[], fact: PlanningFact) {
  return [...facts.filter((existing) => existing.id !== fact.id), fact].slice(-100);
}
