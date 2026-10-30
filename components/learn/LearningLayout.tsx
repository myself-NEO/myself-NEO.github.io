import React, { useEffect, useRef, useState } from 'react';
import { Track } from '../../content/shared/types';
import Sidebar, { SidebarCurrent } from './Sidebar';
import { SidebarIcon } from './ui';

export interface Heading {
  id: string;
  text: string;
  /** 1 = a part heading (multi-part notes), 2 = a section */
  level: 1 | 2;
}

/** The notes' own in-text contents lists aren't repeated in the "On this page" rail. */
const isContentsHeading = (text: string) => /^\s*table of contents\s*$/i.test(text);

/** Collects the h1/h2 headings rendered inside `container` once `ready` is true. */
export const useHeadings = (container: React.RefObject<HTMLElement | null>, ready: boolean, key: string) => {
  const [headings, setHeadings] = useState<Heading[]>([]);
  useEffect(() => {
    if (!ready || !container.current) {
      setHeadings([]);
      return;
    }
    const found: Heading[] = Array.from(container.current.querySelectorAll<HTMLHeadingElement>('h1[id], h2[id]'))
      .map((h) => ({ id: h.id, text: h.textContent ?? '', level: h.tagName === 'H1' ? (1 as const) : (2 as const) }))
      .filter((h) => !isContentsHeading(h.text));
    setHeadings(found);
  }, [container, ready, key]);
  return headings;
};

/** The active heading is the last one whose top has scrolled above a line just below the navbar. */
export const useActiveHeading = (headings: Heading[]) => {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    if (headings.length === 0) return;
    const ACTIVATION_LINE = 120;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current: string | null = headings[0].id;
      for (const h of headings) {
        const el = document.getElementById(h.id);
        if (el && el.getBoundingClientRect().top <= ACTIVATION_LINE) current = h.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headings]);
  return active;
};

const scrollToHeading = (id: string) => {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

export const TableOfContents: React.FC<{ headings: Heading[]; active: string | null }> = ({ headings, active }) => {
  if (headings.length === 0) return null;
  return (
    <nav aria-label="On this page">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">On this page</p>
      <ul className="space-y-1 border-l border-slate-800">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={() => scrollToHeading(h.id)}
              className={`block w-full text-left -ml-px border-l py-1 leading-snug transition-colors focus:outline-none focus-visible:text-white ${
                h.level === 1 ? 'pl-3 pt-3 text-[11px] font-semibold uppercase tracking-wider' : 'pl-3 text-[13px]'
              } ${
                active === h.id
                  ? 'border-sky-400 text-sky-300'
                  : h.level === 1
                  ? 'border-transparent text-slate-500 hover:text-slate-200'
                  : 'border-transparent text-slate-400 hover:text-slate-100'
              }`}
            >
              {h.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
};

interface LearningLayoutProps {
  track: Track;
  current?: SidebarCurrent;
  headings: Heading[];
  /** Called when the section being read changes (also on small screens, where the contents rail is hidden). */
  onActiveHeading?: (id: string | null) => void;
  children: React.ReactNode;
}

const COLLAPSED_KEY = 'learning-sidebar-collapsed';

const readCollapsed = () => {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

/** Three-column learning layout: curriculum sidebar, content, and "on this page" contents. */
const LearningLayout: React.FC<LearningLayoutProps> = ({ track, current, headings, onActiveHeading, children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const closeButton = useRef<HTMLButtonElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const expandButton = useRef<HTMLButtonElement>(null);
  const collapseButton = useRef<HTMLButtonElement>(null);
  const active = useActiveHeading(headings);

  useEffect(() => {
    onActiveHeading?.(active);
  }, [active, onActiveHeading]);

  const setSidebarCollapsed = (value: boolean) => {
    setCollapsed(value);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, value ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
    // Keep keyboard focus on the control that replaced the one just pressed.
    requestAnimationFrame(() => (value ? expandButton : collapseButton).current?.focus());
  };

  const collapseControl = (
    <button
      ref={collapseButton}
      type="button"
      onClick={() => setSidebarCollapsed(true)}
      aria-label="Collapse curriculum sidebar"
      title="Collapse sidebar"
      className="hidden lg:inline-flex w-7 h-7 items-center justify-center rounded-md text-slate-500 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
    >
      <SidebarIcon className="h-4 w-4" />
    </button>
  );

  useEffect(() => {
    const close = () => setDrawerOpen(false);
    window.addEventListener('hashchange', close);
    return () => window.removeEventListener('hashchange', close);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    closeButton.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        openButton.current?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="pt-[61px]">
      {/* Mobile / tablet bar */}
      <div className="lg:hidden sticky top-[61px] z-30 bg-slate-900/95 backdrop-blur border-b border-slate-800">
        <div className="px-4 sm:px-6 py-2 flex items-center justify-between gap-3">
          <button
            ref={openButton}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-expanded={drawerOpen}
            aria-controls="curriculum-drawer"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
            </svg>
            Curriculum
          </button>
          <span className="text-xs text-slate-500 truncate">
            {track.title}
            {track.language ? ` · ${track.language}` : ''}
          </span>
        </div>
      </div>

      <div
        className={`max-w-[90rem] mx-auto lg:grid ${
          collapsed
            ? 'lg:grid-cols-[3.25rem_minmax(0,1fr)] xl:grid-cols-[3.25rem_minmax(0,1fr)_13rem]'
            : 'lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_13rem]'
        }`}
      >
        <aside className="hidden lg:block sticky top-[61px] h-[calc(100vh-61px)] overflow-y-auto border-r border-slate-800/80">
          {collapsed ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <button
                ref={expandButton}
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Expand curriculum sidebar"
                title="Show curriculum"
                className="w-8 h-8 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              >
                <SidebarIcon collapsed className="h-5 w-5" />
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600 [writing-mode:vertical-rl] rotate-180 select-none">
                Curriculum
              </span>
            </div>
          ) : (
            <Sidebar track={track} current={current} headerAction={collapseControl} />
          )}
        </aside>

        <main id="main-content" tabIndex={-1} className="focus:outline-none min-w-0 px-4 sm:px-8 lg:px-10 py-8 lg:py-10">
          <div className="max-w-3xl mx-auto">{children}</div>
        </main>

        <aside className="hidden xl:block sticky top-[61px] h-[calc(100vh-61px)] overflow-y-auto py-10 pr-6">
          <TableOfContents headings={headings} active={active} />
        </aside>
      </div>

      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Curriculum">
          <div className="absolute inset-0 bg-slate-950/70" onClick={() => setDrawerOpen(false)} aria-hidden="true" />
          <div id="curriculum-drawer" className="absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-slate-900 border-r border-slate-800 overflow-y-auto shadow-2xl">
            <div className="flex justify-end p-2">
              <button
                ref={closeButton}
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                aria-label="Close curriculum"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <Sidebar track={track} current={current} />
          </div>
        </div>
      )}
    </div>
  );
};

export default LearningLayout;
