// Content model for the System Design learning module.
// Tracks (LLD, HLD) are independent so HLD can be filled in later
// without touching the LLD curriculum or the page components.

export type TrackId = 'lld' | 'hld';
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
  /** shown while a track is planned */
  plannedTopics?: PlannedTopic[];
}

export type ProblemStatus = 'not-started' | 'in-progress' | 'completed';
