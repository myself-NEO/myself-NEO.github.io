import { Level } from '../shared/types';

// The Java interview question bank. Each topic is a markdown file in ./interview,
// loaded lazily on the interview page. Format of one question:
//
//   ### Why is `String` immutable?
//   `id: string-immutable` `level: beginner` `kind: concept` `tricky` `lessons: string-immutability`
//
//   Optional extra detail for the question, e.g. a code snippet to predict.
//
//   #### Hints
//   1. First hint
//   2. Second hint
//
//   #### Answer
//   The detailed answer (markdown).
//
//   #### Why other answers fall short
//   Common wrong or incomplete answers and why they miss.
//
//   #### Follow-up
//   A follow-up question and its answer.

export type QuestionKind = 'concept' | 'implementation' | 'internals' | 'output' | 'debugging' | 'scenario' | 'coding';

export const QUESTION_KINDS: { id: QuestionKind; label: string }[] = [
  { id: 'concept', label: 'Conceptual' },
  { id: 'implementation', label: 'Implementation' },
  { id: 'internals', label: 'Internals' },
  { id: 'output', label: 'Output prediction' },
  { id: 'debugging', label: 'Debugging' },
  { id: 'scenario', label: 'Scenario' },
  { id: 'coding', label: 'Coding' },
];

export interface InterviewTopic {
  id: string;
  title: string;
  description: string;
}

export const INTERVIEW_TOPICS: InterviewTopic[] = [
  { id: 'core-java', title: 'Core Java', description: 'Types, operators, methods, pass-by-value, main, static and final.' },
  { id: 'oop', title: 'OOP', description: 'Encapsulation, inheritance, polymorphism, interfaces, initialisation and the Object contract.' },
  { id: 'strings', title: 'Strings', description: 'Immutability, the string pool, StringBuilder, equality and encoding.' },
  { id: 'collections', title: 'Collections', description: 'Lists, sets, maps and queues: complexity, iteration, ordering and choosing.' },
  { id: 'hashmap', title: 'HashMap Internals', description: 'Hashing, buckets, resizing, treeification and thread-safety failures.' },
  { id: 'generics', title: 'Generics', description: 'Bounds, wildcards, PECS, erasure and its restrictions.' },
  { id: 'streams-lambdas', title: 'Streams & Lambdas', description: 'Functional interfaces, laziness, collectors, Optional and parallel streams.' },
  { id: 'exceptions', title: 'Exceptions', description: 'Checked vs unchecked, finally semantics, try-with-resources and design.' },
  { id: 'jvm', title: 'JVM & Class Loading', description: 'Architecture, class loading, bytecode, JIT and memory areas.' },
  { id: 'garbage-collection', title: 'Garbage Collection', description: 'Reachability, generations, collectors, references and leaks.' },
  { id: 'multithreading', title: 'Multithreading', description: 'Threads, lifecycle, interrupts, wait/notify and synchronized.' },
  { id: 'concurrency', title: 'Concurrency', description: 'JMM, volatile, locks, atomics, executors, CompletableFuture and virtual threads.' },
  { id: 'modern-java', title: 'Java 8+ Features', description: 'Records, sealed types, pattern matching, switch expressions and the release train.' },
  { id: 'performance-memory', title: 'Performance & Memory', description: 'Profiling, benchmarking, allocation, footprint and tuning.' },
];

export interface InterviewQuestion {
  id: string;
  topic: string;
  title: string;
  level: Level;
  kind: QuestionKind;
  tricky: boolean;
  /** Lesson slugs that teach the topic. */
  lessons: string[];
  /** Extra question detail (often code), may be empty. */
  body: string;
  hints: string[];
  answer: string;
  whyNot: string;
  followUp: string;
}

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const KINDS = QUESTION_KINDS.map((k) => k.id);
const FENCE = /^\s*(`{3,}|~{3,})/;
const SECTIONS: Record<string, 'hints' | 'answer' | 'whyNot' | 'followUp'> = {
  hints: 'hints',
  answer: 'answer',
  'why other answers fall short': 'whyNot',
  'follow-up': 'followUp',
};

const parseMeta = (line: string) => {
  const meta: Record<string, string> = {};
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const token = match[1].trim();
    const colon = token.indexOf(':');
    if (colon === -1) meta[token] = 'true';
    else meta[token.slice(0, colon).trim()] = token.slice(colon + 1).trim();
  }
  return meta;
};

const parseHints = (text: string) =>
  text
    .split(/^\s*\d+\.\s+/m)
    .map((h) => h.trim())
    .filter(Boolean);

/** Parses one topic file. Malformed questions are reported through `onError` and skipped. */
export const parseInterviewTopic = (topic: string, markdown: string, onError?: (message: string) => void): InterviewQuestion[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: { title: string; lines: string[] }[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) inFence = !inFence;
    if (!inFence && line.startsWith('### ')) blocks.push({ title: line.slice(4).trim(), lines: [] });
    else blocks[blocks.length - 1]?.lines.push(line);
  }

  const questions: InterviewQuestion[] = [];
  for (const block of blocks) {
    const metaIndex = block.lines.findIndex((l) => l.trim() !== '');
    const meta = metaIndex >= 0 ? parseMeta(block.lines[metaIndex]) : {};
    if (!meta.id) {
      onError?.(`${topic}: question "${block.title}" has no id`);
      continue;
    }
    const sections: Record<'body' | 'hints' | 'answer' | 'whyNot' | 'followUp', string[]> = { body: [], hints: [], answer: [], whyNot: [], followUp: [] };
    let current: keyof typeof sections = 'body';
    let fence = false;
    for (const line of block.lines.slice(metaIndex + 1)) {
      if (FENCE.test(line)) fence = !fence;
      const heading = !fence && line.startsWith('#### ') ? SECTIONS[line.slice(5).trim().toLowerCase()] : undefined;
      if (heading) current = heading;
      else sections[current].push(line);
    }
    const level = meta.level as Level;
    const kind = meta.kind as QuestionKind;
    if (!LEVELS.includes(level) || !KINDS.includes(kind)) {
      onError?.(`${topic}: question ${meta.id} has an invalid level or kind`);
      continue;
    }
    const answer = sections.answer.join('\n').trim();
    if (!answer) {
      onError?.(`${topic}: question ${meta.id} has no answer`);
      continue;
    }
    questions.push({
      id: meta.id,
      topic,
      title: block.title,
      level,
      kind,
      tricky: meta.tricky === 'true',
      lessons: meta.lessons ? meta.lessons.split(',').map((s) => s.trim()).filter(Boolean) : [],
      body: sections.body.join('\n').trim(),
      hints: parseHints(sections.hints.join('\n')),
      answer,
      whyNot: sections.whyNot.join('\n').trim(),
      followUp: sections.followUp.join('\n').trim(),
    });
  }
  return questions;
};

const topicFiles = import.meta.glob<string>('./interview/*.md', { query: '?raw', import: 'default' });

let bankPromise: Promise<InterviewQuestion[]> | undefined;

/** Loads and parses every topic file once (in topic order). */
export const loadInterviewBank = (): Promise<InterviewQuestion[]> => {
  bankPromise ??= Promise.all(
    INTERVIEW_TOPICS.map(async (topic) => {
      const loader = topicFiles[`./interview/${topic.id}.md`];
      return loader ? parseInterviewTopic(topic.id, await loader()) : [];
    }),
  )
    .then((perTopic) => perTopic.flat())
    .catch((error: unknown) => {
      bankPromise = undefined; // allow a retry
      throw error;
    });
  return bankPromise;
};

export const topicTitle = (id: string) => INTERVIEW_TOPICS.find((t) => t.id === id)?.title ?? id;
