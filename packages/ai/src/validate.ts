import { askOutputSchema, type AskOutput, type Excerpt } from './schemas';

export function validateAskOutput(
  raw: unknown,
  excerpts: Excerpt[],
): { ok: true; value: AskOutput } | { ok: false; errors: string[] } {
  const parsed = askOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }
  const errors: string[] = [];
  if (parsed.data.answered && parsed.data.citations.length === 0) {
    errors.push('Answered responses need at least one citation');
  }
  if (!parsed.data.answered && parsed.data.citations.length > 0) {
    errors.push('Unanswered responses cannot cite excerpts');
  }
  for (const citation of parsed.data.citations) {
    const excerpt = excerpts[citation.excerptIndex];
    if (!excerpt) {
      errors.push(`Citation index ${citation.excerptIndex} is invalid`);
      continue;
    }
    if (!excerpt.text.includes(citation.quote)) {
      errors.push('Quote is not a substring of the excerpt');
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: parsed.data };
}
