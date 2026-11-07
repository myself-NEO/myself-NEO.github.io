import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Track } from '../../../content/shared/types';
import { findProblem } from '../../../content/shared/curriculum';
import { loadProblemBody } from '../../../content/shared/loaders';
import { matchClarification, mentions, parseInterviewScript, PHASE_SECTIONS, ScriptPhase } from '../../../content/system-design/hld/interview';
import { PHASE_BUDGETS, RUBRIC } from '../../../content/system-design/hld/landing';
import MarkdownContent from '../../learn/MarkdownContent';
import { elapsedMs, interviewActions, InterviewSession, phaseElapsedMs, PhaseId, rubricScore, sessionKey, useInterviews } from '../../learn/interviews';
import { SelfRating } from '../../learn/notebook';
import { getProgress, problemStatus, progressActions, useProgress } from '../../learn/progress';
import { problemHref, problemsHref } from '../../learn/routes';
import { useSaveTools } from '../../learn/saveTools';
import { useMarkdownBody } from '../../learn/useMarkdownBody';
import { ArrowIcon, Breadcrumbs, Chip, ClockIcon, LevelBadge, StatusBadge, focusRing, onRadioGroupKeyDown, radioTabIndex } from '../../learn/ui';
import { ContentError, ContentSkeleton, NotFound } from '../../learn/States';
import { ROOT_HREF } from '../routes';
import HldSectionNav, { HLD_INTERVIEW_HREF } from './HldSectionNav';
import { buttonClass, Draft, formatClock, Hints, PHASE_GUIDE, PHASES, phaseReference, primaryButton, Reference, useAutosave } from './interviewParts';
import { hasBreakdown } from './sequence';

const Estimator = lazy(() => import('../../learn/widgets/Estimator'));
const DiagramEditor = lazy(() => import('../../learn/widgets/DiagramEditor'));
const Checklist = lazy(() => import('../../learn/widgets/Checklist'));

const RATINGS: { id: SelfRating; label: string; classes: string }[] = [
  { id: 'got-it', label: 'Strong', classes: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' },
  { id: 'partial', label: 'Partly', classes: 'bg-amber-500/15 border-amber-500/50 text-amber-200' },
  { id: 'missed', label: 'Missed', classes: 'bg-rose-500/15 border-rose-500/50 text-rose-200' },
];

const NO_MATCH_ANSWER =
  'No scripted answer for that one. In a real interview, state a reasonable assumption out loud (“I’ll assume …”) and move on — or rephrase if you meant scale, scope, latency, consistency or data size.';

const DESIGN_CHOICE_ANSWER =
  'That’s your call — it’s part of what is being evaluated. Pick an option, give the reason tied to the requirements, and I’ll push back if I disagree.';

/** Questions that ask the interviewer to make a design decision rather than clarify the problem. */
const DESIGN_CHOICE = /\b(which|what)\s+(database|db|datastore|store|queue|cache|broker|language|framework|cloud)\b|\b(should|can|could|may)\s+(i|we)\s+use\b/i;

const interviewerReply = (question: string, answer: string | undefined) =>
  answer ?? (DESIGN_CHOICE.test(question) ? DESIGN_CHOICE_ANSWER : NO_MATCH_ANSWER);

const WidgetFallback = () => <div className="min-h-[10rem] rounded-xl border border-slate-800 bg-slate-900/40" role="status" aria-label="Loading" />;

/** Re-renders every second while the timer runs. */
const useTicker = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
};

// ── Brief (before starting, and after finishing) ───────────────────────

const Brief: React.FC<{ track: Track; slug: string; prompt: string }> = ({ track, slug, prompt }) => {
  const problem = findProblem(track, slug)!;
  const interviews = useInterviews();
  const history = interviews.history[sessionKey(track.id, slug)] ?? [];
  const [minutes, setMinutes] = useState<45 | 60>(problem.minutes >= 60 ? 60 : 45);
  const last = history[history.length - 1];

  return (
    <div className="space-y-8">
      <section aria-labelledby="prompt-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5 sm:p-6">
        <h2 id="prompt-heading" className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
          The interviewer says
        </h2>
        <MarkdownContent markdown={prompt} basePath={track.basePath} />
      </section>

      <section aria-labelledby="how-heading" className="grid md:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-5">
          <h2 id="how-heading" className="font-bold text-white mb-2">
            How this works
          </h2>
          <ol className="list-decimal list-inside space-y-1.5 text-sm text-slate-300">
            <li>Ask clarifying questions; the interviewer answers from this problem’s script.</li>
            <li>Write your requirements, estimate, APIs and data model; draw the architecture.</li>
            <li>Choose deep dives, then stress the design for failures and trade-offs.</li>
            <li>Hints and the reference design stay hidden until you open them.</li>
            <li>Finish by rating yourself on the interview rubric.</li>
          </ol>
          <p className="mt-3 text-xs text-slate-400">
            Feedback is deterministic: answers are matched to your questions by keywords, coverage is checked against the reference
            requirements, and the final score is your own self-assessment. Nothing here is graded by AI.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h2 className="font-bold text-white mb-3">Interview length</h2>
          <div role="radiogroup" aria-label="Interview length" onKeyDown={onRadioGroupKeyDown} className="inline-flex rounded-xl border border-slate-700 bg-slate-950/50 p-1 gap-1 mb-4">
            {([45, 60] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={minutes === m}
                tabIndex={minutes === m ? 0 : -1}
                onClick={() => setMinutes(m)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${focusRing} ${minutes === m ? 'bg-sky-500/20 text-sky-200' : 'text-slate-400 hover:text-white'}`}
              >
                {m} minutes
              </button>
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 mb-5">
            {PHASES.filter((p) => p.id !== 'evaluation').map((p) => (
              <li key={p.id} className="flex justify-between gap-2">
                <span>{p.short}</span>
                <span className="text-slate-400">{PHASE_BUDGETS[minutes][p.id]} min</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              interviewActions.start(track.id, slug, minutes);
              progressActions.markProblemStarted(track.id, slug);
            }}
            className={primaryButton}
          >
            {history.length > 0 ? 'Start a new attempt' : 'Start the interview'} <ArrowIcon className="h-4 w-4" />
          </button>
        </div>
      </section>

      {history.length > 0 && (
        <section aria-labelledby="history-heading" className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
          <h2 id="history-heading" className="font-bold text-white mb-3">
            Your attempts
          </h2>
          {last && (
            <p className="text-sm text-slate-300 mb-3">
              Last attempt: <strong className="text-white">{last.score}%</strong> self-score in {formatClock(last.elapsedMs)} of {last.minutes} min,
              asked about {Math.round(last.clarifyCoverage * 100)}% of the key questions, {last.hintsUsed} hint{last.hintsUsed === 1 ? '' : 's'} used.
            </p>
          )}
          <div className="overflow-x-auto" tabIndex={0}>
            <table className="w-full text-sm min-w-[32rem]">
              <thead>
                <tr className="text-left text-xs text-slate-400">
                  <th className="py-1.5 pr-3 font-semibold">Date</th>
                  <th className="py-1.5 pr-3 font-semibold">Score</th>
                  <th className="py-1.5 pr-3 font-semibold">Time</th>
                  <th className="py-1.5 font-semibold">Weakest areas</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((a) => (
                  <tr key={a.completedAt} className="border-t border-slate-800 text-slate-300">
                    <td className="py-1.5 pr-3">{new Date(a.completedAt).toLocaleDateString()}</td>
                    <td className="py-1.5 pr-3">{a.score}%</td>
                    <td className="py-1.5 pr-3">
                      {formatClock(a.elapsedMs)} / {a.minutes}:00
                    </td>
                    <td className="py-1.5 text-xs text-slate-400">
                      {RUBRIC.filter((r) => a.ratings[r.id] === 'missed')
                        .map((r) => r.label)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};

// ── Phases ─────────────────────────────────────────────────────────────

interface PhaseProps {
  track: Track;
  slug: string;
  session: InterviewSession;
  script: ReturnType<typeof parseInterviewScript>;
  tools: ReturnType<typeof useSaveTools>;
}

const ClarifyPhase: React.FC<PhaseProps> = ({ track, slug, session, script }) => {
  const [question, setQuestion] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const matched = new Set(session.asked.map((a) => a.matched).filter((m): m is number => m !== null));
  const total = script.clarifications.length;
  const showAll = Boolean(session.revealed.clarify);

  const ask = () => {
    const text = question.trim();
    if (!text) return;
    const result = matchClarification(text, script.clarifications, matched);
    interviewActions.ask(track.id, slug, text, result ? result.index : null);
    setQuestion('');
    requestAnimationFrame(() => log.current?.lastElementChild?.scrollIntoView({ block: 'nearest' }));
  };

  return (
    <div className="space-y-5">
      {session.asked.length > 0 && (
        <ol ref={log} className="space-y-3 max-h-[28rem] overflow-y-auto pr-1" aria-label="Conversation" aria-live="polite">
          {session.asked.map((a, i) => (
            <li key={`${a.at}-${i}`} className="space-y-1.5">
              <p className="ml-auto max-w-[85%] w-fit rounded-2xl rounded-br-sm bg-sky-600/80 px-3 py-2 text-sm text-white [overflow-wrap:anywhere]">{a.text}</p>
              <div className="max-w-[85%] w-fit rounded-2xl rounded-bl-sm bg-slate-800 px-3 py-2 text-sm text-slate-200 [overflow-wrap:anywhere] [&_p]:!my-0 [&_p]:!text-sm [&_p]:!leading-6">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                  Interviewer {a.matched === null ? '· no scripted answer' : `· scripted answer to “${script.clarifications[a.matched]?.question}”`}
                </span>
                <MarkdownContent markdown={interviewerReply(a.text, a.matched === null ? undefined : script.clarifications[a.matched]?.answer)} basePath={track.basePath} />
              </div>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <label htmlFor="clarify-input" className="sr-only">
          Ask the interviewer a clarifying question
        </label>
        <input
          id="clarify-input"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask a clarifying question, e.g. “How many new links per day?”"
          autoComplete="off"
          className="flex-1 rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        <button type="submit" disabled={!question.trim()} className={`${primaryButton} disabled:bg-slate-700 disabled:text-slate-400`}>
          Ask
        </button>
      </form>
      <p className="text-sm text-slate-400" aria-live="polite">
        You have asked about <strong className="text-white">{matched.size}</strong> of the {total} topics this interviewer has answers for.
        Matching uses keywords, so rephrase if an answer doesn’t fit.
      </p>
      {showAll ? (
        <section aria-label="All clarifying questions" className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300 mb-2">Questions a strong candidate asks</p>
          <ul className="space-y-2.5">
            {script.clarifications.map((c, i) => (
              <li key={c.question} className="text-sm">
                <p className="font-semibold text-slate-100">
                  {matched.has(i) ? '✓ ' : '○ '}
                  {c.question}
                  <span className="sr-only">{matched.has(i) ? ' (you asked this)' : ' (not asked)'}</span>
                </p>
                <div className="text-slate-300">
                  <MarkdownContent markdown={c.answer} basePath={track.basePath} />
                </div>
              </li>
            ))}
          </ul>
          {script.sections['Scope and exclusions'] && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">Scope and exclusions</p>
              <MarkdownContent markdown={script.sections['Scope and exclusions']} basePath={track.basePath} />
            </div>
          )}
        </section>
      ) : (
        <button type="button" onClick={() => interviewActions.reveal(track.id, slug, 'clarify')} className={buttonClass}>
          🔍 Show every question the interviewer had answers for
        </button>
      )}
    </div>
  );
};

const CoverageList: React.FC<{ track: Track; slug: string; session: InterviewSession; title: string; prefix: string; items: ReturnType<typeof parseInterviewScript>['functional']; text: string }> = ({
  track,
  slug,
  session,
  title,
  prefix,
  items,
  text,
}) => {
  if (items.length === 0) return null;
  const covered = items.filter((item, i) => session.checks[`${prefix}:${i}`] || mentions(text, item)).length;
  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <p className="text-sm font-semibold text-slate-200 mb-1">
        {title}: {covered} / {items.length} covered
      </p>
      <p className="text-xs text-slate-400 mb-2">“Looks mentioned” is a keyword check of your draft. Tick the ones you covered in other words.</p>
      <ul className="space-y-1">
        {items.map((item, i) => {
          const auto = mentions(text, item);
          const key = `${prefix}:${i}`;
          return (
            <li key={key}>
              <label className="flex items-start gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={auto || Boolean(session.checks[key])} disabled={auto} onChange={(e) => interviewActions.setCheck(track.id, slug, key, e.target.checked)} className="mt-1 accent-emerald-500" />
                <span className="[overflow-wrap:anywhere]">
                  <MarkdownContent markdown={item.text} basePath={track.basePath} />
                  {auto && <span className="ml-1 text-[11px] text-emerald-300">looks mentioned</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

const DraftPhase: React.FC<PhaseProps & { phase: ScriptPhase; label: string; placeholder: string; children?: React.ReactNode; after?: React.ReactNode; rows?: number }> = ({
  track,
  slug,
  session,
  script,
  tools,
  phase,
  label,
  placeholder,
  children,
  after,
  rows,
}) => (
  <div className="space-y-5">
    {children}
    <Draft track={track} slug={slug} session={session} draftKey={phase} label={label} placeholder={placeholder} rows={rows} />
    <Hints track={track} slug={slug} session={session} hintKey={phase} hints={script.hints[phase] ?? PHASE_GUIDE[phase].hints} />
    <Reference
      track={track}
      slug={slug}
      session={session}
      revealKey={phase}
      label={PHASE_SECTIONS[phase].filter((t) => script.sections[t]).join(' · ')}
      markdown={phaseReference(script, phase)}
      after={after}
      markdownEnv={{ onSaveDiagram: tools.onSaveDiagram, onToggleQuestion: tools.onToggleQuestion, savedQuestions: tools.savedQuestions }}
    />
  </div>
);

const ArchitecturePhase: React.FC<PhaseProps> = (props) => {
  const { track, slug, session, script, tools } = props;
  const { text, onChange } = useAutosave(session.diagram, (t) => interviewActions.setDiagram(track.id, slug, t));
  return (
    <div className="space-y-5">
      <Suspense fallback={<WidgetFallback />}>
        <DiagramEditor value={text} onChange={onChange} label="Your architecture (Mermaid)" />
      </Suspense>
      <Draft
        track={track}
        slug={slug}
        session={session}
        draftKey="architecture"
        label="Walk through the main request flows"
        placeholder={'1. Write path: client → LB → service → …\n2. Read path: …'}
        rows={6}
      />
      <Hints track={track} slug={slug} session={session} hintKey="architecture" hints={script.hints.architecture ?? PHASE_GUIDE.architecture.hints} />
      <div className="flex flex-col gap-3">
        <Reference
          track={track}
          slug={slug}
          session={session}
          revealKey="architecture"
          label="initial design and request flows"
          markdown={phaseReference(script, 'architecture')}
          markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
        />
        <Reference
          track={track}
          slug={slug}
          session={session}
          revealKey="final-architecture"
          label="final architecture"
          markdown={script.sections['Final architecture'] ?? ''}
          markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
        />
      </div>
    </div>
  );
};

const DeepDivePhase: React.FC<PhaseProps> = ({ track, slug, session, script, tools }) => {
  const chosen = session.deepDives ?? [];
  const toggle = (i: number) => interviewActions.setDeepDives(track.id, slug, chosen.includes(i) ? chosen.filter((c) => c !== i) : [...chosen, i].sort((a, b) => a - b));
  return (
    <div className="space-y-5">
      <fieldset className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-200">Choose two or three deep dives</legend>
        <p className="text-xs text-slate-400 mb-3">At senior level, pick them yourself from the non-functional requirements before the interviewer does.</p>
        <ul className="grid sm:grid-cols-2 gap-2">
          {script.deepDives.map((d, i) => (
            <li key={d.title}>
              <label className="flex items-start gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-200 hover:border-slate-600 cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
                <input type="checkbox" checked={chosen.includes(i)} onChange={() => toggle(i)} className="mt-0.5 accent-sky-500" />
                <span>
                  {d.title}
                  <span className="block text-[11px] text-slate-400">{d.section}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      {chosen.length === 0 && <p className="text-sm text-slate-400">Pick at least one deep dive to work on.</p>}
      {chosen.map((i) => {
        const d = script.deepDives[i];
        if (!d) return null;
        return (
          <section key={d.title} aria-label={d.title} className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4 space-y-4">
            <h3 className="font-bold text-white">{d.title}</h3>
            <Draft
              track={track}
              slug={slug}
              session={session}
              draftKey={`deep:${i}`}
              label="Your approach: options, the one you choose, and why"
              placeholder={'Option 1 (simple): … falls short because …\nOption 2: …\nChoice: … because …'}
              rows={6}
            />
            <Reference
              track={track}
              slug={slug}
              session={session}
              revealKey={`deep:${i}`}
              label={d.title}
              markdown={d.body}
              markdownEnv={{ onSaveDiagram: tools.onSaveDiagram }}
            />
          </section>
        );
      })}
      <Hints track={track} slug={slug} session={session} hintKey="deep-dives" hints={script.hints['deep-dives'] ?? PHASE_GUIDE['deep-dives'].hints} />
    </div>
  );
};

const EvaluationPhase: React.FC<PhaseProps & { onFinish: () => void }> = ({ track, slug, session, script, tools, onFinish }) => {
  const progress = useProgress();
  const rated = RUBRIC.filter((r) => session.ratings[r.id]).length;
  const score = rubricScore(session.ratings, RUBRIC.length);
  const asked = new Set(session.asked.map((a) => a.matched).filter((m): m is number => m !== null));
  const hintsUsed = Object.values(session.hints).reduce((sum, n) => sum + n, 0);
  const budgets = PHASE_BUDGETS[session.minutes];
  const now = Date.now();
  const revealedBeforeDraft = (Object.keys(session.revealed) as string[]).filter((k) => k in PHASE_GUIDE && !(session.drafts[k] ?? '').trim()).length;
  const status = problemStatus(progress, track.id, slug);

  return (
    <div className="space-y-6">
      <section aria-labelledby="summary-heading" className="rounded-xl border border-slate-700/80 bg-slate-900/40 p-4">
        <h3 id="summary-heading" className="font-bold text-white mb-3">
          How the attempt went
        </h3>
        <ul className="grid sm:grid-cols-3 gap-3 mb-4 text-sm">
          <li className="rounded-lg border border-slate-800 p-3">
            <p className="text-slate-400 text-xs">Total time</p>
            <p className="text-lg font-semibold text-white">
              {formatClock(elapsedMs(session, now))} <span className="text-sm text-slate-400">/ {session.minutes}:00</span>
            </p>
          </li>
          <li className="rounded-lg border border-slate-800 p-3">
            <p className="text-slate-400 text-xs">Clarifying coverage</p>
            <p className="text-lg font-semibold text-white">
              {asked.size} / {script.clarifications.length}
            </p>
          </li>
          <li className="rounded-lg border border-slate-800 p-3">
            <p className="text-slate-400 text-xs">Hints used · references opened before drafting</p>
            <p className="text-lg font-semibold text-white">
              {hintsUsed} · {revealedBeforeDraft}
            </p>
          </li>
        </ul>
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-sm min-w-[24rem]">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-1 pr-3 font-semibold">Phase</th>
                <th className="py-1 pr-3 font-semibold">Time</th>
                <th className="py-1 font-semibold">Budget</th>
              </tr>
            </thead>
            <tbody>
              {PHASES.filter((p) => p.id !== 'evaluation').map((p) => {
                const spent = phaseElapsedMs(session, p.id, now);
                const over = spent > budgets[p.id] * 60_000;
                return (
                  <tr key={p.id} className="border-t border-slate-800">
                    <td className="py-1 pr-3 text-slate-300">{p.short}</td>
                    <td className={`py-1 pr-3 ${over ? 'text-amber-300' : 'text-slate-300'}`}>{formatClock(spent)}</td>
                    <td className="py-1 text-slate-400">{budgets[p.id]}:00</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <fieldset className="space-y-3">
        <legend className="font-bold text-white mb-1">Rate yourself on the rubric</legend>
        <p className="text-sm text-slate-400">Compare your drafts with the references you opened. Be strict: “Strong” means you would get full credit.</p>
        {RUBRIC.map((r) => (
          <div key={r.id} className="rounded-xl border border-slate-700/80 bg-slate-800/30 p-4" role="radiogroup" aria-label={r.label} onKeyDown={onRadioGroupKeyDown}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="font-semibold text-slate-100">{r.label}</p>
              <span className="flex gap-1">
                {RATINGS.map((rating, i) => (
                  <button
                    key={rating.id}
                    type="button"
                    role="radio"
                    aria-checked={session.ratings[r.id] === rating.id}
                    tabIndex={radioTabIndex(session.ratings[r.id] === rating.id, i, Boolean(session.ratings[r.id]))}
                    onClick={() => interviewActions.rate(track.id, slug, r.id, rating.id)}
                    className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${focusRing} ${
                      session.ratings[r.id] === rating.id ? rating.classes : 'border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {rating.label}
                  </button>
                ))}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              <span className="text-emerald-300 font-semibold">Strong: </span>
              {r.strong}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-rose-300 font-semibold">Weak: </span>
              {r.weak}
            </p>
          </div>
        ))}
      </fieldset>

      {script.checklist.length > 0 && (
        <Suspense fallback={<WidgetFallback />}>
          <Checklist source={script.checklist.map((c) => `- ${c}`).join('\n')} title="Evaluation checklist" pageKey={tools.pageKey} />
        </Suspense>
      )}

      {script.sections['Interviewer follow-up questions'] && (
        <section aria-labelledby="followups-heading">
          <h3 id="followups-heading" className="font-bold text-white mb-1">
            Follow-up questions to practise
          </h3>
          <p className="text-sm text-slate-400 mb-2">Answer each out loud before opening it. Save the ones you struggled with to your notebook.</p>
          <MarkdownContent
            markdown={script.sections['Interviewer follow-up questions']}
            basePath={track.basePath}
            onToggleQuestion={tools.onToggleQuestion}
            savedQuestions={tools.savedQuestions}
          />
        </section>
      )}

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">
            Self-score: {score}% {rated < RUBRIC.length && <span className="text-sm font-normal text-slate-400">({rated} of {RUBRIC.length} rated)</span>}
          </p>
          <p className="text-sm text-slate-400">
            Finishing saves this attempt and marks the problem <em>Attempted</em> (currently <StatusBadge status={status} />). Areas you rate
            “Missed” go on your revision list.
          </p>
        </div>
        <button type="button" onClick={onFinish} disabled={rated < RUBRIC.length} className={`${primaryButton} disabled:bg-slate-700 disabled:text-slate-400`}>
          Finish interview
        </button>
      </div>
    </div>
  );
};

// ── Page ───────────────────────────────────────────────────────────────

const InterviewSimulator: React.FC<{ track: Track; slug: string }> = ({ track, slug }) => {
  const problem = findProblem(track, slug);
  const available = Boolean(problem) && hasBreakdown(track, slug);
  const { state, retry } = useMarkdownBody(() => (available ? loadProblemBody(track.id, slug) : Promise.resolve('')), `${track.id}/interview/${slug}`);
  const script = useMemo(() => (state.status === 'ready' ? parseInterviewScript(state.body) : null), [state]);
  const interviews = useInterviews();
  const session = interviews.sessions[sessionKey(track.id, slug)];
  const tools = useSaveTools(track, { kind: 'problem', slug, title: problem?.title ?? slug, topic: 'problems', href: problemHref(track, slug) });
  const [finished, setFinished] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  useTicker(Boolean(session?.runningSince));

  // Pause when leaving the page or hiding the tab, so time away doesn't count.
  const active = Boolean(session);
  useEffect(() => {
    if (!active) return;
    const onHide = () => {
      if (document.visibilityState === 'hidden') interviewActions.setTimerRunning(track.id, slug, false);
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      interviewActions.setTimerRunning(track.id, slug, false);
    };
  }, [active, track.id, slug]);

  if (!problem) {
    return (
      <main className="pt-[61px]">
        <NotFound what="problem" home={{ label: 'Mock interviews', href: HLD_INTERVIEW_HREF }} />
      </main>
    );
  }

  const goTo = (phase: PhaseId) => {
    interviewActions.setPhase(track.id, slug, phase);
    requestAnimationFrame(() => {
      panel.current?.focus();
      panel.current?.scrollIntoView({ block: 'start' });
    });
  };

  const finish = () => {
    if (!session || !script) return;
    const matched = new Set(session.asked.map((a) => a.matched).filter((m): m is number => m !== null));
    interviewActions.finish(track.id, slug, {
      score: rubricScore(session.ratings, RUBRIC.length),
      clarifyCoverage: script.clarifications.length ? matched.size / script.clarifications.length : 0,
      hintsUsed: Object.values(session.hints).reduce((sum, n) => sum + n, 0),
    });
    if (problemStatus(getProgress(), track.id, slug) !== 'completed') progressActions.setProblemStatus(track.id, slug, 'attempted');
    setFinished(true);
  };

  const phaseIndex = session ? PHASES.findIndex((p) => p.id === session.phase) : -1;
  const phase = session ? PHASES[phaseIndex] : undefined;
  const running = Boolean(session?.runningSince);
  const budget = session && phase && phase.id !== 'evaluation' ? PHASE_BUDGETS[session.minutes][phase.id] : 0;
  const phaseSpent = session && phase ? phaseElapsedMs(session, phase.id) : 0;

  let body: React.ReactNode = null;
  if (session && script && phase) {
    const props: PhaseProps = { track, slug, session, script, tools };
    switch (phase.id) {
      case 'clarify':
        body = <ClarifyPhase {...props} />;
        break;
      case 'requirements': {
        const text = session.drafts.requirements ?? '';
        body = (
          <DraftPhase
            {...props}
            phase="requirements"
            label="Functional and non-functional requirements"
            placeholder={'Functional\n- Users can …\n\nNon-functional\n- p99 latency < … ms for …\n- … availability; consistency: …\n- Scale: …'}
            rows={10}
            after={
              <>
                <CoverageList track={track} slug={slug} session={session} title="Functional requirements" prefix="fr" items={script.functional} text={text} />
                <CoverageList track={track} slug={slug} session={session} title="Non-functional requirements" prefix="nfr" items={script.nonFunctional} text={text} />
              </>
            }
          />
        );
        break;
      }
      case 'estimation':
        body = (
          <DraftPhase {...props} phase="estimation" label="What do the numbers mean for the design?" placeholder={'Peak ~… RPS → …\nStorage ~… over … years → …\nRead-heavy (… : 1) → …'} rows={6}>
            <div className="rounded-xl border border-sky-500/30 bg-slate-900/60 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-300 mb-3">🧮 Estimation workspace · prefilled from the interviewer’s answers where possible</p>
              <Suspense fallback={<WidgetFallback />}>
                <Estimator bare preset={script.estimatorPreset} values={session.estimate as Record<string, string> | undefined} onChange={(v) => interviewActions.setEstimate(track.id, slug, v)} />
              </Suspense>
            </div>
          </DraftPhase>
        );
        break;
      case 'api':
        body = <DraftPhase {...props} phase="api" label="Your API" placeholder={'POST /v1/…\n  body: { … }\n  → 201 { … }\n\nGET /v1/…/{id}\n  → 200 …'} rows={10} />;
        break;
      case 'data-model':
        body = <DraftPhase {...props} phase="data-model" label="Entities, keys, stores, indexes and partitioning" placeholder={'Entity (store): fields — PK …, index on …, partition by …'} rows={8} />;
        break;
      case 'architecture':
        body = <ArchitecturePhase {...props} />;
        break;
      case 'deep-dives':
        body = <DeepDivePhase {...props} />;
        break;
      case 'bottlenecks':
        body = <DraftPhase {...props} phase="bottlenecks" label="Bottlenecks and failure scenarios" placeholder={'- If … fails: detected by …, mitigated by …\n- Hot spot: …'} rows={8} />;
        break;
      case 'tradeoffs':
        body = <DraftPhase {...props} phase="tradeoffs" label="Summary, trade-offs and alternatives" placeholder={'Summary: …\nChose … over … because …\nNext: …'} rows={8} />;
        break;
      case 'evaluation':
        body = <EvaluationPhase {...props} onFinish={finish} />;
        break;
    }
  }

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <HldSectionNav active="interview" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Mock interviews', href: HLD_INTERVIEW_HREF }, { label: problem.title }]} />
        <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <LevelBadge level={problem.difficulty} />
              <Chip className="gap-1">
                <ClockIcon /> {problem.minutes} min interview
              </Chip>
              {problem.patterns.map((p) => (
                <Chip key={p}>{p}</Chip>
              ))}
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Mock interview: {problem.title}</h1>
          </div>
          <a href={problemHref(track, slug)} className="text-sm font-semibold text-sky-400 hover:text-sky-300">
            Full breakdown →
          </a>
        </header>

        {!available && (
          <div className="rounded-xl border border-dashed border-slate-600 bg-slate-900/40 p-6">
            <p className="font-semibold text-white mb-2">This mock interview isn’t available yet</p>
            <p className="text-sm text-slate-300 mb-4">Mock interviews are built from a problem’s breakdown, which hasn’t been written for this one.</p>
            <a href={HLD_INTERVIEW_HREF} className="text-sm font-semibold text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
              See the mock interviews you can do now
            </a>
          </div>
        )}
        {available && state.status === 'loading' && <ContentSkeleton />}
        {available && state.status === 'error' && <ContentError onRetry={retry} />}

        {script && !session && (
          <>
            {finished && (
              <div role="status" className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200 flex flex-wrap items-center justify-between gap-3">
                <span>Attempt saved. The problem is now marked Attempted — mark it Completed once you can do it without hints.</span>
                <button type="button" onClick={() => progressActions.setProblemStatus(track.id, slug, 'completed')} className={buttonClass}>
                  Mark Completed
                </button>
              </div>
            )}
            <Brief track={track} slug={slug} prompt={script.prompt} />
          </>
        )}

        {script && session && phase && (
          <div className="grid grid-cols-1 lg:grid-cols-[14rem_minmax(0,1fr)] gap-6">
            <aside aria-label="Interview timer and phases" className="min-w-0 lg:sticky lg:top-[120px] self-start space-y-4">
              <div className="rounded-xl border border-slate-700/80 bg-slate-800/40 p-3">
                <p className="text-xs text-slate-400">Elapsed</p>
                <p className={`text-2xl font-semibold font-mono ${elapsedMs(session) > session.minutes * 60_000 ? 'text-amber-300' : 'text-white'}`} aria-live="off">
                  {formatClock(elapsedMs(session))} <span className="text-sm text-slate-400">/ {session.minutes}:00</span>
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <button type="button" onClick={() => interviewActions.setTimerRunning(track.id, slug, !running)} className={`${buttonClass} !text-xs !px-2 !py-1`}>
                    {running ? '⏸ Pause' : '▶ Resume'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Discard this attempt? Your drafts for it will be deleted.')) interviewActions.discard(track.id, slug);
                    }}
                    className={`${buttonClass} !text-xs !px-2 !py-1 hover:!text-rose-300`}
                  >
                    Discard
                  </button>
                </div>
                {!running && <p className="mt-2 text-[11px] text-amber-300">Timer paused.</p>}
              </div>
              <nav aria-label="Interview phases">
                <ol className="flex lg:flex-col gap-1 overflow-x-auto pb-1 [scrollbar-width:thin]">
                  {PHASES.map((p, i) => {
                    const current = p.id === phase.id;
                    const spent = phaseElapsedMs(session, p.id);
                    const b = p.id === 'evaluation' ? 0 : PHASE_BUDGETS[session.minutes][p.id];
                    return (
                      <li key={p.id} className="flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => goTo(p.id)}
                          aria-current={current ? 'step' : undefined}
                          className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${focusRing} ${
                            current ? 'bg-sky-500/15 text-sky-200 font-semibold' : spent > 0 ? 'text-slate-300 hover:bg-slate-800/60' : 'text-slate-400 hover:bg-slate-800/60'
                          }`}
                        >
                          <span className="whitespace-nowrap">
                            {i + 1}. {p.short}
                          </span>
                          {b > 0 && (
                            <span className={`text-[10px] font-mono ${spent > b * 60_000 ? 'text-amber-300' : 'text-slate-400'}`}>
                              {formatClock(spent)}/{b}m
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              </nav>
            </aside>

            <div ref={panel} tabIndex={-1} className="min-w-0 focus:outline-none scroll-mt-32">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Step {phaseIndex + 1} of {PHASES.length}
                  {budget > 0 && (
                    <span className={phaseSpent > budget * 60_000 ? 'text-amber-300' : ''}>
                      {' '}
                      · {formatClock(phaseSpent)} of ~{budget} min
                    </span>
                  )}
                </p>
                <h2 className="text-2xl font-bold text-white mb-2">{phase.label}</h2>
                {phase.id !== 'evaluation' && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
                    <p className="text-slate-300">{PHASE_GUIDE[phase.id as ScriptPhase].goal}</p>
                    <p className="mt-1 text-slate-400">
                      Say something like: <span className="text-slate-400">{PHASE_GUIDE[phase.id as ScriptPhase].say}</span>
                    </p>
                  </div>
                )}
              </div>
              {body}
              <nav aria-label="Phase navigation" className="mt-8 flex flex-wrap justify-between gap-3">
                {phaseIndex > 0 ? (
                  <button type="button" onClick={() => goTo(PHASES[phaseIndex - 1].id)} className={buttonClass}>
                    <ArrowIcon direction="left" className="h-4 w-4" /> {PHASES[phaseIndex - 1].short}
                  </button>
                ) : (
                  <span />
                )}
                {phaseIndex < PHASES.length - 1 && (
                  <button type="button" onClick={() => goTo(PHASES[phaseIndex + 1].id)} className={primaryButton}>
                    Next: {PHASES[phaseIndex + 1].short} <ArrowIcon className="h-4 w-4" />
                  </button>
                )}
              </nav>
            </div>
          </div>
        )}

        <p className="mt-10 text-xs text-slate-400">
          Drafts, timings and ratings are stored in this browser only.{' '}
          <a href={problemsHref(track)} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
            Back to all problems
          </a>
        </p>
      </div>
    </main>
  );
};

export default InterviewSimulator;
