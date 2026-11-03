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

export interface ClarifyItem {
  question: string;
  answer: string;
  /** Explicit match keywords from the <!-- match: … --> comment. */
  match: string[];
}

export interface CoverageItem {
  text: string;
  /** Terms whose presence in the learner's text counts as "mentioned". */
  terms: string[];
}

export interface Subsection {
  title: string;
  body: string;
  section: string;
}

export interface InterviewScript {
  prompt: string;
  clarifications: ClarifyItem[];
  functional: CoverageItem[];
  nonFunctional: CoverageItem[];
  /** `##` heading → body markdown. */
  sections: Record<string, string>;
  estimatorPreset?: string;
  hints: Partial<Record<ScriptPhase, string[]>>;
  deepDives: Subsection[];
  followUps: { title: string; body: string }[];
  checklist: string[];
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;

interface Block {
  /** Fence info: language and meta, e.g. 'hint title="Hint 1"'. */
  info: string;
  body: string;
}

/** Splits markdown into lines while tracking fenced blocks, so headings inside code are ignored. */
const scan = (markdown: string) => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const inFence: boolean[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const m = line.match(FENCE_OPEN);
    if (fence) {
      inFence.push(true);
      if (m && m[2][0] === fence[0] && m[2].length >= fence.length && m[3].trim() === '') fence = null;
    } else if (m) {
      inFence.push(true);
      fence = m[2];
    } else {
      inFence.push(false);
    }
  }
  return { lines, inFence };
};

/** `##` (or `###`) sections: heading text → body. Headings inside fenced blocks are skipped. */
export const splitSections = (markdown: string, level = 2): { title: string; body: string }[] => {
  const { lines, inFence } = scan(markdown);
  const marker = '#'.repeat(level) + ' ';
  const out: { title: string; body: string[] }[] = [];
  lines.forEach((line, i) => {
    if (!inFence[i] && line.startsWith(marker)) out.push({ title: line.slice(marker.length).trim(), body: [] });
    else if (out.length > 0) out[out.length - 1].body.push(line);
  });
  return out.map((s) => ({ title: s.title, body: s.body.join('\n').trim() }));
};

/** Top-level fenced blocks with their info string and body (fences nested in longer fences stay in the body). */
export const fencedBlocks = (markdown: string): Block[] => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let open: { fence: string; info: string; body: string[] } | null = null;
  for (const line of lines) {
    const m = line.match(FENCE_OPEN);
    if (open) {
      if (m && m[2][0] === open.fence[0] && m[2].length >= open.fence.length && m[3].trim() === '') {
        blocks.push({ info: open.info, body: open.body.join('\n') });
        open = null;
      } else open.body.push(line);
    } else if (m) {
      open = { fence: m[2], info: m[3].trim(), body: [] };
    }
  }
  return blocks;
};

const blockLanguage = (info: string) => info.split(/\s+/)[0] ?? '';
const blockTitle = (info: string) => info.match(/title="([^"]*)"/)?.[1];

const MATCH_COMMENT = /<!--\s*match:\s*([^>]*?)\s*-->/;

const stripComment = (text: string) => text.replace(MATCH_COMMENT, '').trim();
const matchTerms = (text: string) =>
  (text.match(MATCH_COMMENT)?.[1] ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

const parseClarifications = (body: string): ClarifyItem[] => {
  const items: ClarifyItem[] = [];
  let current: ClarifyItem | null = null;
  let inAnswer = false;
  for (const raw of body.split('\n')) {
    const q = raw.match(/^- \*\*Q:\*\*\s*(.+)$/);
    const a = raw.match(/^\s+- \*\*A:\*\*\s*(.+)$/);
    if (q) {
      current = { question: stripComment(q[1]), answer: '', match: matchTerms(q[1]) };
      items.push(current);
      inAnswer = false;
    } else if (a && current) {
      current.answer = a[1].trim();
      inAnswer = true;
    } else if (inAnswer && current && /^\s{3,}\S/.test(raw)) {
      current.answer = `${current.answer} ${raw.trim()}`;
    } else if (raw.trim() === '') {
      inAnswer = false;
    }
  }
  return items.filter((i) => i.answer);
};

const boldTerms = (text: string) => Array.from(text.matchAll(/\*\*([^*]+)\*\*/g)).map((m) => m[1].trim().toLowerCase());

/** Top-level bullets of a section, each a requirement. */
const parseCoverage = (body: string): CoverageItem[] => {
  const items: CoverageItem[] = [];
  const { lines, inFence } = scan(body);
  lines.forEach((line, i) => {
    if (inFence[i]) return;
    const m = line.match(/^[-*] (.+)$/);
    if (!m) return;
    const text = stripComment(m[1]);
    const terms = [...matchTerms(m[1]), ...boldTerms(text)];
    items.push({ text, terms: Array.from(new Set(terms)) });
  });
  return items;
};

export const parseChecklistItems = (source: string) =>
  source
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.replace(/^- (\[[ xX]\] )?/, '').trim())
    .filter(Boolean);

/** Drops "> [!TIP] Try it first" callouts: they address readers of the breakdown, and the interview asks for the attempt itself. */
export const stripTryItFirst = (markdown: string) => {
  const out: string[] = [];
  let skipping = false;
  for (const line of markdown.split('\n')) {
    if (/^>\s*\[!TIP\]\s*Try it first/i.test(line)) skipping = true;
    else if (skipping && !line.startsWith('>')) skipping = false;
    if (!skipping) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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

// ── Keyword matching ──────────────────────────────────────────

const STOPWORDS = new Set(
  'a an the and or but if of to in on at by for with from into about as is are was were be been being do does did have has had will would should could can may might must shall i we you they he she it this that these those there here what which who whom whose when where why how much many any some all each every more most other such than too very just also only so not no nor yes our your their its my me us them do we need want should does there per like ok okay assume assuming expected expect support supported'.split(
    ' ',
  ),
);

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

/**
 * A deliberately crude stemmer, applied identically to both sides of every comparison:
 * caches/cache → cach, expired/expiring/expire → expir, queries/query → queri.
 */
export const stem = (word: string) => {
  let s = word;
  if (s.length > 4 && s.endsWith('ies')) s = `${s.slice(0, -3)}i`;
  else if (s.length > 4 && /(ss|x|ch|sh)es$/.test(s)) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !s.endsWith('ss')) s = s.slice(0, -1);
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('y')) s = `${s.slice(0, -1)}i`;
  return s;
};

const CANONICAL = new Map<string, string>();
for (const group of SYNONYM_GROUPS) for (const word of group) CANONICAL.set(stem(word), stem(group[0]));

const fold = (word: string) => {
  const s = stem(word);
  return CANONICAL.get(s) ?? s;
};

/** Content words of a text, lower-cased, plural-folded and mapped to synonym groups. */
export const keywords = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .replace(/[`*_>#()[\]{}"'?!.,:;/\\|]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
      .map(fold),
  );

export interface MatchResult {
  index: number;
  score: number;
}

/**
 * The scripted clarifying question closest to what the learner asked, or null.
 * Explicit match keywords weigh double; at least two points are needed so a single
 * common word doesn't trigger an answer. Questions not yet answered win ties.
 */
export const matchClarification = (asked: string, items: ClarifyItem[], alreadyMatched: ReadonlySet<number> = new Set()): MatchResult | null => {
  const words = keywords(asked);
  if (words.size === 0) return null;
  let best: MatchResult | null = null;
  items.forEach((item, index) => {
    const explicit = new Set(item.match.flatMap((m) => Array.from(keywords(m))));
    const auto = keywords(item.question);
    let score = 0;
    for (const w of words) {
      if (explicit.has(w)) score += 2;
      else if (auto.has(w)) score += 1;
    }
    if (score < 2) return;
    const better =
      !best || score > best.score || (score === best.score && alreadyMatched.has(best.index) && !alreadyMatched.has(index));
    if (better) best = { index, score };
  });
  return best;
};

/** Whether the learner's text mentions a requirement: any of its terms, every word of a multi-word term. */
export const mentions = (text: string, item: CoverageItem): boolean => {
  const words = keywords(text);
  const terms = item.terms.length > 0 ? item.terms : [item.text];
  return terms.some((term) => {
    const parts = Array.from(keywords(term));
    return parts.length > 0 && parts.every((p) => words.has(p));
  });
};
