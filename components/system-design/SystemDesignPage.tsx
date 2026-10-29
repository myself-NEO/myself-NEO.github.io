import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import Navbar from '../Navbar';
import { TRACKS, findLesson, findProblem } from '../../content/system-design';
import { Track } from '../../content/system-design/types';
import { parseRoute, ROOT_HREF } from './routes';
import Landing from './Landing';
import LessonPage from './LessonPage';
import ProblemPage from './ProblemPage';
import ProblemLibrary from './ProblemLibrary';
import PlannedTrack from './PlannedTrack';
import { NotFound } from './States';

const SITE_TITLE = 'KESHAV.dev';

/** Entry point for every #system-design/* route. */
const SystemDesignPage: React.FC<{ path: string }> = ({ path }) => {
  const route = useMemo(() => parseRoute(path), [path]);
  const lld = TRACKS.lld;
  const track: Track | undefined = 'track' in route ? TRACKS[route.track] : undefined;

  // Layout effect: runs before child effects, so pages can still scroll to their own targets.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);

  useEffect(() => {
    let title = 'System Design';
    if (route.kind === 'lesson' && track) title = findLesson(track, route.slug)?.lesson.title ?? title;
    if (route.kind === 'problem' && track) title = `Design a ${findProblem(track, route.slug)?.title ?? ''}`;
    if (route.kind === 'problems') title = 'LLD Practice Problems';
    if (route.kind === 'track' && track) title = track.title;
    document.title = `${title} · ${SITE_TITLE}`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [route, track]);

  let content: React.ReactNode;
  if (route.kind === 'landing') {
    content = <Landing track={lld} plannedTrack={TRACKS.hld} />;
  } else if (route.kind === 'not-found' || !track) {
    content = (
      <main className="pt-[61px]">
        <NotFound what="page" />
      </main>
    );
  } else if (track.status === 'planned') {
    content = <PlannedTrack track={track} activeTrack={lld} />;
  } else if (route.kind === 'track') {
    content = <Landing track={track} plannedTrack={TRACKS.hld} focusRoadmap />;
  } else if (route.kind === 'lesson') {
    content = <LessonPage key={route.slug} track={track} slug={route.slug} />;
  } else if (route.kind === 'problem') {
    content = <ProblemPage key={route.slug} track={track} slug={route.slug} />;
  } else {
    content = <ProblemLibrary track={track} />;
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
