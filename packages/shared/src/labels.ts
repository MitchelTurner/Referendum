export function chartLabel(code: string, startsAt: Date, timeZone = 'America/Anchorage'): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(startsAt);
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(startsAt)
    .replace(':', '');
  return `${code} · ${date} · ${time}`;
}

export const MODULE_KEYS = [
  'MEETINGS',
  'ASK',
  'NOTIFY',
  'PARTICIPATION',
  'LIVE',
  'MINUTES_AI',
  'BOARDS',
  'RECORDS',
  'SERVICES',
  'EMBEDS',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export function moduleActive(
  row: { enabled: boolean; startsAt?: Date | null; endsAt?: Date | null },
  now = new Date(),
): boolean {
  if (!row.enabled) return false;
  if (row.startsAt && row.startsAt > now) return false;
  if (row.endsAt && row.endsAt < now) return false;
  return true;
}

/** SPEC-GAP: lead time for "no staff report" inbox rows is operational, not a code citation. */
export const STAFF_REPORT_LEAD_DAYS = 7;

/** SPEC-GAP: review nudge SLA until a government configures one. */
export const REVIEW_SLA_DAYS = 3;

export const OPEN_DATA_SCHEMA_VERSION = '1';

const PUBLIC_MEETING_STATUSES = new Set([
  'NOTICED',
  'PACKET_PUBLISHED',
  'IN_PROGRESS',
  'RECESSED',
  'ADJOURNED',
  'MINUTES_DRAFT',
  'MINUTES_ADOPTED',
  'CANCELLED',
]);

export function isPublicMeetingStatus(status: string): boolean {
  return PUBLIC_MEETING_STATUSES.has(status);
}
