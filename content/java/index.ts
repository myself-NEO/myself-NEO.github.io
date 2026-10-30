import { Stage, Track } from '../shared/types';
import { hasLessonBody } from '../shared/loaders';
import { FUNDAMENTALS } from './stages/01-fundamentals';
import { OOP } from './stages/02-oop';
import { COLLECTIONS } from './stages/03-collections';
import { EXCEPTIONS, GENERICS } from './stages/04-exceptions-generics';
import { MODERN_JAVA } from './stages/06-modern-java';
import { JVM } from './stages/07-jvm';
import { CONCURRENCY } from './stages/08-concurrency';
import { ENGINEERING, INTERVIEW, IO } from './stages/09-io-engineering-interview';
import { JAVA_EXERCISES } from './problems';

// The Java notebook. Lesson bodies are the markdown files in ./lessons, exercise
// breakdowns are in ./problems, and the interview question bank is in ./interview.

export const JAVA_HOME = '#java';

/** Lessons are written stage by stage; any lesson without a markdown file is shown as "coming soon". */
const markUnwritten = (stage: Stage): Stage => ({
  ...stage,
  modules: stage.modules.map((m) => ({
    ...m,
    lessons: m.lessons.map((l) => (hasLessonBody('java', l.slug) ? l : { ...l, comingSoon: true })),
  })),
});

export const JAVA_TRACK: Track = {
  id: 'java',
  title: 'Java Mastery Notebook',
  shortTitle: 'Java',
  status: 'active',
  tagline: 'From first program to JVM internals and concurrency, on a Java 17 baseline',
  description:
    'A complete path through core Java, OOP, collections, exceptions, generics, modern Java, the JVM, concurrency, I/O and production engineering — built for SDE-2 and senior interviews.',
  stages: [FUNDAMENTALS, OOP, COLLECTIONS, EXCEPTIONS, GENERICS, MODERN_JAVA, JVM, CONCURRENCY, IO, ENGINEERING, INTERVIEW].map(markUnwritten),
  problems: JAVA_EXERCISES,
  basePath: JAVA_HOME,
  home: { label: 'Java', href: JAVA_HOME },
  language: 'Java 17+',
  hasKnowledgeChecks: true,
  javaVersion: 17,
  notebook: true,
  assumedKnowledge: 'No Java experience is assumed; familiarity with any programming language helps.',
  sectionLinks: [
    { label: 'Interview prep', href: `${JAVA_HOME}/interview` },
    { label: 'Tricky questions', href: `${JAVA_HOME}/interview/tricky` },
    { label: 'Revision notebook', href: `${JAVA_HOME}/notebook` },
    { label: 'Progress', href: `${JAVA_HOME}/progress` },
  ],
  practice: {
    groupTitle: 'Coding Exercises',
    noun: 'exercises',
    libraryTitle: 'Java coding exercises',
    libraryIntro:
      'Hands-on exercises from string handling to lock-free concurrency. Each has a problem statement, starter code, progressive hints, test cases and expected output, then a reference solution explained step by step, edge cases and JUnit 5 tests. Every solution compiles and runs on Java 17.',
    levelBlurbs: {
      beginner: 'One concept at a time: immutability, equals/hashCode, strings, arrays, streams.',
      intermediate: 'Data-structure internals, generics, exceptions in production code, and the classic thread-coordination problems.',
      advanced: 'Locks and conditions, deadlock avoidance, CAS, CompletableFuture and fork/join — the SDE-2 concurrency round.',
    },
    titlePrefix: '',
    steps: [
      'Read the statement and the test cases; decide the API before writing code.',
      'Copy the starter code into your IDE and make the tests pass on your own.',
      'Open hints one at a time only when stuck; compare with the solution last.',
    ],
    searchPlaceholder: 'Search exercises by name, skill or topic (e.g. “lock”, “streams”, “hashmap”)',
  },
};
