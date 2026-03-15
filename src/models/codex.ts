import process from 'node:process';
import OpenAI from 'openai';
import { CODEX_CONFIG } from '../config.js';
import { formatEntryForModel } from '../history.js';
import { buildSystemPrompt, CRITIC_PROMPT, FREEFORM_CODEX_PROMPT, PROPOSER_PROMPT } from '../prompts.js';
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

function buildCodexMessages(
  history: HistoryEntry[],
  role: ModelRole,
): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (history.length === 0) {
    return [];
  }

  const entries = [...history];
  const lastEntry = entries.at(-1);

  if (role === 'critic' && lastEntry?.role === 'assistant' && lastEntry.author === 'opus') {
    entries.pop();

    const priorUserIndex = [...entries]
      .map((entry, index) => ({ entry, index }))
      .reverse()
      .find(({ entry }) => entry.role === 'user')?.index;

    const critiquePrompt = `User question: ${
      priorUserIndex !== undefined ? entries[priorUserIndex].content : ''
    }\n\nOpus responded with:\n${lastEntry.content}\n\nPlease critique this response.`;

    if (priorUserIndex !== undefined) {
      entries[priorUserIndex] = {
        ...entries[priorUserIndex],
        content: critiquePrompt,
      };
    } else {
      entries.push({
        role: 'user',
        author: 'you',
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

  return buildSystemPrompt(context, FREEFORM_CODEX_PROMPT);
}

async function streamOnce(params: {
  client: OpenAI;
  model: string;
  history: HistoryEntry[];
  context: string;
  role: ModelRole;
  signal: AbortSignal;
  write: (chunk: string) => void;
}): Promise<StreamResult> {
  const stream = await params.client.chat.completions.create(
    {
      model: params.model,
      stream: true,
      messages: [
        { role: 'system', content: selectSystemPrompt(params.context, params.role) },
        ...buildCodexMessages(params.history, params.role),
      ],
    },
    { signal: params.signal },
  );

  let text = '';
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? '';
    if (!delta) {
      continue;
    }
    text += delta;
    params.write(delta);
  }

  return { text, cancelled: false, skipped: false };
}

export class CodexClient implements ModelClient {
  readonly model: string;
  private readonly client: OpenAI | null;
  private readonly initError: string | null;

  constructor() {
    this.model = CODEX_CONFIG.model;
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.client = null;
      this.initError = `${CODEX_CONFIG.displayName} error: missing OPENAI_API_KEY`;
      return;
    }

    this.client = new OpenAI({ apiKey });
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
      throw new Error(this.initError ?? `${CODEX_CONFIG.displayName} error: client unavailable`);
    }

    try {
      return await streamOnce({
        client: this.client,
        model: this.model,
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

      const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
      if (status === 429) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        try {
          return await streamOnce({
            client: this.client,
            model: this.model,
            history: input.history,
            context: input.context,
            role: input.role,
            signal: input.signal,
            write: input.write,
          });
        } catch (retryError) {
          if (isAbortError(retryError)) {
            return { text: '', cancelled: true, skipped: false };
          }
          throw retryError;
        }
      }

      throw new Error(`${CODEX_CONFIG.displayName} error: ${getErrorMessage(error)}`);
    }
  }
}
