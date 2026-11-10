import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo } from 'react';
import Navbar from '../Navbar';
import { SYSTEM_DESIGN_TRACKS as TRACKS } from '../../content/system-design';
import { findLesson, findProblem } from '../../content/shared/curriculum';
import { Track } from '../../content/shared/types';
import { parseRoute, ROOT_HREF, SystemDesignRoute } from './routes';
import Landing from './Landing';
import LessonPage from '../learn/LessonPage';
import ProblemPage from '../learn/ProblemPage';
import ProblemLibrary from '../learn/ProblemLibrary';
import PlannedTrack from './PlannedTrack';
import { NotFound } from '../learn/States';
import { Chip } from '../learn/ui';
import TrackSectionNav from './sections';
import { ProblemHeaderExtras, ProblemNotes } from './ProblemExtras';
import { hasBreakdown } from './sequence';

// Tool pages are separate chunks, and each track's mock interview is its own chunk.
const HldLanding = lazy(() => import('./hld/HldLanding'));
const InterviewList = lazy(() => import('./InterviewList'));
const HldMockInterview = lazy(() => import('./hld/HldMockInterview'));
const LldMockInterview = lazy(() => import('./lld/LldMockInterview'));
const EstimatorPage = lazy(() => import('./hld/EstimatorPage'));
const TrackNotebook = lazy(() => import('./TrackNotebook'));
const TrackProgress = lazy(() => import('./TrackProgress'));

const SITE_TITLE = 'KESHAV.dev';

const pageTitle = (route: SystemDesignRoute, track: Track | undefined) => {
  switch (route.kind) {
    case 'lesson':
      return (track && findLesson(track, route.slug)?.lesson.title) ?? 'System Design';
    case 'problem':
      return `${track?.id === 'hld' ? 'Design' : 'Design a'} ${(track && findProblem(track, route.slug)?.title) ?? ''}`;
    case 'problems':
      return `${track?.shortTitle ?? 'LLD'} Practice Problems`;
    case 'track':
      return track?.title ?? 'System Design';
    case 'interviews':
      return `${track?.shortTitle ?? ''} Mock Interviews`.trim();
    case 'interview':
      return `Mock Interview: ${(track && findProblem(track, route.slug)?.title) ?? ''}`.trim();
    case 'estimator':
      return 'Capacity Estimator';
    case 'notebook':
      return `My ${track?.shortTitle ?? ''} Revision Notebook`;
    case 'progress':
      return `${track?.shortTitle ?? ''} Progress`.trim();
    default:
      return 'System Design';
  }
};

const ToolFallback: React.FC = () => (
  <div className="min-h-[50vh] flex items-center justify-center text-slate-400 pt-[61px]" role="status">
    Loading…
  </div>
);

/** Entry point for every #system-design/* route. */
const SystemDesignPage: React.FC<{ path: string }> = ({ path }) => {
  const route = useMemo(() => parseRoute(path), [path]);
  const lld = TRACKS.lld;
  const hld = TRACKS.hld;
  const track: Track | undefined = 'track' in route ? TRACKS[route.track] : undefined;

  // Layout effect: runs before child effects, so pages can still scroll to their own targets.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);

  useEffect(() => {
    document.title = `${pageTitle(route, track)} · ${SITE_TITLE}`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [route, track]);

  let content: React.ReactNode;
  if (route.kind === 'landing') {
    content = <Landing track={lld} otherTrack={hld} />;
  } else if (route.kind === 'not-found' || !track) {
    content = (
      <main className="pt-[61px]">
        <NotFound what="page" home={{ label: 'System Design', href: ROOT_HREF }} />
      </main>
    );
  } else if (track.status === 'planned') {
    content = <PlannedTrack track={track} activeTrack={lld} />;
  } else if (route.kind === 'track') {
    content =
      track.id === 'hld' ? (
        <Suspense fallback={<ToolFallback />}>
          <HldLanding track={track} />
        </Suspense>
      ) : (
        <Landing track={track} otherTrack={hld} focusRoadmap />
      );
  } else if (route.kind === 'lesson') {
    content = <LessonPage key={route.slug} track={track} slug={route.slug} />;
  } else if (route.kind === 'problem') {
    const exists = Boolean(findProblem(track, route.slug));
    content = (
      <ProblemPage
        key={route.slug}
        track={track}
        slug={route.slug}
        headerExtra={exists ? <ProblemHeaderExtras track={track} slug={route.slug} /> : undefined}
        footerExtra={exists ? <ProblemNotes key={route.slug} track={track} slug={route.slug} /> : undefined}
      />
    );
  } else if (route.kind === 'problems') {
    content = (
      <ProblemLibrary
        track={track}
        header={<TrackSectionNav track={track} active="problems" />}
        badge={(p) => (hasBreakdown(track, p.slug) ? <Chip className="!text-violet-300 !border-violet-500/30 !bg-violet-500/10">Mock interview</Chip> : null)}
      />
    );
  } else {
    const MockInterview = track.id === 'hld' ? HldMockInterview : LldMockInterview;
    const tool =
      route.kind === 'interviews' ? (
        <InterviewList track={track} />
      ) : route.kind === 'interview' ? (
        <MockInterview key={route.slug} track={track} slug={route.slug} />
      ) : route.kind === 'estimator' ? (
        <EstimatorPage track={track} />
      ) : route.kind === 'notebook' ? (
        <TrackNotebook track={track} />
      ) : (
        <TrackProgress track={track} />
      );
    content = <Suspense fallback={<ToolFallback />}>{tool}</Suspense>;
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
      <Navbar solid activeHref={ROOT_HREF} />
      {content}
    </div>
  );
};

export default SystemDesignPage;
