import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Track } from '../../../content/shared/types';
import { findProblem } from '../../../content/shared/curriculum';
import { loadProblemBody } from '../../../content/shared/loaders';
import type { BaseScript } from '../../../content/system-design/interviewScript';
import MarkdownContent from '../../learn/MarkdownContent';
import { elapsedMs, interviewActions, phaseElapsedMs, PhaseId, rubricScore, sessionKey, useInterviews } from '../../learn/interviews';
import { SelfRating } from '../../learn/notebook';
import { getProgress, problemStatus, progressActions, useProgress } from '../../learn/progress';
import { problemHref, problemsHref } from '../../learn/routes';
import { useSaveTools } from '../../learn/saveTools';
import { useMarkdownBody } from '../../learn/useMarkdownBody';
import { ArrowIcon, Breadcrumbs, Chip, ClockIcon, LevelBadge, StatusBadge, focusRing, onRadioGroupKeyDown, radioTabIndex } from '../../learn/ui';
import { ContentError, ContentSkeleton, NotFound } from '../../learn/States';
import { ROOT_HREF } from '../routes';
import TrackSectionNav, { interviewsHref } from '../sections';
import { hasBreakdown } from '../sequence';
import { buttonClass, formatClock, primaryButton, WidgetFallback } from './parts';
import { InterviewKit, PhaseProps } from './kit';

const Checklist = lazy(() => import('../../learn/widgets/Checklist'));

const RATINGS: { id: SelfRating; label: string; classes: string }[] = [
  { id: 'got-it', label: 'Strong', classes: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' },
  { id: 'partial', label: 'Partly', classes: 'bg-amber-500/15 border-amber-500/50 text-amber-200' },
  { id: 'missed', label: 'Missed', classes: 'bg-rose-500/15 border-rose-500/50 text-rose-200' },
];

/** Re-renders every second while the timer runs. */
const useTicker = (running: boolean) => {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
};

interface KitProps<S extends BaseScript> {
  kit: InterviewKit<S>;
}

// ── Brief (before starting, and after finishing) ───────────────────────

const Brief = <S extends BaseScript>({ track, slug, prompt, kit }: KitProps<S> & { track: Track; slug: string; prompt: string }) => {
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
            {kit.howItWorks.map((step) => (
              <li key={step}>{step}</li>
            ))}
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
            {kit.phases
              .filter((p) => p.id !== 'evaluation')
              .map((p) => (
                <li key={p.id} className="flex justify-between gap-2">
                  <span>{p.short}</span>
                  <span className="text-slate-400">{kit.budgets[minutes][p.id]} min</span>
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
                      {kit.rubric
                        .filter((r) => a.ratings[r.id] === 'missed')
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

// ── Clarifying questions ───────────────────────────────────────────────

const ClarifyPhase = <S extends BaseScript>({ track, slug, session, script, kit }: PhaseProps<S> & KitProps<S>) => {
  const [question, setQuestion] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const matched = new Set(session.asked.map((a) => a.matched).filter((m): m is number => m !== null));
  const total = script.clarifications.length;
  const showAll = Boolean(session.revealed.clarify);
  const appendix = kit.clarifyAppendix?.(script);

  const reply = (asked: string, answer: string | undefined) => answer ?? (kit.designChoice.test(asked) ? kit.designChoiceAnswer : kit.noMatchAnswer);

  const ask = () => {
    const text = question.trim();
    if (!text) return;
    const result = kit.matcher.matchClarification(text, script.clarifications, matched);
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
                <MarkdownContent markdown={reply(a.text, a.matched === null ? undefined : script.clarifications[a.matched]?.answer)} basePath={track.basePath} />
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
          placeholder={kit.clarifyPlaceholder}
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
          {appendix && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <p className="text-xs font-semibold text-slate-400 mb-1">{appendix.title}</p>
              <MarkdownContent markdown={appendix.markdown} basePath={track.basePath} />
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

// ── Self-evaluation ────────────────────────────────────────────────────

const EvaluationPhase = <S extends BaseScript>(props: PhaseProps<S> & KitProps<S> & { onFinish: () => void }) => {
  const { track, slug, session, script, tools, kit, onFinish } = props;
  const progress = useProgress();
  const rubric = kit.rubric;
  const rated = rubric.filter((r) => session.ratings[r.id]).length;
  const score = rubricScore(session.ratings, rubric.length);
  const asked = new Set(session.asked.map((a) => a.matched).filter((m): m is number => m !== null));
  const hintsUsed = Object.values(session.hints).reduce((sum, n) => sum + n, 0);
  const budgets = kit.budgets[session.minutes];
  const now = Date.now();
  const revealedBeforeDraft = (Object.keys(session.revealed) as string[]).filter((k) => k in kit.guide && !(session.drafts[k] ?? '').trim()).length;
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
              {kit.phases
                .filter((p) => p.id !== 'evaluation')
                .map((p) => {
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
        {rubric.map((r) => (
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
              <MarkdownInline text={r.strong} />
            </p>
            <p className="text-xs text-slate-400 mt-1">
              <span className="text-rose-300 font-semibold">Weak: </span>
              <MarkdownInline text={r.weak} />
            </p>
          </div>
        ))}
      </fieldset>

      {script.checklist.length > 0 && (
        <Suspense fallback={<WidgetFallback />}>
          <Checklist source={script.checklist.map((c) => `- ${c}`).join('\n')} title={kit.checklistTitle} pageKey={tools.pageKey} />
        </Suspense>
      )}

      {kit.evaluationExtra?.(props)}

      <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-white">
            Self-score: {score}% {rated < rubric.length && <span className="text-sm font-normal text-slate-400">({rated} of {rubric.length} rated)</span>}
          </p>
          <p className="text-sm text-slate-400">
            Finishing saves this attempt and marks the problem <em>Attempted</em> (currently <StatusBadge status={status} />). Areas you rate
            “Missed” go on your revision list.
          </p>
        </div>
        <button type="button" onClick={onFinish} disabled={rated < rubric.length} className={`${primaryButton} disabled:bg-slate-700 disabled:text-slate-400`}>
          Finish interview
        </button>
      </div>
    </div>
  );
};

/** Rubric text may use `code` spans; everything else is plain text. */
const MarkdownInline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(`[^`]+`)/).map((part, i) =>
      part.startsWith('`') && part.endsWith('`') && part.length > 1 ? (
        <code key={i} className="font-mono text-[0.95em] text-sky-300">
          {part.slice(1, -1)}
        </code>
      ) : (
        part
      ),
    )}
  </>
);

// ── Page ───────────────────────────────────────────────────────────────

/** #system-design/<track>/interview/<slug>: one problem as a timed, guided mock interview. */
const MockInterview = <S extends BaseScript>({ track, slug, kit }: KitProps<S> & { track: Track; slug: string }) => {
  const problem = findProblem(track, slug);
  const available = Boolean(problem) && hasBreakdown(track, slug);
  const { state, retry } = useMarkdownBody(() => (available ? loadProblemBody(track.id, slug) : Promise.resolve('')), `${track.id}/interview/${slug}`);
  const script = useMemo(() => (state.status === 'ready' ? kit.parse(state.body) : null), [state, kit]);
  const interviews = useInterviews();
  const session = interviews.sessions[sessionKey(track.id, slug)];
  const tools = useSaveTools(track, { kind: 'problem', slug, title: problem?.title ?? slug, topic: 'problems', href: problemHref(track, slug) });
  const [finished, setFinished] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const listHref = interviewsHref(track);
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
        <NotFound what="problem" home={{ label: 'Mock interviews', href: listHref }} />
      </main>
    );
  }

  const phases = kit.phases;

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
      score: rubricScore(session.ratings, kit.rubric.length),
      clarifyCoverage: script.clarifications.length ? matched.size / script.clarifications.length : 0,
      hintsUsed: Object.values(session.hints).reduce((sum, n) => sum + n, 0),
    });
    if (problemStatus(getProgress(), track.id, slug) !== 'completed') progressActions.setProblemStatus(track.id, slug, 'attempted');
    setFinished(true);
  };

  // A session saved under phases another version used falls back to the first phase.
  const found = session ? phases.findIndex((p) => p.id === session.phase) : -1;
  const phaseIndex = session ? Math.max(0, found) : -1;
  const phase = session ? phases[phaseIndex] : undefined;
  const running = Boolean(session?.runningSince);
  const budget = session && phase && phase.id !== 'evaluation' ? kit.budgets[session.minutes][phase.id] : 0;
  const phaseSpent = session && phase ? phaseElapsedMs(session, phase.id) : 0;
  const guide = phase ? kit.guide[phase.id] : undefined;

  let body: React.ReactNode = null;
  if (session && script && phase) {
    const props: PhaseProps<S> = { track, slug, session, script, tools };
    body =
      phase.id === 'clarify' ? (
        <ClarifyPhase {...props} kit={kit} />
      ) : phase.id === 'evaluation' ? (
        <EvaluationPhase {...props} kit={kit} onFinish={finish} />
      ) : (
        kit.renderPhase(phase.id, props)
      );
  }

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <TrackSectionNav track={track} active="interview" />
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title, href: track.basePath }, { label: 'Mock interviews', href: listHref }, { label: problem.title }]} />
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
            <a href={listHref} className="text-sm font-semibold text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
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
            <Brief track={track} slug={slug} prompt={script.prompt} kit={kit} />
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
                  {phases.map((p, i) => {
                    const current = p.id === phase.id;
                    const spent = phaseElapsedMs(session, p.id);
                    const b = p.id === 'evaluation' ? 0 : kit.budgets[session.minutes][p.id];
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
                  Step {phaseIndex + 1} of {phases.length}
                  {budget > 0 && (
                    <span className={phaseSpent > budget * 60_000 ? 'text-amber-300' : ''}>
                      {' '}
                      · {formatClock(phaseSpent)} of ~{budget} min
                    </span>
                  )}
                </p>
                <h2 className="text-2xl font-bold text-white mb-2">{phase.label}</h2>
                {guide && (
                  <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-4 py-3 text-sm">
                    <p className="text-slate-300">{guide.goal}</p>
                    <p className="mt-1 text-slate-400">
                      Say something like: <span className="text-slate-400">{guide.say}</span>
                    </p>
                  </div>
                )}
              </div>
              {body}
              <nav aria-label="Phase navigation" className="mt-8 flex flex-wrap justify-between gap-3">
                {phaseIndex > 0 ? (
                  <button type="button" onClick={() => goTo(phases[phaseIndex - 1].id)} className={buttonClass}>
                    <ArrowIcon direction="left" className="h-4 w-4" /> {phases[phaseIndex - 1].short}
                  </button>
                ) : (
                  <span />
                )}
                {phaseIndex < phases.length - 1 && (
                  <button type="button" onClick={() => goTo(phases[phaseIndex + 1].id)} className={primaryButton}>
                    Next: {phases[phaseIndex + 1].short} <ArrowIcon className="h-4 w-4" />
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

export default MockInterview;
