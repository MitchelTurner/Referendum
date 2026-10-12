export type TranscriptSegment = { speaker: string; startSec: number; text: string };

/**
 * First adapter is chosen here (M6 / §17): `deepgram` when DEEPGRAM_API_KEY is set,
 * otherwise `fixture`. Deepgram is the production pick for diarization plus timestamps;
 * a contract is still required before it is the hosted default.
 */
export interface TranscriptionProvider {
  readonly name: string;
  transcribe(input: { audioUrl?: string; transcriptText?: string }): Promise<TranscriptSegment[]>;
}

class FixtureTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'fixture';
  async transcribe(input: { transcriptText?: string }): Promise<TranscriptSegment[]> {
    if (!input.transcriptText) return [];
    return input.transcriptText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        const match = line.match(/^\[(\d+):(\d+)\]\s+([^:]+):\s*(.*)$/);
        if (!match) return { speaker: 'Unknown', startSec: index * 5, text: line };
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        return { speaker: match[3]!.trim(), startSec: minutes * 60 + seconds, text: match[4]!.trim() };
      });
  }
}

class DeepgramTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'deepgram';
  constructor(private readonly apiKey: string) {}
  async transcribe(input: { audioUrl?: string }): Promise<TranscriptSegment[]> {
    if (!input.audioUrl) return [];
    const response = await fetch('https://api.deepgram.com/v1/listen?diarize=true&punctuate=true&utterances=true', {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: input.audioUrl }),
    });
    if (!response.ok) {
      throw new Error(`Deepgram transcription failed (${response.status})`);
    }
    const payload = (await response.json()) as {
      results?: { utterances?: { speaker?: number; start?: number; transcript?: string }[] };
    };
    return (payload.results?.utterances ?? []).map((utterance) => ({
      speaker: `Speaker ${utterance.speaker ?? 0}`,
      startSec: Math.round(utterance.start ?? 0),
      text: utterance.transcript ?? '',
    }));
  }
}

export function createTranscriptionProvider(): TranscriptionProvider {
  const choice = process.env.TRANSCRIPTION_PROVIDER ?? 'fixture';
  if (choice === 'deepgram' && process.env.DEEPGRAM_API_KEY) {
    return new DeepgramTranscriptionProvider(process.env.DEEPGRAM_API_KEY);
  }
  return new FixtureTranscriptionProvider();
}
