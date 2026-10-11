export function localSummary(staffReport: string): string {
  const sentences = staffReport
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, 2).join(' ');
}
