import { CONVERGENCE_CHECK_PROMPT } from './prompts.js';
import type { DebateState, DebateStance, HistoryEntry, ModelClient } from './types.js';

export interface ConvergenceResult {
  shouldStop: boolean;
  method: 'structural-only' | 'judge' | 'none';
  signals: string[];
  judgeVerdict?: 'CONVERGED' | 'DIVERGENT';
}

const AGREEMENT_MARKERS = [
  'i agree',
  'i concede',
  'no remaining disagreement',
  'we have converged',
  "we've converged",
  'fully agree',
  'nothing to add',
];

function extractSection(text: string, heading: string): string {
  const regex = new RegExp(`##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##|$)`, 'i');
  const match = text.match(regex);
  return match?.[1]?.trim() ?? '';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function checkStructuralConvergence(
  entry1: string,
  entry2: string,
  stance: DebateStance,
): { signalCount: number; signals: string[] } {
  const signals: string[] = [];
  const lower1 = entry1.toLowerCase();
  const lower2 = entry2.toLowerCase();

  const hasAgreement1 = AGREEMENT_MARKERS.some((marker) => lower1.includes(marker));
  const hasAgreement2 = AGREEMENT_MARKERS.some((marker) => lower2.includes(marker));
  if (hasAgreement1 && hasAgreement2) {
    signals.push('mutual-agreement');
  }

  const attackHeading = stance === 'aggressive' ? 'Attack' : 'Challenge';
  const attack1 = countWords(extractSection(entry1, attackHeading));
  const attack2 = countWords(extractSection(entry2, attackHeading));
  if (attack1 < 50 && attack2 < 50) {
    signals.push('shrinking-attacks');
  }

  const buildHeading = stance === 'aggressive' ? 'Concession' : 'Build';
  const build1 = countWords(extractSection(entry1, buildHeading));
  const build2 = countWords(extractSection(entry2, buildHeading));
  if (build1 > attack1 && build2 > attack2) {
    signals.push('concession-dominance');
  }

  return { signalCount: signals.length, signals };
}

export async function checkConvergence(
  firstEntry: HistoryEntry,
  secondEntry: HistoryEntry,
  debate: DebateState,
  judgeClient: ModelClient,
  signal: AbortSignal,
): Promise<ConvergenceResult> {
  if (!debate.auto) {
    return { shouldStop: false, method: 'none', signals: [] };
  }

  const structural = checkStructuralConvergence(firstEntry.content, secondEntry.content, debate.stance);
  const isPeriodicCheck = debate.currentRound % 3 === 0;
  const shouldInvokeJudge = structural.signalCount >= 1 || isPeriodicCheck;

  if (!shouldInvokeJudge) {
    return {
      shouldStop: false,
      method: 'structural-only',
      signals: structural.signals,
    };
  }

  const result = await judgeClient.streamResponse({
    history: [
      {
        role: 'user',
        content: `Response A:\n${firstEntry.content}\n\nResponse B:\n${secondEntry.content}`,
      },
    ],
    context: '',
    role: 'judge',
    systemPrompt: CONVERGENCE_CHECK_PROMPT,
    signal,
    write: () => {},
  });

  if (result.cancelled) {
    return {
      shouldStop: false,
      method: 'judge',
      signals: structural.signals,
    };
  }

  const verdict = result.text.trim().toUpperCase();
  const judgeVerdict = verdict === 'CONVERGED' ? 'CONVERGED' : 'DIVERGENT';
  return {
    shouldStop: judgeVerdict === 'CONVERGED',
    method: 'judge',
    signals: structural.signals,
    judgeVerdict,
  };
}
