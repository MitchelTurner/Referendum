export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new ApiError(typeof body.message === 'string' ? body.message : 'Request failed', response.status, body);
  }
  return body as T;
}

export type Region = {
  id: string;
  name: string;
  slug: string;
  governments: {
    id: string;
    name: string;
    shortName: string;
    colorToken: string;
    modules: string[];
    bodies: { id: string; name: string; code: string }[];
  }[];
};

export type CalendarMeeting = {
  id: string;
  startsAt: string;
  location: string | null;
  status: string;
  label: string;
  body: { id: string; name: string; code: string };
  government: { id: string; name: string; shortName: string; colorToken: string };
  itemCount: number;
};

export type LiveRow = {
  meetingId: string;
  label: string;
  status: string;
  government: string;
  colorToken: string;
  body: string;
  currentItemId: string | null;
  currentItemTitle: string | null;
  timer: { running: boolean; durationSec: number; remainingMs: number; runningSince: string | null };
};

export function moduleOn(region: Region | undefined, key: string): boolean {
  return region?.governments.some((government) => government.modules.includes(key)) ?? false;
}
