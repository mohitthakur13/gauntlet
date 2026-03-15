import process from 'node:process';
import OpenAI from 'openai';
import { formatEntryForModel } from '../history.js';
import type { HistoryEntry, ModelClient, StreamResult } from '../types.js';

const SYSTEM_SUFFIX =
  'You are a senior software engineer. Respond with precise, implementable answers.';

function buildSystemPrompt(context: string): string {
  return context ? `${context}\n\n${SYSTEM_SUFFIX}` : SYSTEM_SUFFIX;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function streamOnce(params: {
  client: OpenAI;
  model: string;
  history: HistoryEntry[];
  context: string;
  signal: AbortSignal;
  write: (chunk: string) => void;
}): Promise<StreamResult> {
  const stream = await params.client.chat.completions.create(
    {
      model: params.model,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(params.context) },
        ...params.history.map((entry) => ({
          role: entry.role,
          content: formatEntryForModel(entry),
        })),
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
    this.model = process.env.CODEX_MODEL ?? 'o3';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.client = null;
      this.initError = 'Codex error: missing OPENAI_API_KEY';
      return;
    }

    this.client = new OpenAI({ apiKey });
    this.initError = null;
  }

  async streamResponse(input: {
    history: HistoryEntry[];
    context: string;
    signal: AbortSignal;
    write: (chunk: string) => void;
  }): Promise<StreamResult> {
    if (!this.client) {
      throw new Error(this.initError ?? 'Codex error: client unavailable');
    }

    try {
      return await streamOnce({
        client: this.client,
        model: this.model,
        history: input.history,
        context: input.context,
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

      throw new Error(`Codex error: ${getErrorMessage(error)}`);
    }
  }
}
