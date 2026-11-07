import React from 'react';
import { Level, Track } from '../../../content/shared/types';
import { flattenLessons } from '../../../content/shared/curriculum';
import { EVALUATION_DIMENSIONS } from '../../../content/system-design/hld/landing';
import { progressActions, problemStatus, useProgress } from '../../learn/progress';
import { notebookActions } from '../../learn/notebook';
import { interviewActions, useInterviews } from '../../learn/interviews';
import { lessonHref, problemHref, problemsHref } from '../../learn/routes';
import { ProgressStat, SearchPanel, StageRoadmap, useTrackProgress } from '../../learn/LandingParts';
import { ArrowIcon, Breadcrumbs, Chip, ClockIcon, LEVEL_LABEL, LevelBadge, ProgressBar, StatusIcon } from '../../learn/ui';
import { COMPARISON } from '../comparison';
import { ROOT_HREF } from '../routes';
import HldSectionNav, { HLD_INTERVIEW_HREF, interviewHref } from './HldSectionNav';
import { hasBreakdown, hours, learningSequence } from './sequence';

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];

const INTERVIEW_PHASES = ['Clarify', 'Requirements', 'Estimate', 'APIs', 'Data model', 'Architecture', 'Deep dives', 'Failures', 'Trade-offs', 'Self-evaluation'];

const HldLanding: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const interviews = useInterviews();
  const { lessons, lessonsDone, quizzesPassed, problemsDone, problemsStarted, problemsAttempted, nextLesson, hasProgress } = useTrackProgress(track);
  const allLessons = flattenLessons(track).map((l) => l.lesson);
  const sequence = learningSequence(track);
  const totalMinutes = allLessons.reduce((sum, l) => sum + l.minutes, 0);
  const essentialMinutes = allLessons.filter((l) => l.essential).reduce((sum, l) => sum + l.minutes, 0);
  const practiceMinutes = track.problems.reduce((sum, p) => sum + p.minutes, 0);
  const written = track.problems.filter((p) => hasBreakdown(track, p.slug));
  const allPublished = lessons.length === allLessons.length && written.length === track.problems.length;
  const checkpoints = allLessons.filter((l) => l.format === 'checkpoint').length;
  const mockDone = Object.entries(interviews.history).filter(([k, v]) => k.startsWith(`${track.id}:`) && v.length > 0).length;
  const overall = lessons.length === 0 ? 0 : Math.round((lessonsDone / lessons.length) * 100);
  const ctaHref = nextLesson ? lessonHref(track, nextLesson.slug) : problemsHref(track);
  const ctaLabel = !nextLesson ? 'Practise problems' : lessonsDone === 0 ? 'Start the HLD track' : 'Continue learning';
  const firstMock = written[0];

  const resetHld = () => {
    if (!window.confirm('Reset HLD progress, notebook entries and mock interviews saved in this browser? LLD, Java and DSA are not affected.')) return;
    progressActions.resetTrack(track.id);
    notebookActions.resetTrack(track.id);
    interviewActions.resetTrack(track.id);
  };

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <HldSectionNav active="home" />

      {/* Hero */}
      <section className="relative pt-10 pb-12 border-b border-slate-800/80">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(129,140,248,0.08),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6">
          <Breadcrumbs items={[{ label: 'System Design', href: ROOT_HREF }, { label: track.title }]} />
          <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-10 items-start">
            <div>
              <p className="text-sky-400 font-semibold mb-3 tracking-wider uppercase text-sm">System Design · HLD</p>
              <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
                Design systems that scale, <span className="gradient-text">and defend every box.</span>
              </h1>
              <p className="text-slate-400 text-lg leading-relaxed mb-4 max-w-2xl">
                <strong className="text-slate-200">High-Level Design</strong> decides which services, data stores, caches and queues a system
                needs, how requests flow between them, and what happens when parts fail. This track teaches not only <em>what</em> each
                component is but <em>why</em> you need it, <em>when</em> to use it, how it works inside, how it scales, how it fails and
                how to explain the trade-off in a 45–60 minute interview.
              </p>
              <p className="text-slate-400 leading-relaxed mb-8 max-w-2xl">
                {track.stages.length} stages from fundamentals to production engineering: {allLessons.length} lessons with knowledge
                checks, {track.problems.length} interview problems with step-by-step breakdowns, and a guided mock-interview mode.
                {!allPublished &&
                  ` Content is published stage by stage: ${lessons.length} of ${allLessons.length} lessons and ${written.length} of ${track.problems.length} problem breakdowns are available now.`}
              </p>
              <div className="flex flex-wrap gap-3">
                <a
                  href={ctaHref}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-sky-500/20"
                >
                  {ctaLabel}
                  <ArrowIcon />
                </a>
                <a
                  href={HLD_INTERVIEW_HREF}
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 text-white font-bold border border-slate-700 hover:bg-slate-700 transition-colors"
                >
                  Try a mock interview
                </a>
              </div>
              {nextLesson && lessonsDone > 0 && (
                <p className="mt-4 text-sm text-slate-400">
                  Up next: <a href={ctaHref} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">{nextLesson.title}</a>
                </p>
              )}
            </div>

            <aside aria-label="Your progress" className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-white">Your HLD progress</h2>
                <span className="text-2xl font-semibold text-white">{overall}%</span>
              </div>
              <ProgressStat label="Lessons completed" value={lessonsDone} max={lessons.length} />
              <ProgressStat label="Knowledge checks passed" value={quizzesPassed} max={lessons.length} />
              <ProgressStat label="Problems completed" value={problemsDone} max={track.problems.length} />
              <ProgressStat label="Mock interviews done" value={mockDone} max={written.length} />
              <p className="text-xs text-slate-400">
                {problemsStarted} in progress · {problemsAttempted} attempted. Stored in this browser only.{' '}
                {(hasProgress || mockDone > 0) && (
                  <button type="button" onClick={resetHld} className="text-slate-400 hover:text-rose-300 underline underline-offset-2">
                    Reset HLD
                  </button>
                )}
              </p>
            </aside>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <section aria-label="Track at a glance" className="py-8">
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Stages', value: track.stages.length, detail: 'plus the practice library' },
              {
                label: 'Lessons',
                value: allLessons.length,
                detail: lessons.length < allLessons.length ? `${lessons.length} available now` : `including ${checkpoints} stage checkpoints`,
              },
              { label: 'Learning time', value: `~${hours(totalMinutes)} h`, detail: `~${hours(essentialMinutes)} h for essentials only` },
              { label: 'Practice', value: `${track.problems.length} problems`, detail: `~${hours(practiceMinutes)} h of timed attempts` },
            ].map((s) => (
              <li key={s.label} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-4">
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="mt-1 text-2xl font-semibold text-white">{s.value}</p>
                <p className="mt-1 text-xs text-slate-400">{s.detail}</p>
              </li>
            ))}
          </ul>
        </section>

        <section aria-label="Search" className="pb-12">
          <SearchPanel track={track} placeholder="Search lessons & problems — try “sharding”, “kafka”, “cache”, “uber”" />
        </section>

        {/* HLD vs LLD */}
        <section aria-labelledby="compare-heading" className="pb-14">
          <h2 id="compare-heading" className="text-2xl font-bold mb-2">
            HLD vs <span className="text-sky-500">LLD</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            Two zoom levels of the same system. An HLD box labelled “Booking Service” is designed internally with LLD — see the{' '}
            <a href="#system-design/lld" className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
              LLD track
            </a>
            . Companies usually test them in separate rounds.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-700/80" tabIndex={0}>
            <table className="w-full text-left text-sm min-w-[36rem]">
              <thead className="bg-slate-900/80">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-300 w-1/5">Aspect</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-sky-300">High-Level Design</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-300">Low-Level Design</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.aspect} className="border-t border-slate-800">
                    <th scope="row" className="px-4 py-3 font-medium text-slate-300 align-top">{row.aspect}</th>
                    <td className="px-4 py-3 text-slate-300 align-top">{row.hld}</td>
                    <td className="px-4 py-3 text-slate-400 align-top">{row.lld}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Evaluation */}
        <section aria-labelledby="evaluate-heading" className="pb-14">
          <h2 id="evaluate-heading" className="text-2xl font-bold mb-2">
            What interviewers <span className="text-sky-500">evaluate</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            The same six dimensions at every level; the bar moves. At senior level you are expected to lead — find the hard parts yourself
            and bring the trade-offs before you are asked.{' '}
            <a href={lessonHref(track, 'interview-rubric')} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">
              More in the rubric lesson
            </a>
            .
          </p>
          <ul className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {EVALUATION_DIMENSIONS.map((d) => (
              <li key={d.title} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <h3 className="font-bold text-white mb-1">{d.title}</h3>
                <p className="text-sm text-slate-400 mb-3">{d.looksFor}</p>
                <dl className="space-y-2 text-sm">
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300">SDE-2</dt>
                    <dd className="text-slate-300">{d.sde2}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wider text-violet-300">Senior</dt>
                    <dd className="text-slate-300">{d.senior}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </section>

        {/* Roadmap */}
        <section id="roadmap" aria-labelledby="roadmap-heading" className="pb-14 scroll-mt-28">
          <h2 id="roadmap-heading" className="text-2xl font-bold mb-2">
            HLD <span className="text-sky-500">roadmap</span>
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            Beginner to advanced, and each stage ends with a checkpoint. Lessons marked <em>deep dive</em> can wait until the
            fundamentals feel comfortable.
            {lessons.length < allLessons.length && (
              <>
                {' '}
                Stages still being written are marked <em>coming soon</em> and list what they will cover.
              </>
            )}
          </p>
          <StageRoadmap
            track={track}
            after={
              <li className="relative pl-14">
                <span className="absolute left-0 top-4 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border-2 bg-slate-900 border-violet-400/60 text-violet-300" aria-hidden="true">
                  {track.stages.length + 1}
                </span>
                <div className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Stage {track.stages.length + 1} · Beginner → Advanced</p>
                      <h3 className="text-lg font-bold text-white">HLD Interview Problems</h3>
                      <p className="text-sm text-slate-400 mt-1">
                        {track.problems.length} problems, each derived step by step and practisable as a timed mock interview.
                      </p>
                    </div>
                    <a
                      href={problemsHref(track)}
                      className="flex-shrink-0 inline-flex items-center gap-1.5 self-start px-3.5 py-2 rounded-lg bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-200 hover:border-sky-500/60 hover:text-sky-300 transition-colors"
                    >
                      Open library <ArrowIcon className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <div className="mt-4 flex items-center gap-2 w-full sm:w-64">
                    <ProgressBar value={problemsDone} max={track.problems.length} label="Problems completed" />
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {problemsDone}/{track.problems.length}
                    </span>
                  </div>
                </div>
              </li>
            }
          />
        </section>

        {/* Sequence */}
        <section aria-labelledby="sequence-heading" className="pb-14">
          <h2 id="sequence-heading" className="text-2xl font-bold mb-2">
            Recommended <span className="text-sky-500">learning sequence</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            Practise problems as soon as their prerequisite lessons are behind you rather than saving them all for the end. Each problem
            appears after the last stage it depends on.
          </p>
          <ol className="space-y-2">
            {sequence.map((step) => (
              <li key={step.stage.id} className="rounded-xl border border-slate-800 bg-slate-900/40 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="font-semibold text-slate-100">
                    <span className="text-slate-400 mr-1.5">Stage {step.stage.number}</span>
                    {step.stage.title}
                  </p>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                    <ClockIcon /> ~{hours(step.minutes)} h · {step.lessons} lessons{step.written < step.lessons ? ` (${step.written} available)` : ''}
                  </span>
                </div>
                {step.problems.length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-violet-300">Then practise:</span>
                    {step.problems.map((p) => (
                      <a
                        key={p.slug}
                        href={problemHref(track, p.slug)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-300"
                      >
                        <StatusIcon status={problemStatus(progress, track.id, p.slug)} className="h-3.5 w-3.5" />
                        {p.title}
                        {!hasBreakdown(track, p.slug) && <span className="text-[10px] uppercase tracking-wider text-slate-400">soon</span>}
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Problems */}
        <section aria-labelledby="problems-heading" className="pb-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="problems-heading" className="text-2xl font-bold mb-1">
                Practice <span className="text-sky-500">problems</span>
              </h2>
              <p className="text-slate-400">Grouped by difficulty. Each lists the lessons to review first.</p>
            </div>
            <a href={problemsHref(track)} className="text-sm font-semibold text-sky-400 hover:text-sky-300">
              Filter & search all →
            </a>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {LEVELS.map((level) => (
              <div key={level} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white">{LEVEL_LABEL[level]}</h3>
                  <LevelBadge level={level} />
                </div>
                <ul className="space-y-1">
                  {track.problems
                    .filter((p) => p.difficulty === level)
                    .map((p) => (
                      <li key={p.slug}>
                        <a href={problemHref(track, p.slug)} className="flex items-center gap-2 py-1 text-sm text-slate-300 hover:text-sky-300">
                          <StatusIcon status={problemStatus(progress, track.id, p.slug)} className="h-4 w-4 flex-shrink-0" />
                          {p.title}
                          {!hasBreakdown(track, p.slug) && <span className="text-[10px] uppercase tracking-wider text-slate-400">soon</span>}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Mock interviews */}
        <section aria-labelledby="mock-heading" className="pb-16">
          <div className="rounded-2xl border border-violet-500/30 bg-violet-500/[0.04] p-6 grid md:grid-cols-[minmax(0,1fr)_auto] gap-6 items-center">
            <div>
              <h2 id="mock-heading" className="text-xl font-bold mb-2">
                Guided mock interviews
              </h2>
              <p className="text-sm text-slate-400 mb-4 max-w-2xl">
                Work a problem the way the interview runs: ask clarifying questions and get scripted interviewer answers, write requirements
                and APIs, estimate with the built-in calculator, draw your architecture as a Mermaid diagram, then open hints and the reference
                design only when you choose. A timer tracks each phase against a 45- or 60-minute plan, and you finish by rating yourself
                on the interview rubric. Feedback is deterministic keyword coverage plus your own self-assessment — there is no AI grading.
              </p>
              <ol className="flex flex-wrap gap-1.5" aria-label="Mock interview phases">
                {INTERVIEW_PHASES.map((p, i) => (
                  <li key={p}>
                    <Chip>
                      {i + 1}. {p}
                    </Chip>
                  </li>
                ))}
              </ol>
            </div>
            <div className="flex flex-col gap-2">
              {firstMock && (
                <a href={interviewHref(firstMock.slug)} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-semibold text-sm">
                  Start: {firstMock.title} <ArrowIcon className="h-4 w-4" />
                </a>
              )}
              <a href={HLD_INTERVIEW_HREF} className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-700 text-slate-200 font-semibold text-sm hover:bg-slate-800">
                All mock interviews
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-sm text-slate-400">
        Original content written for this site. HLD curriculum structure and problem selection informed by public interview-prep material
        such as Hello Interview’s System Design course. <a href={ROOT_HREF} className="text-sky-400 underline underline-offset-2 decoration-sky-400/40 hover:decoration-sky-300">Back to System Design</a>
      </footer>
    </main>
  );
};

export default HldLanding;
