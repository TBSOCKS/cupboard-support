import type { EvalCase, EvalMode } from './types';

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
 *
 * Returns null for any dimension that wasn't asserted in the expected fields,
 * OR that isn't applicable to the run mode. In triage-only mode, the runner
 * doesn't execute specialists, so it can't observe tool calls or compute
 * severity - we skip those dimensions rather than failing them.
 *
 * overall_passed is true only if every applicable assertion passed.
 */
export function gradeCase(
  expected: EvalCase,
  actual: ActualOutputs,
  mode: EvalMode = 'full_suite'
): GradeResult {
  const intent_passed =
    expected.expected_intent !== null
      ? actual.intent === expected.expected_intent
      : null;

  const agent_passed =
    expected.expected_agent !== null
      ? actual.agent === expected.expected_agent
      : null;

  // Tools and severity are only observable in full_suite mode. In triage_only
  // mode, the specialist doesn't run, so we skip these assertions.
  const tools_passed =
    mode === 'triage_only'
      ? null
      : expected.expected_tools && expected.expected_tools.length >= 0
      ? arraysEqualAsSets(expected.expected_tools, actual.tools)
      : null;

  // Escalation grading is mode-aware. In triage-only mode, the specialist
  // doesn't run, so it can't make an escalation decision based on tool data.
  // We give partial credit: if expected=true AND the case routes to a
  // specialist, we treat the escalation assertion as "deferred to specialist"
  // (null), since triage-only can't observe that decision.
  let escalation_passed: boolean | null = null;
  if (expected.expected_should_escalate !== null) {
    if (mode === 'triage_only') {
      const routesToSpecialist =
        expected.expected_agent !== null &&
        expected.expected_agent !== 'human' &&
        expected.expected_agent !== 'general';
      // Only assert escalation if the specialist isn't expected to make the
      // decision (i.e., this is a triage-level escalation case).
      if (routesToSpecialist && expected.expected_should_escalate === true) {
        escalation_passed = null;
      } else {
        escalation_passed = actual.should_escalate === expected.expected_should_escalate;
      }
    } else {
      escalation_passed = actual.should_escalate === expected.expected_should_escalate;
    }
  }

  const severity_passed =
    mode === 'triage_only'
      ? null
      : expected.expected_severity !== null
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
