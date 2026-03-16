import OpenAI from 'openai';
import { formatEntryForModel } from '../history.js';
import { buildSystemPrompt, FREEFORM_PROMPT, PARALLEL_CRITIC_PROMPT, PROPOSER_PROMPT, SYNTHESISER_PROMPT } from '../prompts.js';
import type { GenerationParams, HistoryEntry, ModelClient, ModelRole, StreamResult } from '../types.js';

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
): Array<{ role: 'user' | 'assistant'; content: string }> {
  return history.map((entry) => ({
    role: entry.role,
    content: formatEntryForModel(entry),
  }));
}

function selectSystemPrompt(context: string, role: ModelRole): string {
  if (role === 'proposer') {
    return buildSystemPrompt(context, PROPOSER_PROMPT);
  }

  if (role === 'critic') {
    return buildSystemPrompt(context, PARALLEL_CRITIC_PROMPT);
  }

  if (role === 'synthesiser') {
    return buildSystemPrompt(context, SYNTHESISER_PROMPT);
  }

  return buildSystemPrompt(context, FREEFORM_PROMPT);
}

async function streamOnce(params: {
  client: OpenAI;
  model: string;
  history: HistoryEntry[];
  context: string;
  role: ModelRole;
  systemPrompt?: string;
  generationParams?: GenerationParams;
  signal: AbortSignal;
  write: (chunk: string) => void;
}): Promise<StreamResult> {
  const stream = await params.client.chat.completions.create(
    {
      model: params.model,
      stream: true,
      messages: [
        { role: 'system', content: params.systemPrompt ?? selectSystemPrompt(params.context, params.role) },
        ...buildCodexMessages(params.history),
      ],
      temperature: params.generationParams?.temperature,
      presence_penalty: params.generationParams?.presencePenalty,
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
  readonly id: string;
  readonly model: string;
  readonly displayName: string;
  private readonly client: OpenAI | null;
  private readonly initError: string | null;

  constructor(id: string, model: string, displayName: string, apiKey: string) {
    this.id = id;
    this.model = model;
    this.displayName = displayName;
    if (!apiKey) {
      this.client = null;
      this.initError = `${this.displayName} error: missing OPENAI_API_KEY`;
      return;
    }

    this.client = new OpenAI({ apiKey });
    this.initError = null;
  }

  async streamResponse(input: {
    history: HistoryEntry[];
    context: string;
    role: ModelRole;
    systemPrompt?: string;
    generationParams?: GenerationParams;
    signal: AbortSignal;
    write: (chunk: string) => void;
  }): Promise<StreamResult> {
    if (!this.client) {
      throw new Error(this.initError ?? `${this.displayName} error: client unavailable`);
    }

    try {
      return await streamOnce({
        client: this.client,
        model: this.model,
        history: input.history,
        context: input.context,
        role: input.role,
        systemPrompt: input.systemPrompt,
        generationParams: input.generationParams,
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
            systemPrompt: input.systemPrompt,
            generationParams: input.generationParams,
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

      throw new Error(`${this.displayName} error: ${getErrorMessage(error)}`);
    }
  }
}
