import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo } from 'react';
import Navbar from '../Navbar';
import { JAVA_HOME, JAVA_TRACK } from '../../content/java';
import { findLesson, findProblem } from '../../content/shared/curriculum';
import { INTERVIEW_TOPICS, topicTitle } from '../../content/java/interview';
import LessonPage from '../learn/LessonPage';
import ProblemPage from '../learn/ProblemPage';
import ProblemLibrary from '../learn/ProblemLibrary';
import { NotFound } from '../learn/States';
import JavaLanding from './JavaLanding';
import JavaSectionNav from './JavaSectionNav';

// The interactive tools are their own chunks: lesson pages don't need them.
const InterviewBank = lazy(() => import('./InterviewBank'));
const Notebook = lazy(() => import('./Notebook'));
const Dashboard = lazy(() => import('./Dashboard'));

const SITE_TITLE = 'KESHAV.dev';

// Routes:
//   #java                        landing (roadmap)
//   #java/learn/<slug>           lesson
//   #java/problems               coding exercises
//   #java/problems/<slug>        exercise
//   #java/interview              question bank
//   #java/interview/tricky       tricky questions
//   #java/interview/<topic>      question bank filtered to one topic
//   #java/notebook               revision notebook
//   #java/progress               progress dashboard
type JavaRoute =
  | { kind: 'landing' }
  | { kind: 'lesson'; slug: string }
  | { kind: 'problems' }
  | { kind: 'problem'; slug: string }
  | { kind: 'interview'; preset?: string }
  | { kind: 'notebook' }
  | { kind: 'progress' }
  | { kind: 'not-found' };

const parseRoute = (path: string): JavaRoute => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const [section, slug, ...rest] = parts;
  if (rest.length > 0) return { kind: 'not-found' };
  if (!section) return { kind: 'landing' };
  if (section === 'learn' && slug) return { kind: 'lesson', slug };
  if (section === 'problems') return slug ? { kind: 'problem', slug } : { kind: 'problems' };
  if (section === 'interview') {
    if (!slug) return { kind: 'interview' };
    return slug === 'tricky' || INTERVIEW_TOPICS.some((t) => t.id === slug) ? { kind: 'interview', preset: slug } : { kind: 'not-found' };
  }
  if (section === 'notebook' && !slug) return { kind: 'notebook' };
  if (section === 'progress' && !slug) return { kind: 'progress' };
  return { kind: 'not-found' };
};

const pageTitle = (route: JavaRoute) => {
  switch (route.kind) {
    case 'lesson':
      return findLesson(JAVA_TRACK, route.slug)?.lesson.title ?? 'Java';
    case 'problem':
      return findProblem(JAVA_TRACK, route.slug)?.title ?? 'Java';
    case 'problems':
      return 'Java Coding Exercises';
    case 'interview':
      if (route.preset === 'tricky') return 'Java Tricky Questions';
      return route.preset ? `${topicTitle(route.preset)} Interview Questions` : 'Java Interview Questions';
    case 'notebook':
      return 'My Java Revision Notebook';
    case 'progress':
      return 'Java Progress';
    default:
      return 'Java Mastery Notebook';
  }
};

const ToolFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center text-slate-400" role="status">
    Loading…
  </div>
);

/** Entry point for every #java/* route. */
const JavaPage: React.FC<{ path: string }> = ({ path }) => {
  const route = useMemo(() => parseRoute(path), [path]);
  const track = JAVA_TRACK;

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
      content = <JavaLanding track={track} />;
      break;
    case 'lesson':
      content = <LessonPage key={route.slug} track={track} slug={route.slug} />;
      break;
    case 'problem':
      content = <ProblemPage key={route.slug} track={track} slug={route.slug} />;
      break;
    case 'problems':
      content = <ProblemLibrary track={track} header={<JavaSectionNav active="problems" />} />;
      break;
    case 'interview':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <InterviewBank key={route.preset ?? 'all'} track={track} preset={route.preset} />
        </Suspense>
      );
      break;
    case 'notebook':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <Notebook track={track} />
        </Suspense>
      );
      break;
    case 'progress':
      content = (
        <Suspense fallback={<ToolFallback />}>
          <Dashboard track={track} />
        </Suspense>
      );
      break;
    default:
      content = (
        <main className="pt-[61px]">
          <NotFound what="page" home={{ label: 'Java', href: JAVA_HOME }} />
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
      <Navbar solid activeHref={JAVA_HOME} />
      {content}
    </div>
  );
};

export default JavaPage;
