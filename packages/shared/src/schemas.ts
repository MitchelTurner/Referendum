import { z } from 'zod';

export const itemTypeSchema = z.enum([
  'CONSENT',
  'PUBLIC_HEARING',
  'NEW_BUSINESS',
  'UNFINISHED_BUSINESS',
  'REPORT',
  'PRESENTATION',
  'CORRESPONDENCE',
  'OTHER',
]);
export type ItemType = z.infer<typeof itemTypeSchema>;

export const staffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const totpSchema = z.object({
  challengeToken: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
});

export const magicLinkSchema = z.object({
  email: z.string().email(),
});

export const magicVerifySchema = z.object({
  token: z.string().min(10),
});

export const smsStartSchema = z.object({
  phone: z.string().min(7),
});

export const smsVerifySchema = z.object({
  phone: z.string().min(7),
  code: z.string().regex(/^\d{6}$/),
});

export const bodySchema = z.object({
  governmentId: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1).max(12),
  defaultLocation: z.string().optional(),
  speakerSeconds: z.number().int().positive().max(3600).optional(),
});

export const meetingSchema = z.object({
  bodyId: z.string().min(1),
  startsAt: z.string().datetime(),
  location: z.string().optional(),
  status: z
    .enum([
      'DRAFT',
      'NOTICED',
      'PACKET_PUBLISHED',
      'IN_PROGRESS',
      'RECESSED',
      'ADJOURNED',
      'MINUTES_DRAFT',
      'MINUTES_ADOPTED',
      'CANCELLED',
    ])
    .optional(),
  noticePostedAt: z.string().datetime().nullable().optional(),
  videoProvider: z.enum(['youtube', 'mux']).optional(),
  videoRef: z.string().optional(),
});

export const agendaItemSchema = z.object({
  meetingId: z.string().min(1),
  matterId: z.string().optional(),
  position: z.string().min(1),
  sortKey: z.number().int(),
  type: itemTypeSchema,
  title: z.string().min(1),
  status: z.enum(['DRAFT', 'IN_REVIEW', 'READY', 'PUBLISHED', 'HEARD', 'CONTINUED', 'WITHDRAWN']).optional(),
  commentsCloseAt: z.string().datetime().nullable().optional(),
  testimonyOpen: z.boolean().optional(),
  reviewChain: z.array(z.string()).optional(),
});

export const reviewDecisionSchema = z.object({
  status: z.enum(['APPROVED', 'RETURNED', 'SKIPPED', 'IN_PROGRESS']),
  note: z.string().optional(),
});

export const commentSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(300).optional(),
  position: z.enum(['SUPPORT', 'OPPOSE', 'NEUTRAL']).optional(),
  body: z.string().min(1).max(8000),
  turnstileToken: z.string().min(1),
});

export const speakerSchema = z.object({
  displayName: z.string().min(1).max(200),
  mode: z.enum(['IN_PERSON', 'PHONE']),
  phone: z.string().optional(),
  turnstileToken: z.string().min(1),
});

export const subscriptionSchema = z.object({
  kind: z.enum(['MATTER', 'BODY', 'ADDRESS', 'DIGEST', 'TOPIC']),
  matterId: z.string().optional(),
  bodyId: z.string().optional(),
  address: z.string().optional(),
  radiusFt: z.number().int().positive().max(52800).optional(),
  channels: z.array(z.enum(['EMAIL', 'SMS'])).min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  topic: z.string().optional(),
  lang: z.enum(['EN', 'TL', 'ES']).optional(),
});

export const askSchema = z.object({
  question: z.string().min(3).max(1000),
  matterId: z.string().optional(),
  lang: z.enum(['EN', 'TL', 'ES']).optional(),
});

export const motionSchema = z.object({
  agendaItemId: z.string().min(1),
  text: z.string().min(1),
  moverPersonId: z.string().optional(),
  seconderPersonId: z.string().optional(),
});

export const votesSchema = z.object({
  votes: z.array(
    z.object({
      personId: z.string(),
      value: z.enum(['YES', 'NO', 'ABSTAIN', 'ABSENT', 'RECUSED']),
    }),
  ),
});

export const conflictSchema = z.object({
  agendaItemId: z.string().min(1),
  personId: z.string().min(1),
  statement: z.string().min(1),
  chairRuling: z.enum(['participate', 'recuse']).optional(),
});

export const timerSchema = z.object({
  action: z.enum(['start', 'pause', 'reset']),
  durationSec: z.number().int().positive().max(3600).optional(),
});

export const currentItemSchema = z.object({
  agendaItemId: z.string().min(1),
});

export const noticeRuleSchema = z.object({
  governmentId: z.string().min(1),
  bodyId: z.string().nullable().optional(),
  itemType: itemTypeSchema.nullable().optional(),
  daysBefore: z.number().int().min(0).max(365).nullable().optional(),
  codeCitation: z.string().nullable().optional(),
  mailedRadiusFt: z.number().int().positive().nullable().optional(),
});

export const hideCommentSchema = z.object({
  reason: z.string().min(3),
});

export const seatSchema = z.object({
  bodyId: z.string().min(1),
  label: z.string().min(1),
  appointingGovernmentId: z.string().optional(),
  appointmentNotes: z.string().optional(),
});

export const termSchema = z.object({
  seatId: z.string().min(1),
  personId: z.string().min(1),
  startsOn: z.string().datetime(),
  endsOn: z.string().datetime().nullable().optional(),
  isChair: z.boolean().optional(),
});

export const personSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
});

export const applicationSchema = z.object({
  seatId: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  statement: z.string().min(1),
});

export const importSchema = z.object({
  governmentId: z.string().min(1),
  source: z.enum(['primegov', 'civicplus_agendacenter', 'pdf_folder']),
  fixture: z.string().optional(),
});

export const staffQuestionSchema = z.object({
  question: z.string().min(1),
});

export const motionPatchSchema = z.object({
  text: z.string().min(1).optional(),
  result: z.enum(['carried', 'failed', 'withdrawn']).optional(),
  moverPersonId: z.string().nullable().optional(),
  seconderPersonId: z.string().nullable().optional(),
});
