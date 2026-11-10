import React from 'react';
import { Track } from '../../content/shared/types';
import SectionNav, { SectionTab } from '../learn/SectionNav';

// The top-level pages each System Design track has besides its lessons and problems:
//   <basePath>/interview          mock interviews
//   <basePath>/interview/<slug>   one mock interview
//   <basePath>/notebook           revision notebook
//   <basePath>/progress           progress dashboard
//   <basePath>/estimator          capacity estimator (HLD only)

export type SystemDesignSection = 'home' | 'problems' | 'interview' | 'estimator' | 'notebook' | 'progress';

type TrackRef = Pick<Track, 'id' | 'basePath' | 'shortTitle'>;

export const interviewsHref = (track: TrackRef) => `${track.basePath}/interview`;
export const interviewHref = (track: TrackRef, slug: string) => `${track.basePath}/interview/${slug}`;
export const notebookHref = (track: TrackRef) => `${track.basePath}/notebook`;
export const progressHref = (track: TrackRef) => `${track.basePath}/progress`;
export const estimatorHref = (track: TrackRef) => `${track.basePath}/estimator`;

/** Whether a track has the capacity estimator page. */
export const hasEstimator = (track: Pick<Track, 'id'>) => track.id === 'hld';

/** The System Design home page (#system-design) is LLD's landing, so LLD's Roadmap tab goes there. */
const roadmapHref = (track: TrackRef) => (track.id === 'lld' ? '#system-design' : track.basePath);

const tabsFor = (track: TrackRef): SectionTab<SystemDesignSection>[] => [
  { id: 'home', label: 'Roadmap', href: roadmapHref(track) },
  { id: 'problems', label: 'Practice problems', href: `${track.basePath}/problems` },
  { id: 'interview', label: 'Mock interviews', href: interviewsHref(track) },
  ...(hasEstimator(track) ? [{ id: 'estimator' as const, label: 'Estimator', href: estimatorHref(track) }] : []),
  { id: 'notebook', label: 'Revision notebook', href: notebookHref(track) },
  { id: 'progress', label: 'Progress', href: progressHref(track) },
];

/** Tab bar of a System Design track's top-level pages. */
const TrackSectionNav: React.FC<{ track: TrackRef; active: SystemDesignSection }> = ({ track, active }) => (
  <SectionNav tabs={tabsFor(track)} active={active} label={`${track.shortTitle} sections`} />
);

export default TrackSectionNav;
