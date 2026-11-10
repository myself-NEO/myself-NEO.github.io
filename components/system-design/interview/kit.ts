import type React from 'react';
import type { Track } from '../../../content/shared/types';
import type { BaseScript, Matcher } from '../../../content/system-design/interviewScript';
import type { InterviewSession, PhaseId } from '../../learn/interviews';
import type { useSaveTools } from '../../learn/saveTools';
import type { RubricDimension } from '../trackConfig';

// A track's mock interview: its phases, timings, rubric and phase screens. The shared
// simulator (./MockInterview.tsx) runs the clock, the clarifying-question chat, the
// self-evaluation and the attempt history; everything else comes from the kit.

export interface PhaseDef {
  id: PhaseId;
  label: string;
  short: string;
}

export interface PhaseGuide {
  goal: string;
  say: string;
  /** Generic hints, used when the breakdown has none for the phase. */
  hints: string[];
}

export interface PhaseProps<S extends BaseScript> {
  track: Track;
  slug: string;
  session: InterviewSession;
  script: S;
  tools: ReturnType<typeof useSaveTools>;
}

export interface InterviewKit<S extends BaseScript> {
  /** Phases in order, starting with 'clarify' and ending with 'evaluation'. */
  phases: PhaseDef[];
  /** Suggested minutes per phase id, for a 45- and a 60-minute interview. */
  budgets: Record<45 | 60, Record<string, number>>;
  guide: Partial<Record<PhaseId, PhaseGuide>>;
  rubric: RubricDimension[];
  parse: (markdown: string) => S;
  matcher: Matcher;
  /** "How this works" steps on the brief. */
  howItWorks: string[];
  clarifyPlaceholder: string;
  /** Reply when no scripted answer matches. */
  noMatchAnswer: string;
  /** Questions that ask the interviewer to make a design decision, and the reply to them. */
  designChoice: RegExp;
  designChoiceAnswer: string;
  /** Shown under the full list of clarifying questions (e.g. scope and exclusions). */
  clarifyAppendix?: (script: S) => { title: string; markdown: string } | undefined;
  checklistTitle: string;
  /** Every phase except 'clarify' and 'evaluation'. */
  renderPhase: (phase: PhaseId, props: PhaseProps<S>) => React.ReactNode;
  /** Extra content at the end of the self-evaluation (e.g. follow-up questions). */
  evaluationExtra?: (props: PhaseProps<S>) => React.ReactNode;
}
