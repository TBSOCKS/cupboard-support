import type { EvalCase } from './types';

export interface ActualOutputs {
  intent: string | null;
  agent: string | null;
  tools: string[];
  should_escalate: boolean | null;
  severity: string | null;
}

export interface GradeResult {
  intent_passed: boolean | null;
  agent_passed: boolean | null;
  tools_passed: boolean | null;
  escalation_passed: boolean | null;
  severity_passed: boolean | null;
  overall_passed: boolean;
}

/**
 * Grade a single case run.
 * Returns null for any dimension that wasn't asserted in the expected fields.
 * overall_passed is true only if every applicable assertion passed.
 */
export function gradeCase(
  expected: EvalCase,
  actual: ActualOutputs
): GradeResult {
  const intent_passed =
    expected.expected_intent !== null
      ? actual.intent === expected.expected_intent
      : null;

  const agent_passed =
    expected.expected_agent !== null
      ? actual.agent === expected.expected_agent
      : null;

  // Tools: order doesn't matter, but the SET must match exactly.
  const tools_passed =
    expected.expected_tools && expected.expected_tools.length >= 0
      ? arraysEqualAsSets(expected.expected_tools, actual.tools)
      : null;

  const escalation_passed =
    expected.expected_should_escalate !== null
      ? actual.should_escalate === expected.expected_should_escalate
      : null;

  const severity_passed =
    expected.expected_severity !== null
      ? actual.severity === expected.expected_severity
      : null;

  const dims = [
    intent_passed,
    agent_passed,
    tools_passed,
    escalation_passed,
    severity_passed,
  ];
  const applicable = dims.filter((d) => d !== null);
  const overall_passed =
    applicable.length > 0 && applicable.every((d) => d === true);

  return {
    intent_passed,
    agent_passed,
    tools_passed,
    escalation_passed,
    severity_passed,
    overall_passed,
  };
}

function arraysEqualAsSets<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const setA = new Set(a);
  for (const x of b) if (!setA.has(x)) return false;
  return true;
}

// ============================================================================
// COST CALCULATION
// ============================================================================
// Per million tokens, in cents (multiply by 100 from $/MTok)
const PRICING_CENTS_PER_MTOK = {
  haiku: { input: 100, output: 500 },
  sonnet: { input: 300, output: 1500 },
} as const;

export function computeCostCents(
  model: 'haiku' | 'sonnet',
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING_CENTS_PER_MTOK[model];
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}
