import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo } from 'react';
import Navbar from '../Navbar';
import { DSA_TRACK } from '../../content/learning';
import { practiceTopic } from '../../content/learning/practiceTopics';
import { findLesson } from '../../content/shared/curriculum';
import LessonPage from '../learn/LessonPage';
import { NotFound } from '../learn/States';
import DsaLanding from './DsaLanding';

// The practice tools are their own chunks: guide pages don't need them.
const ProblemList = lazy(() => import('./ProblemList'));
const InterviewNotes = lazy(() => import('./InterviewNotes'));
const DsaProgress = lazy(() => import('./DsaProgress'));

const SITE_TITLE = 'KESHAV.dev';

// Routes (single track, so no track segment):
//   #dsa                    landing page (roadmap)
//   #dsa/learn/<slug>       guide
//   #dsa/problems           coding questions (LeetCode list)
//   #dsa/problems/<topic>   coding questions, filtered to one practice topic
//   #dsa/notes              interview notes
//   #dsa/progress           progress dashboard
type DsaRoute =
  | { kind: 'landing' }
  | { kind: 'lesson'; slug: string }
  | { kind: 'problems'; topic?: string }
  | { kind: 'notes' }
  | { kind: 'progress' }
  | { kind: 'not-found' };

const parseRoute = (path: string): DsaRoute => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [section, slug, ...rest] = parts;
  if (rest.length > 0) return { kind: 'not-found' };
  if (!section) return { kind: 'landing' };
  if (section === 'learn' && slug) return { kind: 'lesson', slug };
  if (section === 'problems') {
    if (!slug) return { kind: 'problems' };
    return practiceTopic(slug) ? { kind: 'problems', topic: slug } : { kind: 'not-found' };
  }
  if (section === 'notes' && !slug) return { kind: 'notes' };
  if (section === 'progress' && !slug) return { kind: 'progress' };
  return { kind: 'not-found' };
};

const pageTitle = (route: DsaRoute) => {
  switch (route.kind) {
    case 'lesson':
      return findLesson(DSA_TRACK, route.slug)?.lesson.title ?? 'DSA';
    case 'problems':
      return route.topic ? `${practiceTopic(route.topic)?.title} · DSA Coding Questions` : 'DSA Coding Questions';
    case 'notes':
      return 'My DSA Interview Notes';
    case 'progress':
      return 'DSA Progress';
    default:
      return 'DSA';
  }
};

const ToolFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center text-slate-400 pt-[61px]" role="status">
    Loading…
  </div>
);

/** Entry point for every #dsa/* route. */
const DsaPage: React.FC<{ path: string }> = ({ path }) => {
  const route = useMemo(() => parseRoute(path), [path]);
  const track = DSA_TRACK;

  // Layout effect: runs before child effects, so pages can still scroll to their own targets.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);

  useEffect(() => {
    document.title = `${pageTitle(route)} · ${SITE_TITLE}`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [route]);

  let content: React.ReactNode;
  switch (route.kind) {
    case 'landing':
      content = <DsaLanding track={track} />;
      break;
    case 'lesson':
      content = <LessonPage key={route.slug} track={track} slug={route.slug} />;
      break;
    case 'problems':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <ProblemList key={route.topic ?? 'all'} track={track} presetTopic={route.topic} />
        </Suspense>
      );
      break;
    case 'notes':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <InterviewNotes track={track} />
        </Suspense>
      );
      break;
    case 'progress':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <DsaProgress track={track} />
        </Suspense>
      );
      break;
    default:
      content = (
        <main className="pt-[61px]">
          <NotFound what="page" home={track.home} />
        </main>
      );
  }

  return (
    <div className="min-h-screen selection:bg-sky-500/30">
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
          document.getElementById('main-content')?.scrollIntoView();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[70] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-sky-500 focus:text-white"
      >
        Skip to content
      </a>
      <Navbar solid activeHref={track.home.href} />
      {content}
    </div>
  );
};

export default DsaPage;
