import { minutesDraftSchema, type MotionDraft } from './schemas';

export type TranscriptSegment = { speaker: string; startSec: number; text: string };
export type RosterPerson = { id: string; fullName: string };

const VOTE = /^(yes|no|abstain|absent|recused)$/i;

export function extractMotionsLocal(input: {
  segments: TranscriptSegment[];
  items: { position: string; title: string }[];
  roster: RosterPerson[];
}): MotionDraft[] {
  const drafts: MotionDraft[] = [];
  for (let index = 0; index < input.segments.length; index += 1) {
    const segment = input.segments[index]!;
    const move = segment.text.match(/\bmove(?:s|d)? to\b(.{8,240})/i);
    if (!move) continue;
    const text = `I move to${move[1] ?? ''}`.replace(/\s+/g, ' ').trim();
    const flags: string[] = [];
    const mover = matchRoster(segment.speaker, input.roster);
    if (!mover) flags.push(`unmapped speaker: ${segment.speaker}`);
    const next = input.segments[index + 1];
    const seconder =
      next && /\bsecond\b/i.test(next.text) ? matchRoster(next.speaker, input.roster) : undefined;
    if (next && /\bsecond\b/i.test(next.text) && !seconder) {
      flags.push(`unmapped speaker: ${next.speaker}`);
    }
    const votes = input.segments
      .slice(index + 1, index + 12)
      .filter((row) => VOTE.test(row.text.trim()))
      .map((row) => {
        const person = matchRoster(row.speaker, input.roster);
        if (!person) flags.push(`unmapped speaker: ${row.speaker}`);
        return {
          name: row.speaker,
          value: row.text.trim().toUpperCase() as MotionDraft['votes'][number]['value'],
          confidence: person ? 0.95 : 0.4,
        };
      });
    const item =
      input.items.find((candidate) => segment.text.includes(candidate.position)) ?? input.items[0];
    drafts.push({
      itemPosition: item?.position ?? '',
      text,
      moverName: segment.speaker,
      seconderName: seconder ? next?.speaker : undefined,
      votes,
      transcriptStartSec: segment.startSec,
      flags,
    });
  }
  return minutesDraftSchema.parse(drafts);
}

function matchRoster(name: string, roster: RosterPerson[]): RosterPerson | undefined {
  const needle = name.trim().toLowerCase();
  return roster.find((person) => person.fullName.trim().toLowerCase() === needle);
}
