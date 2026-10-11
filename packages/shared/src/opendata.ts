import { z } from 'zod';
import { OPEN_DATA_SCHEMA_VERSION } from './labels';

export const openMeetingSchema = z.object({
  schemaVersion: z.literal(OPEN_DATA_SCHEMA_VERSION),
  id: z.string(),
  government: z.string(),
  governmentShortName: z.string(),
  body: z.string(),
  bodyCode: z.string(),
  label: z.string(),
  startsAt: z.string(),
  location: z.string().nullable(),
  status: z.string(),
  packetPublishedAt: z.string().nullable(),
});

export const openItemSchema = z.object({
  schemaVersion: z.literal(OPEN_DATA_SCHEMA_VERSION),
  id: z.string(),
  meetingId: z.string(),
  position: z.string(),
  title: z.string(),
  type: z.string(),
  status: z.string(),
  matterId: z.string().nullable(),
});

export const openMatterSchema = z.object({
  schemaVersion: z.literal(OPEN_DATA_SCHEMA_VERSION),
  id: z.string(),
  government: z.string(),
  title: z.string(),
  caseNumber: z.string().nullable(),
  kind: z.string(),
  events: z.array(
    z.object({
      label: z.string(),
      occurredAt: z.string().nullable(),
      projectedFor: z.string().nullable(),
      order: z.number(),
    }),
  ),
});

export const openVoteSchema = z.object({
  schemaVersion: z.literal(OPEN_DATA_SCHEMA_VERSION),
  motionId: z.string(),
  itemId: z.string(),
  meetingId: z.string(),
  person: z.string(),
  value: z.string(),
  motion: z.string(),
  result: z.string().nullable(),
});

export type OpenMeeting = z.infer<typeof openMeetingSchema>;
export type OpenItem = z.infer<typeof openItemSchema>;
export type OpenMatter = z.infer<typeof openMatterSchema>;
export type OpenVote = z.infer<typeof openVoteSchema>;
