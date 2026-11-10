import type { TrackId } from '../../content/shared/types';
import type { RubricId } from '../learn/interviews';
import type { NoteKindOption } from '../learn/notebookParts';
import { RUBRIC as HLD_RUBRIC } from '../../content/system-design/hld/landing';
import { RUBRIC as LLD_RUBRIC } from '../../content/system-design/lld/landing';

// What differs between the HLD and LLD versions of the shared practice pages
// (mock-interview list, revision notebook, progress, problem extras).

export interface RubricDimension {
  id: RubricId;
  label: string;
  strong: string;
  weak: string;
}

export interface SystemDesignTrackConfig {
  /** Short title of the other System Design track ("tracked separately from …"). */
  other: string;
  rubric: RubricDimension[];
  /** What a learner answers in lessons, as in “knowledge-check answers”. */
  answers: string;
  /** Intro of the mock-interview list. */
  interviewIntro: string;
  /** Intro of the revision notebook. */
  notebookIntro: string;
  noteKinds: NoteKindOption[];
  noteTitlePlaceholder: string;
  noteBodyLabel: string;
  /** The notebook has a Mermaid diagrams tab (diagrams saved from lessons, or drawn there). */
  diagrams: boolean;
  problemNotePlaceholder: string;
}

const MISTAKE: NoteKindOption = {
  id: 'mistake',
  label: 'Common mistake',
  template: '**What I did:** …\n\n**Why it’s wrong:** …\n\n**Do this instead:** …',
};

const HLD: SystemDesignTrackConfig = {
  other: 'LLD',
  rubric: HLD_RUBRIC,
  answers: 'knowledge-check and drill',
  interviewIntro:
    'Each mock interview walks you through the nine steps against the clock: ask the interviewer clarifying questions, write requirements and APIs, estimate with the calculator, draw your design in Mermaid, pick deep dives, then compare with the reference and rate yourself. Answers are scripted per problem and matched to your questions by keywords; scores are your own self-assessment.',
  notebookIntro:
    'Bookmarked lessons and sections, saved diagrams, code and interview questions, your notes, trade-offs, formulas and mistakes, and the problems you want to revisit. Difficult lessons, missed quiz answers and weak mock-interview areas are collected automatically. Everything is stored in this browser.',
  noteKinds: [
    { id: 'note', label: 'Note' },
    {
      id: 'tradeoff',
      label: 'Trade-off',
      template: '**Decision:** …\n\n**Option A:** … — choose it when …\n\n**Option B:** … — choose it when …\n\n**What I’d say in the interview:** …',
    },
    {
      id: 'formula',
      label: 'Formula',
      template: '**Formula:** `requests per day ÷ 86,400 ≈ requests per second`\n\n**Worked example:** …\n\n**Watch out for:** …',
    },
    MISTAKE,
  ],
  noteTitlePlaceholder: 'e.g. Fan-out on write vs read',
  noteBodyLabel: 'Note (Markdown supported, including ```mermaid diagrams)',
  diagrams: true,
  problemNotePlaceholder: 'e.g. Forgot to ask about custom aliases; 301 vs 302 matters for analytics…',
};

const LLD: SystemDesignTrackConfig = {
  other: 'HLD',
  rubric: LLD_RUBRIC,
  answers: 'knowledge-check',
  interviewIntro:
    'Each mock interview walks you through the seven steps against the clock: ask the interviewer clarifying questions, write requirements, pick the entities, draw the class diagram, code the core flow, cover edge cases and concurrency, then take on follow-ups and rate yourself. Answers are scripted per problem and matched to your questions by keywords; scores are your own self-assessment.',
  notebookIntro:
    'Bookmarked lessons and sections, saved code and interview questions, your notes, trade-offs, patterns and mistakes, and the problems you want to revisit. Difficult lessons, missed quiz answers and weak mock-interview areas are collected automatically. Everything is stored in this browser.',
  noteKinds: [
    { id: 'note', label: 'Note' },
    {
      id: 'tradeoff',
      label: 'Trade-off',
      template: '**Decision:** …\n\n**Option A:** … — choose it when …\n\n**Option B:** … — choose it when …\n\n**What I’d say in the interview:** …',
    },
    {
      id: 'pattern',
      label: 'Pattern',
      template: '**Pattern:** …\n\n**Problem it solves:** …\n\n**Cue in the prompt:** …\n\n**Simpler alternative:** …',
    },
    MISTAKE,
  ],
  noteTitlePlaceholder: 'e.g. Strategy vs State',
  noteBodyLabel: 'Note (Markdown supported, including ```java code and ```uml class diagrams)',
  diagrams: false,
  problemNotePlaceholder: 'e.g. Forgot to ask about concurrency; the plate claim must be undone when the lot is full…',
};

const CONFIG: Partial<Record<TrackId, SystemDesignTrackConfig>> = { hld: HLD, lld: LLD };

export const trackConfig = (track: { id: TrackId }): SystemDesignTrackConfig => CONFIG[track.id] ?? LLD;
