import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../../content/shared/types';
import { InterviewScript, PHASE_SECTIONS, ScriptPhase } from '../../../content/system-design/hld/interview';
import MarkdownContent from '../../learn/MarkdownContent';
import { interviewActions, InterviewSession, PhaseId } from '../../learn/interviews';
import { focusRing } from '../../learn/ui';

// Building blocks of the mock-interview phases.

export const PHASES: { id: PhaseId; label: string; short: string }[] = [
  { id: 'clarify', label: 'Clarify the problem', short: 'Clarify' },
  { id: 'requirements', label: 'Define requirements', short: 'Requirements' },
  { id: 'estimation', label: 'Estimate capacity', short: 'Estimate' },
  { id: 'api', label: 'Define the APIs', short: 'APIs' },
  { id: 'data-model', label: 'Model the data', short: 'Data model' },
  { id: 'architecture', label: 'High-level architecture', short: 'Architecture' },
  { id: 'deep-dives', label: 'Deep dives', short: 'Deep dives' },
  { id: 'bottlenecks', label: 'Bottlenecks & failures', short: 'Failures' },
  { id: 'tradeoffs', label: 'Trade-offs & wrap-up', short: 'Trade-offs' },
  { id: 'evaluation', label: 'Self-evaluation', short: 'Evaluate' },
];

/** What each phase should produce, and generic hints used when the breakdown has none. */
export const PHASE_GUIDE: Record<ScriptPhase, { goal: string; say: string; hints: string[] }> = {
  clarify: {
    goal: 'Clarify the use case, the users and the scope. Ask the questions whose answers change the design.',
    say: '“Before I design anything, I’d like to confirm a few things about scale and scope…”',
    hints: [
      'Ask about scale: users, requests per day, data volume, growth.',
      'Ask what matters most: latency, availability or consistency — and for which operation.',
      'Ask what is explicitly out of scope: accounts, analytics, admin tools, multi-region.',
    ],
  },
  requirements: {
    goal: 'Write 3–5 functional requirements (what users can do) and quantified non-functional requirements.',
    say: '“So the core features are… and the system must… Let me prioritise these.”',
    hints: [
      'Phrase functional requirements as user capabilities: “Users can …”.',
      'Give numbers for non-functional requirements: p99 latency, availability nines, durability, scale.',
      'Say which consistency each core operation needs — it is rarely the same for all of them.',
    ],
  },
  estimation: {
    goal: 'Estimate only the numbers that change the design, out loud, in two or three minutes — and say what each implies.',
    say: '“That’s about N requests per second at peak, which means…”',
    hints: [
      'Convert per-day numbers to per-second: divide by ~100,000 (86,400 rounded).',
      'Split reads from writes — the ratio usually decides whether caching is central.',
      'Storage = writes/day × bytes × days kept × replication factor.',
    ],
  },
  api: {
    goal: 'One endpoint per functional requirement: method, path, request, response and status codes; auth, pagination and idempotency.',
    say: '“For creating X, I’d expose POST /x returning 201 with…”',
    hints: [
      'Use plural resource nouns and the right HTTP method for each action.',
      'Take the user’s identity from the auth token, not from the request body.',
      'Any list endpoint needs pagination; any non-idempotent write may need an idempotency key.',
    ],
  },
  'data-model': {
    goal: 'Name the core entities, keys and relationships; choose a store for each from its access pattern; note indexes and partition keys.',
    say: '“The main entities are… I’ll keep X in Postgres because… and partition by…”',
    hints: [
      'List the access patterns your APIs need, then design keys and indexes to serve them.',
      'Choose the store per entity — not one database for everything by default.',
      'Name the partition key and check it doesn’t create a hot spot.',
    ],
  },
  architecture: {
    goal: 'Draw a working design that satisfies every functional requirement — build it one endpoint at a time and narrate the flow.',
    say: '“A request to shorten comes through the load balancer to the write service, which…”',
    hints: [
      'Start with client → load balancer → stateless service → database, then add only what a requirement needs.',
      'Trace each API call through the diagram; every box should be on at least one path.',
      'Mark where caches and queues will go, but defer optimisation to the deep dives.',
    ],
  },
  'deep-dives': {
    goal: 'Pick the two or three hardest parts — usually where the non-functional requirements bite — and go deep with options and trade-offs.',
    say: '“The hardest part here is… there are three ways to handle it…”',
    hints: [
      'Go from simplest to most sophisticated option and say why each falls short.',
      'Tie every option back to a number from your estimate or a non-functional requirement.',
      'At senior level, choose the deep dives yourself before the interviewer does.',
    ],
  },
  bottlenecks: {
    goal: 'Stress the design: single points of failure, hot partitions, cache failures, backlogs, network failures and races.',
    say: '“If the cache cluster fails, all reads hit the database, so…”',
    hints: [
      'Walk every box in the diagram and ask: what happens if this is slow, or gone?',
      'Look for hot keys and hot partitions in your data model.',
      'For each failure: how is it detected, how is it mitigated, what does the user see?',
    ],
  },
  tradeoffs: {
    goal: 'Summarise the design, the alternatives you rejected and why, and what you would build or monitor next.',
    say: '“To summarise… I chose X over Y because… if requirements changed to Z, I’d…”',
    hints: [
      'Give a 30-second summary of the final design first.',
      'Name the two or three biggest trade-offs and the alternative for each.',
      'Close with monitoring, security and how the design would evolve.',
    ],
  },
};

export const useAutosave = (value: string | undefined, save: (text: string) => void, delay = 500) => {
  const [text, setText] = useState(value ?? '');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(save);
  latest.current = save;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  const onChange = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => latest.current(next), delay);
  };
  const flush = () => {
    clearTimeout(timer.current);
    latest.current(text);
  };
  return { text, onChange, flush };
};

export const buttonClass = `inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:text-white hover:border-slate-500 transition-colors ${focusRing}`;
export const primaryButton = `inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white ${focusRing}`;

interface DraftProps {
  track: Track;
  slug: string;
  session: InterviewSession;
  draftKey: string;
  label: string;
  placeholder: string;
  rows?: number;
}

/** The learner's own answer for a phase, autosaved into the session. */
export const Draft: React.FC<DraftProps> = ({ track, slug, session, draftKey, label, placeholder, rows = 8 }) => {
  const { text, onChange } = useAutosave(session.drafts[draftKey], (t) => interviewActions.setDraft(track.id, slug, draftKey, t));
  const id = `draft-${draftKey.replace(/[^\w-]/g, '-')}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-slate-200 mb-1.5">
        {label}
      </label>
      <textarea
        id={id}
        value={text}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
      />
      <p className="mt-1 text-[11px] text-slate-400">Saved as you type, in this browser.</p>
    </div>
  );
};

/** Progressive hints for one key: the breakdown's own hints when it has them, generic ones otherwise. */
export const Hints: React.FC<{ track: Track; slug: string; session: InterviewSession; hintKey: string; hints: string[] }> = ({ track, slug, session, hintKey, hints }) => {
  const shown = Math.min(session.hints[hintKey] ?? 0, hints.length);
  if (hints.length === 0) return null;
  return (
    <div className="space-y-2">
      {hints.slice(0, shown).map((hint, i) => (
        <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-sm text-slate-200">
          <p className="text-xs font-semibold text-amber-300 mb-1">
            Hint {i + 1} of {hints.length}
          </p>
          <MarkdownContent markdown={hint} basePath={track.basePath} />
        </div>
      ))}
      {shown < hints.length && (
        <button
          type="button"
          onClick={() => interviewActions.showHint(track.id, slug, hintKey)}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 ${focusRing}`}
        >
          💡 Show hint {shown + 1} of {hints.length}
        </button>
      )}
    </div>
  );
};

/** Drops a ````solution wrapper so a revealed reference doesn't need a second click. */
export const unwrapSolution = (markdown: string) => markdown.replace(/^(`{4,})solution[^\n]*\n([\s\S]*?)\n\1[ \t]*$/m, '$2');

export interface RevealProps {
  track: Track;
  slug: string;
  session: InterviewSession;
  revealKey: string;
  label: string;
  /** Markdown shown once revealed. */
  markdown: string;
  /** Extra content under the reference (e.g. coverage checks). */
  after?: React.ReactNode;
  markdownEnv?: Partial<React.ComponentProps<typeof MarkdownContent>>;
}

/** A reference answer that stays hidden until the learner asks for it. */
export const Reference: React.FC<RevealProps> = ({ track, slug, session, revealKey, label, markdown, after, markdownEnv }) => {
  const revealed = Boolean(session.revealed[revealKey]);
  const ref = useRef<HTMLDivElement>(null);
  if (!markdown.trim()) return null;
  return revealed ? (
    <section ref={ref} tabIndex={-1} aria-label={label} className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] px-4 sm:px-5 py-4 focus:outline-none">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">Reference · {label}</p>
      <MarkdownContent markdown={unwrapSolution(markdown)} basePath={track.basePath} {...markdownEnv} />
      {after}
    </section>
  ) : (
    <button
      type="button"
      onClick={() => {
        interviewActions.reveal(track.id, slug, revealKey);
        requestAnimationFrame(() => ref.current?.focus());
      }}
      className={`inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/10 ${focusRing}`}
    >
      🔍 Reveal reference: {label}
    </button>
  );
};

/** The breakdown sections answering a phase, joined into one markdown document. */
export const phaseReference = (script: InterviewScript, phase: ScriptPhase, only?: string[]) =>
  (only ?? PHASE_SECTIONS[phase])
    .filter((title) => script.sections[title]?.trim())
    // Inner ### headings drop a level so each section title stays above its own subsections.
    .map((title) => `### ${title}\n\n${script.sections[title].replace(/^(#{3,5}) /gm, '#$1 ')}`)
    .join('\n\n');

export const formatClock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
