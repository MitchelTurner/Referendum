import Anthropic from '@anthropic-ai/sdk';
import { ASK_SYSTEM_PROMPT, MINUTES_SYSTEM_PROMPT, SUMMARY_SYSTEM_PROMPT, TRANSLATION_SYSTEM_PROMPT } from './prompts';
import { askOutputSchema, minutesDraftSchema, type AskOutput, type Excerpt, type MotionDraft } from './schemas';
import { localAnswer } from './answer';
import { extractMotionsLocal, type RosterPerson, type TranscriptSegment } from './minutes';
import { localSummary } from './summarize';
import { validateAskOutput } from './validate';

export type AiCall = {
  feature: string;
  model: string;
  promptText: string;
  outputText: string;
  inputTokens?: number;
  outputTokens?: number;
};

function modelName(): string | null {
  const model = process.env.ANTHROPIC_MODEL;
  return model && model.trim().length > 0 ? model : null;
}

async function complete(system: string, user: string, maxTokens: number): Promise<{ text: string; call: AiCall } | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = modelName();
  if (!key || !model) return null;
  const client = new Anthropic({ apiKey: key });
  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
  return {
    text,
    call: {
      feature: 'anthropic',
      model,
      promptText: `${system}\n\n${user}`,
      outputText: text,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    },
  };
}

function parseJson(text: string): unknown {
  const start = text.indexOf('{');
  const list = text.indexOf('[');
  const useList = list >= 0 && (start < 0 || list < start);
  const slice = useList ? text.slice(list) : text.slice(start);
  const end = useList ? slice.lastIndexOf(']') : slice.lastIndexOf('}');
  return JSON.parse(slice.slice(0, end + 1));
}

export async function answerQuestion(
  question: string,
  excerpts: Excerpt[],
): Promise<{ output: AskOutput; call: AiCall }> {
  const packed = excerpts
    .map((excerpt, index) => `[${index}] ${excerpt.documentTitle} p.${excerpt.pageNumber}\n${excerpt.text}`)
    .join('\n\n');
  const user = `Question: ${question}\n\nExcerpts:\n${packed}`;
  const remote = await complete(ASK_SYSTEM_PROMPT, user, 800);
  if (!remote) {
    const output = localAnswer(question, excerpts);
    const check = validateAskOutput(output, excerpts);
    if (!check.ok) {
      return {
        output: {
          answer: 'The packet excerpts do not contain an answer to that question.',
          citations: [],
          answered: false,
        },
        call: {
          feature: 'ask',
          model: 'local',
          promptText: user,
          outputText: JSON.stringify(output),
        },
      };
    }
    return {
      output: check.value,
      call: { feature: 'ask', model: 'local', promptText: user, outputText: JSON.stringify(check.value) },
    };
  }
  let lastErrors: string[] = [];
  let prompt = user;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const round = attempt === 0 ? remote : await complete(ASK_SYSTEM_PROMPT, prompt, 800);
    if (!round) break;
    try {
      const parsed = askOutputSchema.parse(parseJson(round.text));
      const check = validateAskOutput(parsed, excerpts);
      if (check.ok) return { output: check.value, call: { ...round.call, feature: 'ask' } };
      lastErrors = check.errors;
    } catch (error) {
      lastErrors = [error instanceof Error ? error.message : 'invalid json'];
    }
    prompt = `${user}\n\nThe previous output failed validation: ${lastErrors.join('; ')}. Fix the JSON.`;
  }
  return {
    output: {
      answer: 'The packet excerpts do not contain an answer to that question.',
      citations: [],
      answered: false,
    },
    call: {
      feature: 'ask',
      model: remote.call.model,
      promptText: prompt,
      outputText: lastErrors.join('; '),
    },
  };
}

export async function summarizeReport(staffReport: string): Promise<{ summary: string; call: AiCall }> {
  const remote = await complete(SUMMARY_SYSTEM_PROMPT, staffReport, 300);
  if (!remote) {
    const summary = localSummary(staffReport);
    return { summary, call: { feature: 'summary', model: 'local', promptText: staffReport, outputText: summary } };
  }
  return { summary: remote.text, call: { ...remote.call, feature: 'summary' } };
}

export async function translateSummary(
  summary: string,
  lang: 'TL' | 'ES',
): Promise<{ text: string; call: AiCall } | null> {
  const remote = await complete(TRANSLATION_SYSTEM_PROMPT, `Language: ${lang}\n\n${summary}`, 400);
  if (!remote) return null;
  return { text: remote.text, call: { ...remote.call, feature: `translation.${lang}` } };
}

export async function draftMinutes(input: {
  segments: TranscriptSegment[];
  items: { position: string; title: string }[];
  roster: RosterPerson[];
}): Promise<{ drafts: MotionDraft[]; call: AiCall }> {
  const local = extractMotionsLocal(input);
  const remote = await complete(MINUTES_SYSTEM_PROMPT, JSON.stringify(input), 2000);
  if (!remote) {
    return {
      drafts: local,
      call: { feature: 'minutes', model: 'local', promptText: JSON.stringify(input), outputText: JSON.stringify(local) },
    };
  }
  try {
    const drafts = minutesDraftSchema.parse(parseJson(remote.text));
    return { drafts, call: { ...remote.call, feature: 'minutes' } };
  } catch {
    return { drafts: local, call: { ...remote.call, feature: 'minutes' } };
  }
}
