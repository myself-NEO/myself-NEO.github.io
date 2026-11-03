import React, { useId, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { QuizAnswer } from '../progress';
import { formatQuantity, parseQuantity, QuantityKind, ratio } from './numbers';

// Numeric estimation drills. In markdown:
//
//   ```drill
//   ? 100 million requests a day. Average requests per second?
//   = 1157/s
//   ~ 1.5
//   > 100M ÷ 86,400 ≈ 1,157/s. Shortcut: ÷ 100K → ~1,000/s.
//   ```
//
// `=` is the reference answer (with a unit when it has one), `~` the accepted factor
// (default 2: anything within ×2 counts — the right order of magnitude and then some),
// `>` the worked solution.

export interface DrillQuestion {
  prompt: string;
  answer: number;
  kind: QuantityKind;
  answerText: string;
  tolerance: number;
  solution: string;
}

export const parseDrills = (source: string): { questions: DrillQuestion[]; errors: string[] } => {
  const questions: DrillQuestion[] = [];
  const errors: string[] = [];
  let current: Partial<DrillQuestion> & { prompt?: string } = {};
  const flush = () => {
    if (!current.prompt) return;
    if (current.answer === undefined || current.kind === undefined) errors.push(`No valid "=" answer for: ${current.prompt}`);
    else
      questions.push({
        prompt: current.prompt,
        answer: current.answer,
        kind: current.kind,
        answerText: current.answerText ?? '',
        tolerance: current.tolerance ?? 2,
        solution: current.solution ?? '',
      });
    current = {};
  };
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('? ')) {
      flush();
      current.prompt = line.slice(2).trim();
    } else if (line.startsWith('= ') && current.prompt) {
      const parsed = parseQuantity(line.slice(2));
      if (parsed) {
        current.answer = parsed.value;
        current.kind = parsed.kind;
        current.answerText = line.slice(2).trim();
      }
    } else if (line.startsWith('~ ') && current.prompt) {
      const t = Number(line.slice(2));
      if (Number.isFinite(t) && t > 1) current.tolerance = t;
      else errors.push(`Bad tolerance "${line}" for: ${current.prompt}`);
    } else if (line.startsWith('>') && current.prompt) {
      current.solution = `${current.solution ?? ''} ${line.slice(1).trim()}`.trim();
    }
  }
  flush();
  return { questions, errors };
};

const NEEDS_UNIT: QuantityKind[] = ['bytes', 'bitrate', 'duration'];

const Inline: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown components={{ p: ({ children }) => <>{children}</>, code: ({ children }) => <code className="font-mono text-[0.9em] text-sky-300 bg-slate-800/80 px-1 py-0.5 rounded">{children}</code> }}>
    {text}
  </ReactMarkdown>
);

type Verdict = { ok: boolean; message: string } | null;

const judge = (q: DrillQuestion, input: string): Verdict => {
  const parsed = parseQuantity(input);
  if (!parsed) return { ok: false, message: 'That isn’t a number I can read — try forms like 1200, 1.2K, 3M, 40 GB or 12 ms.' };
  if (NEEDS_UNIT.includes(q.kind) && parsed.kind === 'count') return { ok: false, message: 'Add a unit (for example KB, GB, TB, Gbps or ms) so the size is unambiguous.' };
  const off = ratio(parsed.value, q.answer);
  const shown = formatQuantity(q.answer, q.kind);
  if (off <= q.tolerance) {
    return { ok: true, message: off < 1.15 ? `Spot on — the reference is ${shown}.` : `Close enough (within ×${q.tolerance}) — the reference is ${shown}.` };
  }
  const direction = parsed.value > q.answer ? 'high' : 'low';
  return { ok: false, message: `About ${off >= 10 ? Math.round(off) : off.toFixed(1)}× too ${direction}. Check units and the per-day → per-second step, then try again.` };
};

const DrillItem: React.FC<{ q: DrillQuestion; index: number; onAnswer?: (a: QuizAnswer) => void }> = ({ q, index, onAnswer }) => {
  const id = useId();
  const [input, setInput] = useState('');
  const [verdict, setVerdict] = useState<Verdict>(null);
  const [showSolution, setShowSolution] = useState(false);
  const solved = verdict?.ok ?? false;

  const check = () => {
    const v = judge(q, input);
    setVerdict(v);
    // Unreadable input isn't an attempt.
    if (v && parseQuantity(input)) {
      onAnswer?.({ prompt: q.prompt, correct: v.ok, chosen: input.trim(), correctText: `≈ ${formatQuantity(q.answer, q.kind)}`, explanation: q.solution });
    }
  };

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 sm:p-5">
      <p className="font-semibold text-slate-100 mb-3 [overflow-wrap:anywhere]">
        <span className="text-sky-400 mr-2">E{index + 1}.</span>
        <Inline text={q.prompt} />
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          check();
        }}
      >
        <label htmlFor={id} className="sr-only">
          Your estimate
        </label>
        <input
          id={id}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={solved}
          placeholder="Your estimate, e.g. 1.2K/s or 40 GB"
          autoComplete="off"
          spellCheck={false}
          className="w-56 max-w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-1.5 text-sm text-slate-100 font-mono placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:opacity-70"
        />
        <button
          type="submit"
          disabled={solved || !input.trim()}
          className="rounded-lg bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-400 px-3 py-1.5 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300"
        >
          Check
        </button>
        {!solved && (
          <button type="button" onClick={() => setShowSolution((s) => !s)} className="text-xs text-slate-400 hover:text-white underline underline-offset-2">
            {showSolution ? 'Hide solution' : 'Show solution'}
          </button>
        )}
      </form>
      <div aria-live="polite">
        {verdict && <p className={`mt-2 text-sm ${verdict.ok ? 'text-emerald-300' : 'text-rose-300'}`}>{verdict.ok ? '✓ ' : '✗ '}{verdict.message}</p>}
        {(solved || showSolution) && q.solution && (
          <p className="mt-2 text-sm text-slate-300 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">
            <span className="font-semibold text-emerald-300">Working: </span>
            <Inline text={q.solution} />
          </p>
        )}
      </div>
    </div>
  );
};

const Drill: React.FC<{ source: string; onAnswer?: (a: QuizAnswer) => void }> = ({ source, onAnswer }) => {
  const { questions } = useMemo(() => parseDrills(source), [source]);
  if (questions.length === 0) return null;
  return (
    <section className="not-prose my-6 space-y-3" aria-label="Estimation drill" data-widget="drill">
      <p className="text-xs font-semibold uppercase tracking-wider text-amber-300">🧠 Estimation drill · answers within the stated factor count</p>
      {questions.map((q, i) => (
        <DrillItem key={q.prompt} q={q} index={i} onAnswer={onAnswer} />
      ))}
    </section>
  );
};

export default Drill;
