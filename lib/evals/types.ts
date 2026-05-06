import type { AgentName } from '@/types';

export type EvalMode = 'triage_only' | 'full_suite';

export type ExpectedSeverity = 'low' | 'moderate' | 'high' | 'critical';

export interface EvalCase {
  id: string;
  name: string;
  description: string | null;
  customer_message: string;
  previous_assistant_message: string | null;
  previous_agent: AgentName | null;
  expected_intent: string | null;
  expected_agent: AgentName | null;
  expected_tools: string[];
  expected_should_escalate: boolean | null;
  expected_severity: ExpectedSeverity | null;
  context_order_number: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface EvalRunResult {
  id: string;
  case_id: string;
  suite_run_id: string;
  mode: EvalMode;
  actual_intent: string | null;
  actual_agent: string | null;
  actual_tools: string[];
  actual_should_escalate: boolean | null;
  actual_severity: string | null;
  actual_reply: string | null;
  actual_confidence: number | null;
  intent_passed: boolean | null;
  agent_passed: boolean | null;
  tools_passed: boolean | null;
  escalation_passed: boolean | null;
  severity_passed: boolean | null;
  overall_passed: boolean;
  input_tokens: number;
  output_tokens: number;
  cost_cents: number;
  duration_ms: number | null;
  error_message: string | null;
  created_at: string;
}

export interface EvalSuiteRun {
  id: string;
  mode: EvalMode;
  tag_filter: string | null;
  prompt_version: string | null;
  notes: string | null;
  total_cases: number;
  passed_cases: number;
  intent_accuracy: number | null;
  agent_accuracy: number | null;
  tools_accuracy: number | null;
  escalation_accuracy: number | null;
  severity_accuracy: number | null;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost_cents: number;
  duration_ms: number | null;
  started_at: string;
  completed_at: string | null;
}
