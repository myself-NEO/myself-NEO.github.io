import React from 'react';
import { Track } from '../../content/shared/types';
import { isLessonComplete, progressActions, useProgress } from '../learn/progress';
import { lessonHref } from '../learn/routes';
import { ProgressStat, SearchPanel, StageRoadmap, useTrackProgress } from '../learn/LandingParts';
import { ArrowIcon, Chip } from '../learn/ui';

const STUDY_STEPS: { title: string; body: string }[] = [
  {
    title: 'Read each guide once, slowly',
    body: 'Every guide builds its topic from first principles before the patterns. The first pass is about the mental model, not memorising code.',
  },
  {
    title: 'Type the Java templates yourself',
    body: 'Each pattern comes with a Java template. Typing it out (not copying) is what makes it available under interview pressure.',
  },
  {
    title: 'Attempt problems before revealing',
    body: 'Practice problems hide their answers. Commit to an approach for at least ten minutes before opening a hint or solution.',
  },
  {
    title: 'Revise with the deep dives',
    body: 'The Core and Graphs cheatsheets revisit every topic with internals, harder variants and self-checked drills.',
  },
];

const formatDuration = (minutes: number) => (minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 6) / 10} h`);

const DsaLanding: React.FC<{ track: Track }> = ({ track }) => {
  const progress = useProgress();
  const { lessons, lessonsDone, nextLesson, hasProgress } = useTrackProgress(track);
  const totalMinutes = lessons.reduce((sum, l) => sum + l.minutes, 0);
  const remainingMinutes = lessons
    .filter((l) => !isLessonComplete(progress, track.id, l.slug))
    .reduce((sum, l) => sum + l.minutes, 0);
  const ctaHref = nextLesson ? lessonHref(track, nextLesson.slug) : lessonHref(track, lessons[0].slug);
  const ctaLabel = !nextLesson ? 'Review the guides' : lessonsDone === 0 ? 'Start with the Cheatsheet' : 'Continue learning';

  return (
    <main id="main-content" tabIndex={-1} className="focus:outline-none pt-[61px]">
      <section className="relative pt-14 pb-12 border-b border-slate-800/80">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_30%_20%,rgba(129,140,248,0.08),transparent_60%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-10 items-start">
          <div>
            <p className="text-sky-400 font-semibold mb-3 tracking-wider uppercase text-sm">Data Structures &amp; Algorithms</p>
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1] mb-5">
              Crack coding interviews, <span className="gradient-text">one pattern at a time.</span>
            </h1>
            <p className="text-slate-400 text-lg leading-relaxed mb-4 max-w-2xl">
              Interview-focused guides written for Java engineers. Each one builds a topic from scratch, then teaches the patterns,
              templates and pitfalls that keep showing up in coding interviews.
            </p>
            <p className="text-slate-400 leading-relaxed mb-8 max-w-2xl">
              {lessons.length} guides across {track.stages.length} stages — about {Math.round(totalMinutes / 60)} hours of reading — with
              practice problems whose answers stay hidden until you're ready.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={ctaHref}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-sky-500/20"
              >
                {ctaLabel}
                <ArrowIcon />
              </a>
              <button
                type="button"
                onClick={() => document.getElementById('roadmap')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl bg-slate-800 text-white font-bold border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                View the roadmap
              </button>
            </div>
            {nextLesson && lessonsDone > 0 && (
              <p className="mt-4 text-sm text-slate-400">
                Up next: <a href={ctaHref} className="text-sky-400 hover:underline">{nextLesson.title}</a>
              </p>
            )}
          </div>

          <aside aria-label="Your progress" className="rounded-2xl border border-slate-700/80 bg-slate-800/50 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-white">Your DSA progress</h2>
              {hasProgress && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Reset all learning progress (DSA and System Design) saved in this browser?')) progressActions.reset();
                  }}
                  className="text-xs text-slate-500 hover:text-rose-300 underline underline-offset-2"
                >
                  Reset
                </button>
              )}
            </div>
            <ProgressStat label="Guides completed" value={lessonsDone} max={lessons.length} />
            <p className="text-xs text-slate-500">
              {hasProgress
                ? remainingMinutes > 0
                  ? `About ${formatDuration(remainingMinutes)} of reading left. Progress is stored in this browser only.`
                  : 'Every guide is complete. Revisit the deep dives to keep it fresh. Progress is stored in this browser only.'
                : 'Nothing tracked yet — mark a guide complete when you finish it. Progress is stored in this browser only.'}
            </p>
          </aside>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <section aria-label="Search" className="py-10">
          <SearchPanel track={track} placeholder="Search topics — try “sliding window”, “dijkstra”, “knapsack”, “heap”" />
        </section>

        <section id="roadmap" aria-labelledby="roadmap-heading" className="pb-14 scroll-mt-24">
          <h2 id="roadmap-heading" className="text-2xl font-bold mb-2">
            DSA <span className="text-sky-500">roadmap</span>
          </h2>
          <p className="text-slate-400 mb-8 max-w-3xl">
            Work through the stages in order. Guides marked <em>Interview essential</em> are the core; the <em>deep dives</em> in stage{' '}
            {track.stages.length} are best read once the main guides feel comfortable.
          </p>
          <StageRoadmap track={track} />
        </section>

        <section aria-labelledby="study-heading" className="pb-14">
          <h2 id="study-heading" className="text-2xl font-bold mb-6">
            How to <span className="text-sky-500">study</span> these guides
          </h2>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {STUDY_STEPS.map((step, i) => (
              <li key={step.title} className="rounded-2xl border border-slate-700/80 bg-slate-800/40 p-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-sky-400 mb-2">Step {i + 1}</p>
                <h3 className="font-bold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="next-heading" className="pb-16">
          <div className="rounded-2xl border border-slate-700/80 bg-slate-900/60 p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div>
              <h2 id="next-heading" className="text-xl font-bold mb-1">
                Next: System Design
              </h2>
              <p className="text-sm text-slate-400 max-w-2xl">
                Coding rounds test algorithms; design rounds test how you structure software. The low-level design track builds on the same Java
                foundations.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip>OOP &amp; SOLID</Chip>
                <Chip>Design patterns</Chip>
                <Chip>Concurrency</Chip>
              </div>
            </div>
            <a
              href="#system-design"
              className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white font-semibold text-sm hover:bg-slate-700 transition-colors"
            >
              Explore System Design <ArrowIcon className="h-4 w-4" />
            </a>
          </div>
        </section>
      </div>

      <footer className="border-t border-slate-800 py-8 px-6 text-center text-sm text-slate-500">
        DSA notes for coding-interview preparation, in Java. <a href="#" className="text-sky-400 hover:underline">Back to portfolio</a>
      </footer>
    </main>
  );
};

export default DsaLanding;
