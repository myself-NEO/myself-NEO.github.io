// Derives a mock-interview script from a problem breakdown (./problems/<slug>.md), so every
// written problem can be practised as an interview without a second copy of its content.
//
// What the breakdown provides (see ./formats.ts for the section list):
//   ## Clarifying questions   - **Q:** question?  <!-- match: optional, extra, keywords -->
//                               - **A:** the interviewer's answer
//   ## Functional / Non-functional requirements   one bullet per requirement; **bold** terms
//                               (and an optional <!-- match: … --> comment) are what coverage looks for
//   ## Capacity estimation    the first ```estimator block presets the calculator
//   ````hint blocks           hints for the phase whose sections contain them
//   ### headings under Scaling / Caching / Messaging strategy   deep-dive prompts
//   ````question blocks under Interviewer follow-up questions    follow-ups
//   ```checklist under Evaluation checklist                      the self-check list
//
// Matching is deterministic keyword overlap — the simulator says so wherever it is used.
// The scanning and matching helpers are shared with the LLD parser (../interviewScript.ts).

import {
  BaseScript,
  blockLanguage,
  blockTitle,
  CoverageItem,
  coverageItem,
  createMatcher,
  fencedBlocks,
  parseChecklistItems,
  parseClarifications,
  scan,
  splitSections,
  stripTryItFirst,
} from '../interviewScript';

export type { ClarifyItem, CoverageItem, MatchResult } from '../interviewScript';
export { fencedBlocks, parseChecklistItems, splitSections, stem, stripTryItFirst } from '../interviewScript';

export type ScriptPhase = 'clarify' | 'requirements' | 'estimation' | 'api' | 'data-model' | 'architecture' | 'deep-dives' | 'bottlenecks' | 'tradeoffs';

/** Sections of the breakdown that answer each phase, in the order they are shown. */
export const PHASE_SECTIONS: Record<ScriptPhase, string[]> = {
  clarify: ['Clarifying questions', 'Scope and exclusions'],
  requirements: ['Functional requirements', 'Non-functional requirements', 'Scope and exclusions'],
  estimation: ['Capacity estimation'],
  api: ['API design'],
  'data-model': ['Data model'],
  architecture: ['Initial high-level architecture', 'Architecture diagram', 'Request and data flow', 'Component responsibilities', 'Database and technology choices'],
  'deep-dives': ['Scaling strategy', 'Caching strategy', 'Messaging strategy'],
  bottlenecks: ['Failure scenarios', 'Bottleneck analysis'],
  tradeoffs: ['Consistency and availability trade-offs', 'Alternative designs and trade-offs', 'Security considerations', 'Monitoring and observability'],
};

export const DEEP_DIVE_SECTIONS = PHASE_SECTIONS['deep-dives'];

export interface Subsection {
  title: string;
  body: string;
  section: string;
}

export interface InterviewScript extends BaseScript {
  functional: CoverageItem[];
  nonFunctional: CoverageItem[];
  estimatorPreset?: string;
  hints: Partial<Record<ScriptPhase, string[]>>;
  deepDives: Subsection[];
  followUps: { title: string; body: string }[];
}

/** Top-level bullets of a section, each a requirement. */
const parseCoverage = (body: string): CoverageItem[] => {
  const items: CoverageItem[] = [];
  const { lines, inFence } = scan(body);
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    const m = line.match(/^[-*] (.+)$/);
    if (!m) return;
    items.push(coverageItem(m[1]));
  });
  return items;
};

export const parseInterviewScript = (markdown: string): InterviewScript => {
  const list = splitSections(markdown);
  const sections: Record<string, string> = {};
  for (const s of list) sections[s.title] = stripTryItFirst(s.body);

  const hints: Partial<Record<ScriptPhase, string[]>> = {};
  for (const phase of Object.keys(PHASE_SECTIONS) as ScriptPhase[]) {
    const found = PHASE_SECTIONS[phase].flatMap((title) =>
      fencedBlocks(sections[title] ?? '')
        .filter((b) => blockLanguage(b.info) === 'hint')
        .map((b) => b.body.trim()),
    );
    if (found.length > 0) hints[phase] = found;
  }

  const deepDives = DEEP_DIVE_SECTIONS.flatMap((section) =>
    splitSections(sections[section] ?? '', 3).map((sub) => ({ title: sub.title, body: sub.body, section })),
  );

  const followUps = fencedBlocks(sections['Interviewer follow-up questions'] ?? '')
    .filter((b) => blockLanguage(b.info) === 'question')
    .map((b) => ({ title: blockTitle(b.info) ?? 'Follow-up question', body: b.body.trim() }));

  const checklistBlock = fencedBlocks(sections['Evaluation checklist'] ?? '').find((b) => blockLanguage(b.info) === 'checklist');
  const estimatorBlock = fencedBlocks(sections['Capacity estimation'] ?? '').find((b) => blockLanguage(b.info) === 'estimator');

  return {
    prompt: sections['Problem statement'] ?? '',
    clarifications: parseClarifications(sections['Clarifying questions'] ?? ''),
    functional: parseCoverage(sections['Functional requirements'] ?? ''),
    nonFunctional: parseCoverage(sections['Non-functional requirements'] ?? ''),
    sections,
    estimatorPreset: estimatorBlock?.body,
    hints,
    deepDives,
    followUps,
    checklist: checklistBlock ? parseChecklistItems(checklistBlock.body) : [],
  };
};

/** Words that mean the same thing for matching purposes, mapped to one canonical form. */
const SYNONYM_GROUPS: string[][] = [
  ['user', 'users', 'dau', 'mau', 'customer', 'customers', 'people', 'audience'],
  ['scale', 'traffic', 'load', 'volume', 'qps', 'rps', 'throughput', 'requests', 'request', 'big', 'size'],
  ['latency', 'fast', 'slow', 'speed', 'p99', 'p95', 'response', 'quick', 'quickly', 'milliseconds', 'ms'],
  ['availability', 'available', 'uptime', 'downtime', 'outage', 'nines'],
  ['consistency', 'consistent', 'stale', 'fresh', 'freshness', 'staleness'],
  ['retention', 'retain', 'keep', 'expire', 'expiry', 'expiration', 'ttl', 'forever', 'lifetime', 'delete', 'deletion'],
  ['read', 'reads', 'reading', 'lookup', 'lookups'],
  ['write', 'writes', 'writing'],
  ['ratio', 'proportion', 'mix'],
  ['client', 'clients', 'mobile', 'web', 'browser', 'app', 'apps', 'platform', 'device', 'devices'],
  ['region', 'regions', 'global', 'geo', 'country', 'countries', 'international', 'worldwide', 'location'],
  ['custom', 'alias', 'aliases', 'vanity', 'choose', 'pick'],
  ['analytics', 'stats', 'statistics', 'metrics', 'count', 'counts', 'tracking', 'track', 'reporting'],
  ['auth', 'authentication', 'login', 'account', 'accounts', 'signed', 'anonymous', 'register'],
  ['realtime', 'real-time', 'live', 'instant', 'instantly', 'push'],
  ['order', 'ordering', 'sequence', 'sorted'],
  ['duplicate', 'duplicates', 'dedup', 'deduplicate', 'same', 'twice', 'idempotent'],
  ['abuse', 'spam', 'malicious', 'security', 'phishing', 'safe'],
  ['cost', 'budget', 'cheap', 'expensive'],
  ['edit', 'update', 'modify', 'change'],
  ['length', 'short', 'long', 'characters', 'chars'],
];

const matcher = createMatcher(SYNONYM_GROUPS);

/** Content words of a text, lower-cased, plural-folded and mapped to HLD synonym groups. */
export const keywords = matcher.keywords;

/**
 * The scripted clarifying question closest to what the learner asked, or null.
 * Explicit match keywords weigh double; at least two points are needed so a single
 * common word doesn't trigger an answer. Questions not yet answered win ties.
 */
export const matchClarification = matcher.matchClarification;

/** Whether the learner's text mentions a requirement: any of its terms, every word of a multi-word term. */
export const mentions = matcher.mentions;
