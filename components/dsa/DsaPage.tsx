import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import Navbar from '../Navbar';
import { DSA_TRACK } from '../../content/learning';
import { findLesson } from '../../content/shared/curriculum';
import LessonPage from '../learn/LessonPage';
import { NotFound } from '../learn/States';
import DsaLanding from './DsaLanding';

const SITE_TITLE = 'KESHAV.dev';

// Routes (single track, so no track segment):
//   #dsa                  landing page
//   #dsa/learn/<slug>     guide
type DsaRoute = { kind: 'landing' } | { kind: 'lesson'; slug: string } | { kind: 'not-found' };

const parseRoute = (path: string): DsaRoute => {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 0) return { kind: 'landing' };
  if (parts.length === 2 && parts[0] === 'learn') return { kind: 'lesson', slug: parts[1] };
  return { kind: 'not-found' };
};

/** Entry point for every #dsa/* route. */
const DsaPage: React.FC<{ path: string }> = ({ path }) => {
  const route = useMemo(() => parseRoute(path), [path]);
  const track = DSA_TRACK;

  // Layout effect: runs before child effects, so pages can still scroll to their own targets.
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [path]);

  useEffect(() => {
    const title = route.kind === 'lesson' ? findLesson(track, route.slug)?.lesson.title ?? 'DSA' : 'DSA';
    document.title = `${title} · ${SITE_TITLE}`;
    return () => {
      document.title = SITE_TITLE;
    };
  }, [route, track]);

  let content: React.ReactNode;
  if (route.kind === 'landing') content = <DsaLanding track={track} />;
  else if (route.kind === 'lesson') content = <LessonPage key={route.slug} track={track} slug={route.slug} />;
  else
    content = (
      <main className="pt-[61px]">
        <NotFound what="page" home={track.home} />
      </main>
    );

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
