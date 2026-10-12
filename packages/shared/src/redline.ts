export type DiffOp = { type: 'eq' | 'ins' | 'del'; text: string };
export type SectionDiff = { section: string; ops: DiffOp[] };

const HEADING = /^(?:section\s+\d+\b.*|#{1,3}\s+.+)$/i;
const SHOUT = /^[A-Z][A-Z0-9 ,.'/-]{3,}$/;

export function splitSections(text: string): { section: string; body: string }[] {
  const lines = text.split(/\r?\n/);
  const sections: { section: string; body: string }[] = [];
  let current = { section: 'Document', body: '' };
  for (const line of lines) {
    const trimmed = line.trim();
    if ((HEADING.test(trimmed) || SHOUT.test(trimmed)) && trimmed.length < 120) {
      if (current.body.trim() || sections.length === 0) sections.push(current);
      current = { section: line.trim().replace(/^#+\s+/, ''), body: '' };
    } else {
      current.body += `${line}\n`;
    }
  }
  sections.push(current);
  return sections.filter((section) => section.section !== 'Document' || section.body.trim());
}

function tokenize(text: string): string[] {
  return text.split(/(\s+)/).filter((part) => part.length > 0);
}

/** Word diff, bounded so a long packet cannot lock the request. */
export function wordDiff(from: string, to: string): DiffOp[] {
  const a = tokenize(from);
  const b = tokenize(to);
  if (a.length * b.length > 250_000) {
    return [
      { type: 'del', text: from },
      { type: 'ins', text: to },
    ];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const ops: DiffOp[] = [];
  const push = (type: DiffOp['type'], text: string) => {
    const last = ops[ops.length - 1];
    if (last && last.type === type) last.text += text;
    else ops.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push('eq', a[i]!);
      i += 1;
      j += 1;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      push('del', a[i]!);
      i += 1;
    } else {
      push('ins', b[j]!);
      j += 1;
    }
  }
  while (i < a.length) {
    push('del', a[i]!);
    i += 1;
  }
  while (j < b.length) {
    push('ins', b[j]!);
    j += 1;
  }
  return ops;
}

export function sectionDiff(fromText: string, toText: string): SectionDiff[] {
  const fromSections = splitSections(fromText);
  const toSections = splitSections(toText);
  const toByName = new Map(toSections.map((section) => [section.section, section]));
  const seen = new Set<string>();
  const diffs: SectionDiff[] = [];
  for (const section of fromSections) {
    seen.add(section.section);
    const next = toByName.get(section.section);
    diffs.push({
      section: section.section,
      ops: wordDiff(section.body.trim(), next?.body.trim() ?? ''),
    });
  }
  for (const section of toSections) {
    if (seen.has(section.section)) continue;
    diffs.push({ section: section.section, ops: wordDiff('', section.body.trim()) });
  }
  return diffs;
}
