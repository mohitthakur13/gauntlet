import process from 'node:process';
import { getModelDisplayName } from './config.js';
import type { ModelClient, ModelId, ReplState } from './types.js';

type ColorName = 'reset' | 'dim' | 'red' | 'yellow' | 'cyan' | 'purple' | 'white';

const ANSI: Record<ColorName, string> = {
  reset: '\u001b[0m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
  cyan: '\u001b[36m',
  purple: '\u001b[35m',
  white: '\u001b[37m',
};

function useColor(): boolean {
  return process.stdout.isTTY;
}

function color(text: string, colorName: ColorName): string {
  if (!useColor()) {
    return text;
  }

  return `${ANSI[colorName]}${text}${ANSI.reset}`;
}

function getDisplayName(id: ModelId): string {
  try {
    return getModelDisplayName(id);
  } catch {
    return id;
  }
}

export function renderPrompt(state: ReplState): string {
  if (state.isStreaming) {
    const label = state.streamingTarget ? `streaming ${state.streamingTarget}...` : 'streaming...';
    return `${color(`[${label}]`, 'dim')} ${color('›', 'white')} `;
  }

  if (state.debate) {
    return renderDebatePrompt(state);
  }

  if (state.mode === 'single' && state.singleModelId) {
    return `${color(`[${getDisplayName(state.singleModelId)}]`, 'cyan')} ${color('›', 'white')} `;
  }

  const proposer = getDisplayName(state.proposerId);
  const critics = state.criticIds.map((criticId) => getDisplayName(criticId));
  const criticLabel = critics.length <= 2
    ? critics.join(', ')
    : `${critics.slice(0, 2).join(', ')} +${critics.length - 2}`;

  return `${color(`[${proposer} → ${criticLabel}]`, 'cyan')} ${color('›', 'white')} `;
}

export function renderCriticHeader(
  displayName: string,
  mode: 'parallel' | 'sequential',
  position?: number,
  total?: number,
): string {
  const label = mode === 'parallel'
    ? `${displayName} [parallel]`
    : `${displayName} [${position}/${total}]`;
  const line = Math.max(1, 40 - label.length);
  return `\n${color(label, 'cyan')} ${color('─'.repeat(line), 'dim')}\n`;
}

export function renderSynthesiserHeader(displayName: string): string {
  const label = `${displayName} (synthesising)`;
  const line = Math.max(1, 40 - label.length);
  return `\n${color(label, 'cyan')} ${color('─'.repeat(line), 'dim')}\n`;
}

export function renderDebateHeader(
  displayName: string,
  round: number,
  maxRounds: number,
): string {
  const roundLabel = maxRounds > 0 ? `round ${round}/${maxRounds}` : `round ${round}`;
  const label = `${displayName} [${roundLabel}]`;
  const line = Math.max(1, 40 - label.length);
  return `\n${color(label, 'cyan')} ${color('─'.repeat(line), 'dim')}\n`;
}

export function renderVerdictHeader(displayName: string): string {
  const label = `${displayName} (verdict)`;
  const line = Math.max(1, 40 - label.length);
  return `\n${color(label, 'purple')} ${color('─'.repeat(line), 'dim')}\n`;
}

export function renderDebatePrompt(state: ReplState): string {
  const debate = state.debate;
  if (!debate) {
    return `${color('[debate]', 'purple')} ${color('›', 'white')} `;
  }

  const label = debate.auto
    ? `debate:${debate.stance} auto ${debate.currentRound}/${debate.maxRounds}`
    : `debate:${debate.stance} ${debate.currentRound}`;
  return `${color(`[${label}]`, 'purple')} ${color('›', 'white')} `;
}

export class Renderer {
  color(text: string, colorName: ColorName): string {
    return color(text, colorName);
  }

  print(text = ''): void {
    process.stdout.write(`${text}\n`);
  }

  write(text: string): void {
    process.stdout.write(text);
  }

  banner(contextPath: string | null, clients: ModelClient[], state: ReplState): void {
    this.print('┌─────────────────────────────────────────┐');
    this.print('│  gauntlet                    ctrl+c/q   │');
    this.print('└─────────────────────────────────────────┘');
    this.print(`Context: ${contextPath ?? 'none'}`);
    this.print(`Models:  ${clients.map((client) => `${client.displayName} (${client.model})`).join('  ·  ')}`);
    this.print(`Mode:    ${state.mode}`);
    this.separator();
  }

  separator(): void {
    this.print(this.color('──────────────────────────────────────────', 'dim'));
  }

  renderPrompt(state: ReplState, clients: Map<ModelId, ModelClient>): string {
    void clients;
    return renderPrompt(state);
  }

  renderModelHeader(displayName: string): string {
    const line = Math.max(1, 40 - displayName.length);
    return `${this.color(displayName, 'cyan')} ${this.color('─'.repeat(line), 'dim')}`;
  }

  renderCriticHeader(
    displayName: string,
    mode: 'parallel' | 'sequential',
    position?: number,
    total?: number,
  ): string {
    return renderCriticHeader(displayName, mode, position, total);
  }

  renderSynthesiserHeader(displayName: string): string {
    return renderSynthesiserHeader(displayName);
  }

  renderDebateHeader(displayName: string, round: number, maxRounds: number): string {
    return renderDebateHeader(displayName, round, maxRounds);
  }

  renderVerdictHeader(displayName: string): string {
    return renderVerdictHeader(displayName);
  }

  renderDebatePrompt(state: ReplState): string {
    return renderDebatePrompt(state);
  }

  info(message: string): void {
    this.print(this.color(message, 'yellow'));
  }

  error(message: string): void {
    this.print(this.color(message, 'red'));
  }

  warn(message: string): void {
    this.print(this.color(message, 'yellow'));
  }
}
