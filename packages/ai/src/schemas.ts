import { z } from 'zod';

export const askOutputSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(
    z.object({
      excerptIndex: z.number().int().nonnegative(),
      quote: z.string().min(1),
    }),
  ),
  answered: z.boolean(),
});

export type AskOutput = z.infer<typeof askOutputSchema>;

export const motionDraftSchema = z.object({
  itemPosition: z.string(),
  text: z.string().min(1),
  moverName: z.string().optional(),
  seconderName: z.string().optional(),
  votes: z.array(
    z.object({
      name: z.string(),
      value: z.enum(['YES', 'NO', 'ABSTAIN', 'ABSENT', 'RECUSED']),
      confidence: z.number().min(0).max(1),
    }),
  ),
  transcriptStartSec: z.number().int().nonnegative(),
  flags: z.array(z.string()),
});

export const minutesDraftSchema = z.array(motionDraftSchema);
export type MotionDraft = z.infer<typeof motionDraftSchema>;

export type Excerpt = { index: number; text: string; pageId: string; documentTitle: string; pageNumber: number };
