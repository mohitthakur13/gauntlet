import process from 'node:process';
import Anthropic from '@anthropic-ai/sdk';
import { formatEntryForModel } from '../history.js';
import { buildSystemPrompt, CRITIC_PROMPT, FREEFORM_OPUS_PROMPT, PROPOSER_PROMPT } from '../prompts.js';
import type { HistoryEntry, ModelClient, ModelRole, StreamResult } from '../types.js';

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function buildOpusMessages(
  history: HistoryEntry[],
  role: ModelRole,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (history.length === 0) {
    return [];
  }

  const entries = [...history];
  const lastEntry = entries.at(-1);

  if (role === 'critic' && lastEntry?.role === 'assistant' && lastEntry.author === 'codex') {
    entries.pop();

    const priorUserIndex = [...entries]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.role === "user")?.index;

    const critiquePrompt = `User question: ${
      priorUserIndex !== undefined ? entries[priorUserIndex].content : ''
    }\n\nCodex responded with:\n${lastEntry.content}\n\nPlease critique this response.`;

    if (priorUserIndex !== undefined) {
      entries[priorUserIndex] = {
        ...entries[priorUserIndex],
        content: critiquePrompt,
      };
    } else {
      entries.push({
        role: "user",
        author: "you",
        content: critiquePrompt,
        timestamp: new Date().toISOString(),
      });
    }
  }

  return entries.map((entry) => ({
    role: entry.role,
    content: formatEntryForModel(entry),
  }));
}

function selectSystemPrompt(context: string, role: ModelRole): string {
  if (role === 'proposer') {
    return buildSystemPrompt(context, PROPOSER_PROMPT);
  }

  if (role === 'critic') {
    return buildSystemPrompt(context, CRITIC_PROMPT);
  }

  return buildSystemPrompt(context, FREEFORM_OPUS_PROMPT);
}

async function streamOnce(params: {
  client: Anthropic;
  history: HistoryEntry[];
  context: string;
  role: ModelRole;
  signal: AbortSignal;
  write: (chunk: string) => void;
}): Promise<StreamResult> {
  const stream = params.client.messages.stream(
    {
      model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-6',
      max_tokens: 4096,
      system: selectSystemPrompt(params.context, params.role),
      messages: buildOpusMessages(params.history, params.role),
    },
    { signal: params.signal },
  );

  let text = '';
  for await (const chunk of stream) {
    if (
      chunk.type !== 'content_block_delta' ||
      chunk.delta.type !== 'text_delta'
    ) {
      continue;
    }
    text += chunk.delta.text;
    params.write(chunk.delta.text);
  }

  return { text, cancelled: false, skipped: false };
}

export class OpusClient implements ModelClient {
  readonly model = 'claude-opus-4-5';
  private readonly client: Anthropic | null;
  private readonly initError: string | null;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      this.client = null;
      this.initError = 'Opus error: missing ANTHROPIC_API_KEY';
      return;
    }

    this.client = new Anthropic({ apiKey });
    this.initError = null;
  }

  async streamResponse(input: {
    history: HistoryEntry[];
    context: string;
    role: ModelRole;
    signal: AbortSignal;
    write: (chunk: string) => void;
  }): Promise<StreamResult> {
    if (!this.client) {
      throw new Error(this.initError ?? 'Opus error: client unavailable');
    }

    try {
      return await streamOnce({
        client: this.client,
        history: input.history,
        context: input.context,
        role: input.role,
        signal: input.signal,
        write: input.write,
      });
    } catch (error) {
      if (isAbortError(error)) {
        return { text: '', cancelled: true, skipped: false };
      }

      throw new Error(`Opus error: ${getErrorMessage(error)}`);
    }
  }
}
