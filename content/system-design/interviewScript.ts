// Shared building blocks for deriving mock-interview scripts from problem breakdowns
// (HLD: ./hld/interview.ts, LLD: ./lld/interview.ts). Each track keeps its own parser and
// synonym groups; the markdown scanning and the keyword matching live here.
//
// Clarifying questions are written as
//   - **Q:** question?  <!-- match: optional, extra, keywords -->
//     - **A:** the interviewer's answer
// and coverage items carry **bold** terms or a <!-- match: … --> comment.
//
// Matching is deterministic keyword overlap — the simulator says so wherever it is used.

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

/** What every track's script provides to the shared simulator. */
export interface BaseScript {
  prompt: string;
  clarifications: ClarifyItem[];
  /** `##` heading → body markdown. */
  sections: Record<string, string>;
  checklist: string[];
}

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;

export interface Block {
  /** Fence info: language and meta, e.g. 'hint title="Hint 1"'. */
  info: string;
  body: string;
}

/** Splits markdown into lines while tracking fenced blocks, so headings inside code are ignored. */
export const scan = (markdown: string) => {
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

export const blockLanguage = (info: string) => info.split(/\s+/)[0] ?? '';
export const blockTitle = (info: string) => info.match(/title="([^"]*)"/)?.[1];

/** Removes top-level fenced blocks of one language (e.g. hints shown elsewhere). */
export const dropBlocks = (markdown: string, language: string) => {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const out: string[] = [];
  let open: { fence: string; drop: boolean } | null = null;
  for (const line of lines) {
    const m = line.match(FENCE_OPEN);
    if (open) {
      if (!open.drop) out.push(line);
      if (m && m[2][0] === open.fence[0] && m[2].length >= open.fence.length && m[3].trim() === '') open = null;
    } else if (m) {
      open = { fence: m[2], drop: blockLanguage(m[3].trim()) === language };
      if (!open.drop) out.push(line);
    } else out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const MATCH_COMMENT = /<!--\s*match:\s*([^>]*?)\s*-->/;

export const stripComment = (text: string) => text.replace(MATCH_COMMENT, '').trim();
export const matchTerms = (text: string) =>
  (text.match(MATCH_COMMENT)?.[1] ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

/** `- **Q:**` / `  - **A:**` pairs anywhere in the text (including inside a reveal block). */
export const parseClarifications = (body: string): ClarifyItem[] => {
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

export const boldTerms = (text: string) => Array.from(text.matchAll(/\*\*([^*]+)\*\*/g)).map((m) => m[1].trim().toLowerCase());

/** A coverage item from one list entry: explicit match terms first, then bold terms. */
export const coverageItem = (raw: string): CoverageItem => {
  const text = stripComment(raw);
  return { text, terms: Array.from(new Set([...matchTerms(raw), ...boldTerms(text)])) };
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

// ── Keyword matching ──────────────────────────────────────────

const STOPWORDS = new Set(
  'a an the and or but if of to in on at by for with from into about as is are was were be been being do does did have has had will would should could can may might must shall i we you they he she it this that these those there here what which who whom whose when where why how much many any some all each every more most other such than too very just also only so not no nor yes our your their its my me us them do we need want should does there per like ok okay assume assuming expected expect support supported'.split(
    ' ',
  ),
);

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

export interface MatchResult {
  index: number;
  score: number;
}

export interface Matcher {
  /** Content words of a text, lower-cased, plural-folded and mapped to synonym groups. */
  keywords: (text: string) => Set<string>;
  /**
   * The scripted clarifying question closest to what the learner asked, or null.
   * Explicit match keywords weigh double; at least two points are needed so a single
   * common word doesn't trigger an answer. Questions not yet answered win ties.
   */
  matchClarification: (asked: string, items: ClarifyItem[], alreadyMatched?: ReadonlySet<number>) => MatchResult | null;
  /** Whether the learner's text mentions an item: any of its terms, every word of a multi-word term. */
  mentions: (text: string, item: CoverageItem) => boolean;
}

/**
 * Keyword matching with a track's own synonym groups (words in a group count as the same word).
 * `normalize` rewrites text before it is split into words, identically for both sides.
 */
export const createMatcher = (synonymGroups: string[][], normalize: (text: string) => string = (t) => t): Matcher => {
  const canonical = new Map<string, string>();
  for (const group of synonymGroups) for (const word of group) canonical.set(stem(word), stem(group[0]));

  const fold = (word: string) => {
    const s = stem(word);
    return canonical.get(s) ?? s;
  };

  const keywords = (text: string): Set<string> =>
    new Set(
      normalize(text)
        .toLowerCase()
        .replace(/[`*_>#()[\]{}"'?!.,:;/\\|]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w) && !/^\d+$/.test(w))
        .map(fold),
    );

  const matchClarification = (asked: string, items: ClarifyItem[], alreadyMatched: ReadonlySet<number> = new Set()): MatchResult | null => {
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

  const mentions = (text: string, item: CoverageItem): boolean => {
    const words = keywords(text);
    const terms = item.terms.length > 0 ? item.terms : [item.text];
    return terms.some((term) => {
      const parts = Array.from(keywords(term));
      return parts.length > 0 && parts.every((p) => words.has(p));
    });
  };

  return { keywords, matchClarification, mentions };
};
