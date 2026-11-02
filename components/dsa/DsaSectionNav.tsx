import React from 'react';
import SectionNav, { SectionTab } from '../learn/SectionNav';

export type DsaSection = 'home' | 'problems' | 'notes' | 'progress';

export const DSA_HOME = '#dsa';
export const DSA_PROBLEMS = '#dsa/problems';
export const DSA_NOTES = '#dsa/notes';
export const DSA_PROGRESS = '#dsa/progress';

/** The coding-questions list, optionally filtered to one practice topic. */
export const dsaProblemsHref = (topic?: string) => (topic ? `${DSA_PROBLEMS}/${topic}` : DSA_PROBLEMS);

const TABS: SectionTab<DsaSection>[] = [
  { id: 'home', label: 'Roadmap', href: DSA_HOME },
  { id: 'problems', label: 'Coding questions', href: DSA_PROBLEMS },
  { id: 'notes', label: 'Interview notes', href: DSA_NOTES },
  { id: 'progress', label: 'Progress', href: DSA_PROGRESS },
];

const DsaSectionNav: React.FC<{ active: DsaSection }> = ({ active }) => <SectionNav tabs={TABS} active={active} label="DSA sections" />;

export default DsaSectionNav;
