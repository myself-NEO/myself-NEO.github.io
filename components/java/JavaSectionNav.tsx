import React from 'react';
import { JAVA_HOME } from '../../content/java';

export type JavaSection = 'home' | 'problems' | 'interview' | 'notebook' | 'progress';

const TABS: { id: JavaSection; label: string; href: string }[] = [
  { id: 'home', label: 'Roadmap', href: JAVA_HOME },
  { id: 'problems', label: 'Coding exercises', href: `${JAVA_HOME}/problems` },
  { id: 'interview', label: 'Interview prep', href: `${JAVA_HOME}/interview` },
  { id: 'notebook', label: 'Revision notebook', href: `${JAVA_HOME}/notebook` },
  { id: 'progress', label: 'Progress', href: `${JAVA_HOME}/progress` },
];

/** Tab bar for the Java section's top-level pages (lessons use the curriculum sidebar instead). */
const JavaSectionNav: React.FC<{ active: JavaSection }> = ({ active }) => (
  <nav aria-label="Java notebook sections" className="sticky top-[61px] z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
    <ul className="max-w-7xl mx-auto px-4 sm:px-6 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const current = tab.id === active;
        return (
          <li key={tab.id} className="flex-shrink-0">
            <a
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className={`inline-flex items-center px-3 py-3 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-500 ${
                current ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </a>
          </li>
        );
      })}
    </ul>
  </nav>
);

export default JavaSectionNav;
