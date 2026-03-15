import readline, { type Interface as ReadlineInterface } from 'node:readline';
import process from 'node:process';
import { loadContext } from './context.js';
import { parseCommand, resolveLoadedInput, saveHistory } from './commands.js';
import { ConversationHistory } from './history.js';
import { Renderer } from './renderer.js';
import type { ContextResolver, Mode, ModelClient } from './types.js';

type ReplState = 'prompt' | 'streaming' | 'confirming';

function question(rl: ReadlineInterface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

export async function startRepl(params: {
  cwd: string;
  resolver: ContextResolver;
  codex: ModelClient;
  opus: ModelClient;
}): Promise<void> {
  const renderer = new Renderer();
  const history = new ConversationHistory();
  let context = await loadContext(params.resolver);
  let mode: Mode = 'both';
  let state: ReplState = 'prompt';
  let abortController: AbortController | null = null;
  let exiting = false;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: process.stdin.isTTY,
  });

  const confirm = async (prompt: string): Promise<string> => {
    state = 'confirming';
    try {
      return (await question(rl, prompt)).trim();
    } finally {
      state = 'prompt';
    }
  };

  const saveIfRequested = async (): Promise<boolean> => {
    if (!history.hasUnsavedChanges()) {
      return true;
    }

    const answer = await confirm(`Session has ${history.count()} turns. Save before exiting? [y/n/path] `);
    if (!answer || answer.toLowerCase() === 'n') {
      return true;
    }

    try {
      const savedPath = await saveHistory(history, params.cwd, answer.toLowerCase() === 'y' ? undefined : answer);
      renderer.info(`Saved session to ${savedPath}`);
      return true;
    } catch (error) {
      renderer.error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  };

  const handleExit = async (): Promise<void> => {
    if (exiting) {
      return;
    }
    exiting = true;
    const okayToExit = await saveIfRequested();
    if (!okayToExit) {
      exiting = false;
      return;
    }
    rl.close();
  };

  rl.on('SIGINT', () => {
    if (state === 'streaming') {
      abortController?.abort();
      return;
    }
    void handleExit();
  });

  rl.on('close', () => {
    process.stdout.write('\n');
    process.exit(0);
  });

  renderer.banner(context.path, params.codex.model, params.opus.model, mode);

  while (true) {
    state = 'prompt';
    const rawInput = await question(rl, renderer.promptLabel(mode));
    const input = rawInput.trim();
    if (!input) {
      continue;
    }

    const command = parseCommand(input, {
      cwd: params.cwd,
      mode,
      context,
      historyLength: history.count(),
      codexModel: params.codex.model,
      opusModel: params.opus.model,
    });

    if (command.type !== 'noop') {
      if (command.type === 'mode') {
        mode = command.mode;
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'info') {
        renderer.info(command.message);
        continue;
      }

      if (command.type === 'context-reload') {
        context = await loadContext(params.resolver);
        renderer.info(context.path ? `Context reloaded: ${context.path}` : 'No context loaded.');
        continue;
      }

      if (command.type === 'clear') {
        const answer = await confirm('Clear history? [y/n] ');
        if (answer.toLowerCase() === 'y') {
          history.clear();
          renderer.info('History cleared.');
        }
        continue;
      }

      if (command.type === 'save') {
        try {
          const savedPath = await saveHistory(history, params.cwd, command.path);
          renderer.info(`Saved session to ${savedPath}`);
        } catch (error) {
          renderer.error(`Failed to save session: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }

      if (command.type === 'exit') {
        await handleExit();
        return;
      }

      if (command.type === 'input') {
        try {
          const loaded = await resolveLoadedInput(params.cwd, command.display);
          await runTurn(loaded, mode);
        } catch (error) {
          renderer.error(`Failed to load file: ${error instanceof Error ? error.message : String(error)}`);
        }
        continue;
      }
    }

    await runTurn(rawInput, mode);
  }

  async function runTurn(message: string, currentMode: Mode): Promise<void> {
    history.addUserMessage(message);

    if (currentMode === 'codex' || currentMode === 'both') {
      const codexText = await streamModel('codex', params.codex);
      if (codexText === null) {
        renderer.separator();
        return;
      }
      history.addAssistantMessage('codex', codexText);
    }

    if (currentMode === 'opus' || currentMode === 'both') {
      const opusText = await streamModel('opus', params.opus);
      if (opusText === null) {
        renderer.separator();
        return;
      }
      history.addAssistantMessage('opus', opusText);
    }

    renderer.separator();
  }

  async function streamModel(label: 'codex' | 'opus', client: ModelClient): Promise<string | null> {
    renderer.print('');
    renderer.print(renderer.modelHeader(label));

    abortController = new AbortController();
    state = 'streaming';

    try {
      const result = await client.streamResponse({
        history: history.getEntries(),
        context: context.content,
        signal: abortController.signal,
        write: (chunk) => renderer.write(chunk),
      });
      renderer.print('');

      if (result.cancelled) {
        renderer.info('[cancelled]');
        return null;
      }

      return result.text.trimEnd();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith(`${label === 'codex' ? 'Codex' : 'Opus'} error:`)) {
        if (error.message.includes('429')) {
          renderer.error(`${error.message} — retrying in 5s failed`);
        } else {
          renderer.error(error.message);
        }
      } else {
        renderer.error(`${label === 'codex' ? 'Codex' : 'Opus'} error: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    } finally {
      abortController = null;
      state = 'prompt';
    }
  }
}
