import { Stage, Track } from '../../shared/types';
import { hasLessonBody } from '../../shared/loaders';
import { FUNDAMENTALS } from './stages/01-fundamentals';
import { NETWORKING } from './stages/02-networking';
import { API_DATA } from './stages/03-api-data';
import { ESTIMATION } from './stages/04-estimation';
import { METHODOLOGY } from './stages/05-methodology';
import { DISTRIBUTED } from './stages/06-distributed';
import { CACHING } from './stages/07-caching';
import { MESSAGING } from './stages/08-messaging';
import { STORAGE } from './stages/09-storage';
import { PATTERNS } from './stages/10-patterns';
import { PRODUCTION } from './stages/11-production';
import { HLD_PROBLEMS } from './problems';

// The HLD track. Lesson bodies are the markdown files in ./lessons and problem breakdowns
// are in ./problems; each problem's mock interview is derived from its breakdown
// (./interview.ts). Lesson formats and required sections are listed in ./formats.ts.

export const HLD_HOME = '#system-design/hld';

/** Lessons are written stage by stage; any lesson without a markdown file is shown as "coming soon". */
const markUnwritten = (stage: Stage): Stage => ({
  ...stage,
  modules: stage.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => (hasLessonBody('hld', l.slug) ? l : { ...l, comingSoon: true })),
  })),
});

export const HLD_TRACK: Track = {
  id: 'hld',
  title: 'High-Level Design',
  shortTitle: 'HLD',
  status: 'active',
  tagline: 'Distributed systems architecture for SDE-2 and senior interviews',
  description:
    'Design the services, data stores, caches, queues and APIs that make up a whole system — and reason about scale, availability and consistency out loud.',
  stages: [FUNDAMENTALS, NETWORKING, API_DATA, ESTIMATION, METHODOLOGY, DISTRIBUTED, CACHING, MESSAGING, STORAGE, PATTERNS, PRODUCTION].map(markUnwritten),
  problems: HLD_PROBLEMS,
  basePath: HLD_HOME,
  home: { label: 'System Design', href: '#system-design' },
  hasKnowledgeChecks: true,
  notebook: true,
  assumedKnowledge: 'No distributed-systems background is assumed; being comfortable with one programming language and basic web concepts helps.',
  problemStatuses: ['not-started', 'in-progress', 'attempted', 'completed'],
  notePlaceholder: 'e.g. Cache-aside: delete the key after the DB write, never update it — avoids the stale-fill race…',
  sectionLinks: [
    { label: 'Mock interviews', href: `${HLD_HOME}/interview` },
    { label: 'Estimator', href: `${HLD_HOME}/estimator` },
    { label: 'Revision notebook', href: `${HLD_HOME}/notebook` },
    { label: 'Progress', href: `${HLD_HOME}/progress` },
  ],
  practice: {
    groupTitle: 'Practice Problems',
    noun: 'problems',
    libraryTitle: 'HLD practice problems',
    libraryIntro:
      'Classic HLD interview problems from a URL shortener to a Dynamo-style key-value store. Each breakdown derives the design step by step — clarifying questions, requirements, estimates, APIs, data model, architecture, deep dives, failures and trade-offs — and can be practised as a timed mock interview.',
    levelBlurbs: {
      beginner: 'One core flow and one interesting constraint. Perfect for practising the framework end to end.',
      intermediate: 'Real-time delivery, fan-out, media pipelines and search. Expect two or three deep dives.',
      advanced: 'Contention, money, geospatial matching, exactly-once-ish counting and consensus. Senior-level depth.',
    },
    titlePrefix: 'Design ',
    steps: [
      'Read the statement and write your clarifying questions before scrolling.',
      'Draft requirements, an estimate, APIs and a first design on paper or in the mock interview.',
    ],
    searchPlaceholder: 'Search problems by name, pattern or topic (e.g. “fan-out”, “geospatial”, “kafka”)',
    comingSoon: {
      title: 'This breakdown hasn’t been written yet',
      body: 'It is listed so the practice path is visible. You can already practise it: the summary above is the prompt, the patterns in the header are what a strong design uses, and the lessons below are the ones to review. Its full breakdown and mock interview will be published with the stages it depends on.',
    },
  },
};
