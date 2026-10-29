import React, { useEffect } from 'react';
import { Level, Track } from '../../content/shared/types';
import { hasProblemBody } from '../../content/shared/loaders';
import { problemStatus, progressActions, useProgress } from '../learn/progress';
import { lessonHref, problemHref, problemsHref, trackHref } from '../learn/routes';
import { ProgressStat, SearchPanel, StageRoadmap, useTrackProgress } from '../learn/LandingParts';
import { ArrowIcon, Chip, LEVEL_LABEL, LevelBadge, ProgressBar, StatusIcon } from '../learn/ui';

const COMPARISON: { aspect: string; lld: string; hld: string }[] = [
  { aspect: 'Question it answers', lld: 'How is the code inside one component organised?', hld: 'Which components exist and how do they talk?' },
  { aspect: 'Building blocks', lld: 'Classes, interfaces, enums, methods, patterns', hld: 'Services, databases, caches, queues, load balancers' },
  { aspect: 'Typical prompt', lld: '“Design a parking lot” — model it in Java', hld: '“Design Twitter” — serve 100M users' },
  { aspect: 'Main concerns', lld: 'Responsibilities, extensibility, correctness, testability', hld: 'Scalability, availability, latency, consistency' },
  { aspect: 'Output', lld: 'Class diagram + working code for core flows', hld: 'Architecture diagram + data model + APIs' },
  { aspect: 'Scale of thinking', lld: 'Objects and method calls (ns–ms)', hld: 'Machines and network hops (ms–s)' },
];

const Landing: React.FC<{ track: Track; plannedTrack: Track; focusRoadmap?: boolean }> = ({ track, plannedTrack, focusRoadmap }) => {
  const progress = useProgress();
  const { lessons, lessonsDone, quizzesPassed, problemsDone, problemsStarted, nextLesson, hasProgress } = useTrackProgress(track);
  const workedProblems = track.problems.filter((p) => hasProblemBody(track.id, p.slug)).length;

  useEffect(() => {
    if (focusRoadmap) document.getElementById('roadmap')?.scrollIntoView();
  }, [focusRoadmap]);

  const ctaHref = nextLesson ? lessonHref(track, nextLesson.slug) : problemsHref(track);
  const ctaLabel = !nextLesson ? 'Practise problems' : lessonsDone === 0 ? 'Start the LLD track' : 'Continue learning';

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      {/* Hero */}
      <section className="relative pt-14 pb-12 border-b border-slate-800/80">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(14,165,233,0.08),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-10 items-start">
          <div>
            <p className="text-sky-400 font-semibold mb-3 tracking-wider uppercase text-sm">System Design</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
              Learn to design software, <span className="gradient-text">one layer at a time.</span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed mb-4 max-w-2xl">
              System design has two layers. <strong className="text-slate-200">High-Level Design (HLD)</strong> decides which services,
              databases and queues a system needs. <strong className="text-slate-200">Low-Level Design (LLD)</strong> decides how the code
              inside one of those services is structured — its classes, interfaces, relationships and behaviour.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8 max-w-2xl">
              The LLD track takes you from object-oriented basics to solving advanced interview problems in Java 17+, with runnable
              examples, knowledge checks and {track.problems.length} practice problems ({workedProblems} with fully worked, tested
              solutions so far).
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
                href={problemsHref(track)}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 text-white font-bold border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                Browse practice problems
              </a>
            </div>
            {nextLesson && lessonsDone > 0 && (
              <p className="mt-4 text-sm text-slate-400">
                Up next: <a href={ctaHref} className="text-sky-400 hover:underline">{nextLesson.title}</a>
              </p>
            )}
          </div>

          <aside aria-label="Your progress" className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Your LLD progress</h2>
              {hasProgress && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all learning progress (System Design and DSA) saved in this browser?')) progressActions.reset();
                  }}
                  className="text-xs text-slate-500 hover:text-rose-300 underline underline-offset-2"
                >
                  Reset
                </button>
              )}
            </div>
            <ProgressStat label="Lessons completed" value={lessonsDone} max={lessons.length} />
            <ProgressStat label="Knowledge checks passed" value={quizzesPassed} max={lessons.length} />
            <ProgressStat label="Problems completed" value={problemsDone} max={track.problems.length} />
            <p className="text-xs text-slate-500">
              {hasProgress
                ? `${problemsStarted} problem${problemsStarted === 1 ? '' : 's'} in progress. Progress is stored in this browser only.`
                : 'Nothing tracked yet — complete a lesson or start a problem. Progress is stored in this browser only.'}
            </p>
          </aside>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Search */}
        <section aria-label="Search" className="py-10">
          <SearchPanel track={track} placeholder="Search lessons & problems — try “strategy”, “SOLID”, “concurrency”, “parking”" />
        </section>

        {/* Tracks */}
        <section aria-labelledby="tracks-heading" className="pb-14">
          <h2 id="tracks-heading" className="text-2xl font-bold mb-6">
            Learning <span className="text-sky-500">tracks</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-5">
            <div className="rounded-2xl border border-sky-500/40 bg-slate-800/60 p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-sky-300">{track.shortTitle} · Available now</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">Active</span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{track.title}</h3>
              <p className="text-sm text-sky-300/80 mb-3">{track.tagline}</p>
              <p className="text-sm text-slate-400 mb-5">{track.description}</p>
              <div className="flex flex-wrap gap-2 mb-5">
                <Chip>{track.stages.length + 1} stages</Chip>
                <Chip>{lessons.length} lessons</Chip>
                <Chip>{track.problems.length} problems</Chip>
                <Chip>Java 17+</Chip>
              </div>
              <ProgressBar value={lessonsDone} max={lessons.length} label="LLD lessons completed" />
              <div className="mt-5 flex flex-wrap gap-4 text-sm font-semibold">
                <a href={ctaHref} className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300">
                  {ctaLabel} <ArrowIcon className="h-3.5 w-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth' })}
                  className="text-slate-400 hover:text-white"
                >
                  View roadmap
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-6" aria-disabled="true">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{plannedTrack.shortTitle} · Planned</span>
                <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">Coming soon</span>
              </div>
              <h3 className="text-xl font-bold text-slate-300 mb-1">{plannedTrack.title}</h3>
              <p className="text-sm text-slate-500 mb-3">{plannedTrack.tagline}</p>
              <p className="text-sm text-slate-500 mb-4">{plannedTrack.description}</p>
              <ul className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {plannedTrack.plannedTopics?.map((t) => (
                  <li key={t.title} className="text-xs text-slate-500" title={t.description}>
                    • {t.title}
                  </li>
                ))}
              </ul>
              <a href={trackHref(plannedTrack)} className="inline-block mt-5 text-xs font-medium text-slate-400 hover:text-sky-400">
                See what’s planned →
              </a>
            </div>
          </div>
        </section>

        {/* Comparison */}
        <section aria-labelledby="compare-heading" className="pb-14">
          <h2 id="compare-heading" className="text-2xl font-bold mb-2">
            LLD vs <span className="text-sky-500">HLD</span>
          </h2>
          <p className="text-slate-400 mb-6 max-w-3xl">
            They are complementary zoom levels. An HLD box labelled “Booking Service” is designed internally with LLD. Interviews usually
            test them in separate rounds.
          </p>
          <div className="overflow-x-auto rounded-xl border border-slate-700/80">
            <table className="w-full text-left text-sm min-w-[36rem]">
              <thead className="bg-slate-900/80">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-300 w-1/5">Aspect</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-sky-300">Low-Level Design</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-slate-300">High-Level Design</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.aspect} className="border-t border-slate-800">
                    <th scope="row" className="px-4 py-3 font-medium text-slate-300 align-top">{row.aspect}</th>
                    <td className="px-4 py-3 text-slate-300 align-top">{row.lld}</td>
                    <td className="px-4 py-3 text-slate-400 align-top">{row.hld}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Roadmap */}
        <section id="roadmap" aria-labelledby="roadmap-heading" className="pb-14 scroll-mt-24">
          <h2 id="roadmap-heading" className="text-2xl font-bold mb-2">
            LLD <span className="text-sky-500">roadmap</span>
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            Work through the stages in order. Lessons marked <em>Interview essential</em> are the core; <em>deep dives</em> are best studied once
            the fundamentals feel comfortable.
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
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">
                      Stage {track.stages.length + 1} · Beginner → Advanced
                    </p>
                    <h3 className="text-lg font-bold text-white">Complete LLD Interview Problems</h3>
                    <p className="text-sm text-slate-400 mt-1">
                      Apply everything end to end: requirements, entities, class design, Java implementation, tests, concurrency and follow-ups.
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

        {/* Problems */}
        <section aria-labelledby="problems-heading" className="pb-14">
          <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
            <div>
              <h2 id="problems-heading" className="text-2xl font-bold mb-1">
                Practice <span className="text-sky-500">problems</span>
              </h2>
              <p className="text-slate-400">Grouped by difficulty. Each links back to the concepts it exercises.</p>
            </div>
            <a href={problemsHref(track)} className="text-sm font-semibold text-sky-400 hover:text-sky-300">
              Filter & search all →
            </a>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {(['beginner', 'intermediate', 'advanced'] as Level[]).map((level) => (
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
                          {!hasProblemBody(track.id, p.slug) && <span className="text-[10px] uppercase tracking-wider text-slate-500">soon</span>}
                        </a>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* Running Java locally */}
        <section aria-labelledby="run-heading" className="pb-16">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6">
            <div>
              <h2 id="run-heading" className="text-xl font-bold mb-2">Running the Java examples</h2>
              <p className="text-sm text-slate-400 mb-3">
                There is no in-browser compiler here on purpose — you will learn more by running and changing the code yourself. Every
                complete solution is a single file with a <code className="text-sky-300">main</code> method.
              </p>
              <ol className="text-sm text-slate-300 space-y-1.5 list-decimal list-inside">
                <li>Install JDK 17 or newer (e.g. Eclipse Temurin).</li>
                <li>Copy a solution with the <em>Copy</em> button into a file named after its public class.</li>
                <li>Run it directly — no build tool needed.</li>
              </ol>
            </div>
            <pre className="rounded-xl bg-slate-950/70 border border-slate-800 p-4 text-[13px] font-mono text-slate-300 overflow-x-auto self-center">
              <code>{`# Java 11+ can run a single source file directly
java ParkingLotDemo.java

# or compile first, then run
javac ParkingLotDemo.java
java ParkingLotDemo`}</code>
            </pre>
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-sm text-slate-500">
        Original content written for this site. LLD curriculum structure informed by public interview-prep material such as Hello Interview’s
        LLD guide. <a href="#" className="text-sky-400 hover:underline">Back to portfolio</a>
      </footer>
    </main>
  );
};

export default Landing;
