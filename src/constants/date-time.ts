export const APP_TIME_ZONE = 'Australia/Brisbane';

export type AppDateParts = {
  day: number;
  month: number;
  year: number;
  weekday: string;
};

export function getAppDateParts(date = new Date()): AppDateParts {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';

  return {
    day: Number(getPart('day')),
    month: Number(getPart('month')),
    year: Number(getPart('year')),
    weekday: getPart('weekday'),
  };
}

export function formatAppDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: APP_TIME_ZONE,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}
