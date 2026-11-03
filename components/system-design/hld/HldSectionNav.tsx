import React from 'react';
import { HLD_HOME } from '../../../content/system-design/hld';
import SectionNav, { SectionTab } from '../../learn/SectionNav';

export type HldSection = 'home' | 'problems' | 'interview' | 'estimator' | 'notebook' | 'progress';

export const HLD_PROBLEMS_HREF = `${HLD_HOME}/problems`;
export const HLD_INTERVIEW_HREF = `${HLD_HOME}/interview`;
export const HLD_ESTIMATOR_HREF = `${HLD_HOME}/estimator`;
export const HLD_NOTEBOOK_HREF = `${HLD_HOME}/notebook`;
export const HLD_PROGRESS_HREF = `${HLD_HOME}/progress`;

export const interviewHref = (slug: string) => `${HLD_INTERVIEW_HREF}/${slug}`;

const TABS: SectionTab<HldSection>[] = [
  { id: 'home', label: 'Roadmap', href: HLD_HOME },
  { id: 'problems', label: 'Practice problems', href: HLD_PROBLEMS_HREF },
  { id: 'interview', label: 'Mock interviews', href: HLD_INTERVIEW_HREF },
  { id: 'estimator', label: 'Estimator', href: HLD_ESTIMATOR_HREF },
  { id: 'notebook', label: 'Revision notebook', href: HLD_NOTEBOOK_HREF },
  { id: 'progress', label: 'Progress', href: HLD_PROGRESS_HREF },
];

const HldSectionNav: React.FC<{ active: HldSection }> = ({ active }) => <SectionNav tabs={TABS} active={active} label="HLD sections" />;

export default HldSectionNav;
