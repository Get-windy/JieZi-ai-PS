import { t } from '../i18n/index.js';

const DEFAULT_TAGLINE = t('tagline.default');

const HOLIDAY_TAGLINES = {
  newYear: t('tagline.68'),
  lunarNewYear: t('tagline.69'),
  christmas: t('tagline.70'),
  eid: t('tagline.71'),
  diwali: t('tagline.72'),
  easter: t('tagline.73'),
  hanukkah: t('tagline.74'),
  halloween: t('tagline.75'),
  thanksgiving: t('tagline.76'),
  valentines: t('tagline.77'),
} as const;

const TAGLINES: string[] = [
  t('tagline.0'),
  t('tagline.1'),
  t('tagline.2'),
  t('tagline.3'),
  t('tagline.4'),
  t('tagline.5'),
  t('tagline.6'),
  t('tagline.7'),
  t('tagline.8'),
  t('tagline.9'),
  t('tagline.10'),
  t('tagline.11'),
  t('tagline.12'),
  t('tagline.13'),
  t('tagline.14'),
  t('tagline.15'),
  t('tagline.16'),
  t('tagline.17'),
  t('tagline.18'),
  t('tagline.19'),
  t('tagline.20'),
  t('tagline.21'),
  t('tagline.22'),
  t('tagline.23'),
  t('tagline.24'),
  t('tagline.25'),
  t('tagline.26'),
  t('tagline.27'),
  t('tagline.28'),
  t('tagline.29'),
  t('tagline.30'),
  t('tagline.31'),
  t('tagline.32'),
  t('tagline.33'),
  t('tagline.34'),
  t('tagline.35'),
  t('tagline.36'),
  t('tagline.37'),
  t('tagline.38'),
  t('tagline.39'),
  t('tagline.40'),
  t('tagline.41'),
  t('tagline.42'),
  t('tagline.43'),
  t('tagline.44'),
  t('tagline.45'),
  t('tagline.46'),
  t('tagline.47'),
  t('tagline.48'),
  t('tagline.49'),
  t('tagline.50'),
  t('tagline.51'),
  t('tagline.52'),
  t('tagline.53'),
  t('tagline.54'),
  t('tagline.55'),
  t('tagline.56'),
  t('tagline.57'),
  t('tagline.58'),
  t('tagline.59'),
  t('tagline.60'),
  t('tagline.61'),
  t('tagline.62'),
  t('tagline.63'),
  t('tagline.64'),
  t('tagline.65'),
  t('tagline.66'),
  t('tagline.67'),
  HOLIDAY_TAGLINES.newYear,
  HOLIDAY_TAGLINES.lunarNewYear,
  HOLIDAY_TAGLINES.christmas,
  HOLIDAY_TAGLINES.eid,
  HOLIDAY_TAGLINES.diwali,
  HOLIDAY_TAGLINES.easter,
  HOLIDAY_TAGLINES.hanukkah,
  HOLIDAY_TAGLINES.halloween,
  HOLIDAY_TAGLINES.thanksgiving,
  HOLIDAY_TAGLINES.valentines,
];

type HolidayRule = (date: Date) => boolean;

const DAY_MS = 24 * 60 * 60 * 1000;

function utcParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth(),
    day: date.getUTCDate(),
  };
}

const onMonthDay =
  (month: number, day: number): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return parts.month === month && parts.day === day;
  };

const onSpecificDates =
  (dates: Array<[number, number, number]>, durationDays = 1): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    return dates.some(([year, month, day]) => {
      if (parts.year !== year) {
        return false;
      }
      const start = Date.UTC(year, month, day);
      const current = Date.UTC(parts.year, parts.month, parts.day);
      return current >= start && current < start + durationDays * DAY_MS;
    });
  };

const inYearWindow =
  (
    windows: Array<{
      year: number;
      month: number;
      day: number;
      duration: number;
    }>,
  ): HolidayRule =>
  (date) => {
    const parts = utcParts(date);
    const window = windows.find((entry) => entry.year === parts.year);
    if (!window) {
      return false;
    }
    const start = Date.UTC(window.year, window.month, window.day);
    const current = Date.UTC(parts.year, parts.month, parts.day);
    return current >= start && current < start + window.duration * DAY_MS;
  };

const isFourthThursdayOfNovember: HolidayRule = (date) => {
  const parts = utcParts(date);
  if (parts.month !== 10) {
    return false;
  } // November
  const firstDay = new Date(Date.UTC(parts.year, 10, 1)).getUTCDay();
  const offsetToThursday = (4 - firstDay + 7) % 7; // 4 = Thursday
  const fourthThursday = 1 + offsetToThursday + 21; // 1st + offset + 3 weeks
  return parts.day === fourthThursday;
};

const HOLIDAY_RULES = new Map<string, HolidayRule>([
  [HOLIDAY_TAGLINES.newYear, onMonthDay(0, 1)],
  [
    HOLIDAY_TAGLINES.lunarNewYear,
    onSpecificDates(
      [
        [2025, 0, 29],
        [2026, 1, 17],
        [2027, 1, 6],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.eid,
    onSpecificDates(
      [
        [2025, 2, 30],
        [2025, 2, 31],
        [2026, 2, 20],
        [2027, 2, 10],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.diwali,
    onSpecificDates(
      [
        [2025, 9, 20],
        [2026, 10, 8],
        [2027, 9, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.easter,
    onSpecificDates(
      [
        [2025, 3, 20],
        [2026, 3, 5],
        [2027, 2, 28],
      ],
      1,
    ),
  ],
  [
    HOLIDAY_TAGLINES.hanukkah,
    inYearWindow([
      { year: 2025, month: 11, day: 15, duration: 8 },
      { year: 2026, month: 11, day: 5, duration: 8 },
      { year: 2027, month: 11, day: 25, duration: 8 },
    ]),
  ],
  [HOLIDAY_TAGLINES.halloween, onMonthDay(9, 31)],
  [HOLIDAY_TAGLINES.thanksgiving, isFourthThursdayOfNovember],
  [HOLIDAY_TAGLINES.valentines, onMonthDay(1, 14)],
  [HOLIDAY_TAGLINES.christmas, onMonthDay(11, 25)],
]);

function isTaglineActive(tagline: string, date: Date): boolean {
  const rule = HOLIDAY_RULES.get(tagline);
  if (!rule) {
    return true;
  }
  return rule(date);
}

export interface TaglineOptions {
  env?: NodeJS.ProcessEnv;
  random?: () => number;
  now?: () => Date;
}

export function activeTaglines(options: TaglineOptions = {}): string[] {
  if (TAGLINES.length === 0) {
    return [DEFAULT_TAGLINE];
  }
  const today = options.now ? options.now() : new Date();
  const filtered = TAGLINES.filter((tagline) => isTaglineActive(tagline, today));
  return filtered.length > 0 ? filtered : TAGLINES;
}

export function pickTagline(options: TaglineOptions = {}): string {
  const env = options.env ?? process.env;
  const override = env?.OPENCLAW_TAGLINE_INDEX;
  if (override !== undefined) {
    const parsed = Number.parseInt(override, 10);
    if (!Number.isNaN(parsed) && parsed >= 0) {
      const pool = TAGLINES.length > 0 ? TAGLINES : [DEFAULT_TAGLINE];
      return pool[parsed % pool.length];
    }
  }
  const pool = activeTaglines(options);
  const rand = options.random ?? Math.random;
  const index = Math.floor(rand() * pool.length) % pool.length;
  return pool[index];
}

export { TAGLINES, HOLIDAY_RULES, DEFAULT_TAGLINE };
