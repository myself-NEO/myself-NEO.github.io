import React from 'react';
import { JAVA_HOME } from '../../content/java';
import SectionNav, { SectionTab } from '../learn/SectionNav';

export type JavaSection = 'home' | 'problems' | 'interview' | 'notebook' | 'progress';

const TABS: SectionTab<JavaSection>[] = [
  { id: 'home', label: 'Roadmap', href: JAVA_HOME },
  { id: 'problems', label: 'Coding exercises', href: `${JAVA_HOME}/problems` },
  { id: 'interview', label: 'Interview prep', href: `${JAVA_HOME}/interview` },
  { id: 'notebook', label: 'Revision notebook', href: `${JAVA_HOME}/notebook` },
  { id: 'progress', label: 'Progress', href: `${JAVA_HOME}/progress` },
];

const JavaSectionNav: React.FC<{ active: JavaSection }> = ({ active }) => <SectionNav tabs={TABS} active={active} label="Java notebook sections" />;

export default JavaSectionNav;
