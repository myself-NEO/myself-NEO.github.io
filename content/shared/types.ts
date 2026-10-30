// Content model shared by the learning sections of the site (System Design, DSA, Java).
// A Track is self-describing: its base route, home link and content drive the shared
// learning UI in components/learn, so a new track needs data, not new components.

export type TrackId = 'lld' | 'hld' | 'dsa' | 'java';
export type Level = 'beginner' | 'intermediate' | 'advanced';

export interface LessonMeta {
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  level: Level;
  /** true = must-know for interviews, false = deep dive to study after the fundamentals */
  essential: boolean;
  objectives: string[];
  /** lesson slugs */
  prerequisites: string[];
  /** lesson slugs */
  related: string[];
  /** problem slugs */
  problems: string[];
  tags?: string[];
  /** Listed in the curriculum, but its content has not been written yet. */
  comingSoon?: boolean;
  /** Minimum Java release the lesson's examples need, when newer than the track baseline. */
  javaVersion?: number;
}

export interface CurriculumModule {
  id: string;
  title: string;
  lessons: LessonMeta[];
}

export interface Stage {
  id: string;
  number: number;
  title: string;
  levelLabel: string;
  description: string;
  modules: CurriculumModule[];
}

export interface ProblemMeta {
  slug: string;
  title: string;
  difficulty: Level;
  summary: string;
  minutes: number;
  /** display names of the patterns the reference solution uses */
  patterns: string[];
  /** lesson slugs worth reviewing before attempting */
  concepts: string[];
  tags: string[];
}

/** Wording for a track's practice library, sidebar group and problem pages. */
export interface PracticeCopy {
  /** Name of the practice group, e.g. "Practice Problems" or "Coding Exercises". */
  groupTitle: string;
  /** Plural noun used in links and counts, e.g. "problems" or "exercises". */
  noun: string;
  libraryTitle: string;
  libraryIntro: string;
  levelBlurbs: Record<Level, string>;
  /** Prepended to a problem's title on its page, e.g. "Design a ". */
  titlePrefix: string;
  /** "How to practise" steps shown on every problem page. */
  steps: string[];
  searchPlaceholder: string;
}

export interface PlannedTopic {
  title: string;
  description: string;
}

export interface Track {
  id: TrackId;
  title: string;
  shortTitle: string;
  status: 'active' | 'planned';
  tagline: string;
  description: string;
  stages: Stage[];
  problems: ProblemMeta[];
  /** Route prefix for this track, e.g. "#system-design/lld" or "#dsa". */
  basePath: string;
  /** The section the track belongs to: first breadcrumb and the sidebar "home" link. */
  home: { label: string; href: string };
  /** Language of the code examples, shown next to the track title. */
  language?: string;
  /** Whether lessons end with knowledge-check quizzes (drives progress stats and hints). */
  hasKnowledgeChecks: boolean;
  /** shown while a track is planned */
  plannedTopics?: PlannedTopic[];
  /** Practice-library wording; System Design's LLD wording is used when absent. */
  practice?: PracticeCopy;
  /** Baseline Java release of runnable examples, shown as a version badge on code blocks. */
  javaVersion?: number;
  /** Extra pages of the section (interview prep, notebook, …) linked from the sidebar. */
  sectionLinks?: { label: string; href: string }[];
  /** Turns on the personal revision tools (bookmarks, notes, saved snippets) on lesson pages. */
  notebook?: boolean;
  /** Shown for lessons without prerequisites; defaults to "Basic <language> syntax is assumed." */
  assumedKnowledge?: string;
}

export type ProblemStatus = 'not-started' | 'in-progress' | 'completed';
