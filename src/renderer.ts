import process from 'node:process';
import type { Mode, ModelName } from './types.js';

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

export class Renderer {
  private readonly useColor = process.stdout.isTTY;

  color(text: string, color: ColorName): string {
    if (!this.useColor) {
      return text;
    }

    return `${ANSI[color]}${text}${ANSI.reset}`;
  }

  print(text = ''): void {
    process.stdout.write(`${text}\n`);
  }

  write(text: string): void {
    process.stdout.write(text);
  }

  banner(contextPath: string | null, codexModel: string, opusModel: string, mode: Mode): void {
    this.print('┌─────────────────────────────────────────┐');
    this.print('│  critique                    ctrl+c/q   │');
    this.print('└─────────────────────────────────────────┘');
    this.print(`Context: ${contextPath ?? 'none'}`);
    this.print(`Models:  Codex (${codexModel})  ·  Opus (${opusModel})`);
    this.print(`Mode:    ${mode}`);
    this.separator();
  }

  separator(): void {
    this.print(this.color('──────────────────────────────────────────', 'dim'));
  }

  promptLabel(mode: Mode): string {
    return `[${mode}] You: `;
  }

  modelHeader(model: ModelName): string {
    const label = model === 'codex' ? this.color('Codex', 'cyan') : this.color('Opus', 'purple');
    const line = model === 'codex'
      ? '──────────────────────────────────────'
      : '───────────────────────────────────────';
    return `${label} ${this.color(line, 'dim')}`;
  }

  info(message: string): void {
    this.print(this.color(message, 'yellow'));
  }

  error(message: string): void {
    this.print(this.color(message, 'red'));
  }
}
