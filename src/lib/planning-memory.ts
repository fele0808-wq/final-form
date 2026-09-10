import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PlannedItem } from '@/lib/planner';

const STORAGE_KEY = 'final-form-planning-preferences-v1';

export type PlanningPreferences = {
  durationByActivity: Record<string, number>;
  startByActivity: Record<string, number>;
};

const emptyPreferences = (): PlanningPreferences => ({
  durationByActivity: {},
  startByActivity: {},
});

export async function loadPlanningPreferences() {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY);
    if (!saved) return emptyPreferences();
    const parsed = JSON.parse(saved) as Partial<PlanningPreferences>;
    return {
      durationByActivity: parsed.durationByActivity ?? {},
      startByActivity: parsed.startByActivity ?? {},
    };
  } catch {
    return emptyPreferences();
  }
}

export async function rememberPlan(prompt: string, items: PlannedItem[]) {
  const preferences = await loadPlanningPreferences();
  const key = getActivityKey(prompt, items[0]?.title);
  if (!key || !items.length) return preferences;

  const nextPreferences: PlanningPreferences = {
    durationByActivity: {
      ...preferences.durationByActivity,
      [key]: items[0].duration,
    },
    startByActivity: {
      ...preferences.startByActivity,
      [key]: items[0].start,
    },
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
  };
  await savePlanningPreferences(nextPreferences);
  return nextPreferences;
}

export function applyPlanningPreferences(items: PlannedItem[], preferences: PlanningPreferences) {
  if (!items.length) return items;
  const key = getActivityKey(items[0].title, items[0].title);
  if (!key) return items;
  const preferredDuration = preferences.durationByActivity[key];
  const preferredStart = preferences.startByActivity[key];
  return items.map((item) => ({
    ...item,
    duration: preferredDuration ?? item.duration,
    start: preferredStart ?? item.start,
  }));
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
  return fallback?.toLowerCase().trim() || null;
}
