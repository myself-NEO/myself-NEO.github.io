import React from 'react';
import { HLD_HOME } from '../../../content/system-design/hld';
import TrackSectionNav, { SystemDesignSection } from '../sections';

// HLD's hrefs for its own pages; shared pages build them from the track (../sections).

export type HldSection = SystemDesignSection;

const HLD = { id: 'hld', basePath: HLD_HOME, shortTitle: 'HLD' } as const;

export const HLD_PROBLEMS_HREF = `${HLD_HOME}/problems`;
export const HLD_INTERVIEW_HREF = `${HLD_HOME}/interview`;
export const HLD_ESTIMATOR_HREF = `${HLD_HOME}/estimator`;
export const HLD_NOTEBOOK_HREF = `${HLD_HOME}/notebook`;
export const HLD_PROGRESS_HREF = `${HLD_HOME}/progress`;

export const interviewHref = (slug: string) => `${HLD_INTERVIEW_HREF}/${slug}`;

const HldSectionNav: React.FC<{ active: HldSection }> = ({ active }) => <TrackSectionNav track={HLD} active={active} />;

export default HldSectionNav;
