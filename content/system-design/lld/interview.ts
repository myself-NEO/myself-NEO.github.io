// Derives an LLD mock-interview script from a problem breakdown (./problems/<slug>.md), so every
// problem can be practised as an interview without a second copy of its content.
//
// What the breakdown provides:
//   ## Problem statement        the prompt
//   ## Clarifying questions     - **Q:** question?  <!-- match: optional, extra, keywords -->
//                                 - **A:** the interviewer's answer      (inside the answers reveal)
//   ## Requirements             **Functional** / **Non-functional** numbered items; a <!-- match: … -->
//                               comment (or **bold** terms) is what coverage looks for
//   ## Step N — …               steps before "Class design" model the problem (entities, states);
//                               "Class design" and the steps up to "Implementation" are the design;
//                               the ```uml diagram's types are the entities coverage checks for
//   ## Step N — Implementation  ````hint blocks feed the phase hints; the rest is the reference
//   ## Edge cases, Concurrency, Tests, Design decisions, Patterns and principles,
//      Common mistakes and alternatives, Complexity      references for later phases
//   ## Follow-up questions      ````reveal blocks, one per follow-up
//   ## Interviewer checklist    - [ ] items, the self-check list
//
// Matching is deterministic keyword overlap — the simulator says so wherever it is used.

import {
  BaseScript,
  blockLanguage,
  blockTitle,
  CoverageItem,
  coverageItem,
  createMatcher,
  dropBlocks,
  fencedBlocks,
  parseChecklistItems,
  parseClarifications,
  splitSections,
  stripTryItFirst,
} from '../interviewScript';

export type LldScriptPhase = 'clarify' | 'requirements' | 'entities' | 'class-design' | 'implementation' | 'edge-cases' | 'extensibility';

export interface Section {
  title: string;
  body: string;
}

export interface RequirementGroup {
  title: string;
  items: CoverageItem[];
}

export interface UmlType {
  name: string;
  kind: string;
}

export interface LldInterviewScript extends BaseScript {
  requirements: RequirementGroup[];
  outOfScope?: string;
  /** Types declared in the reference class diagram. */
  types: UmlType[];
  /** Steps before the class design: entities, states, the tricky part. */
  modelling: Section[];
  /** The class-design step and any steps between it and the implementation. */
  design: Section[];
  /** The implementation step without its hints. */
  implementation?: Section;
  hints: Partial<Record<LldScriptPhase, string[]>>;
  followUps: Section[];
}

const STEP = /^Step \d+ — (.+)$/;

const parseRequirements = (body: string): { groups: RequirementGroup[]; outOfScope?: string } => {
  const groups: RequirementGroup[] = [];
  let current: RequirementGroup | null = null;
  let outOfScope: string | undefined;
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const label = line.match(/^\*\*(Functional|Non-functional)\*\*$/);
    const item = line.match(/^\d+\.\s+(.+)$/);
    const scope = line.match(/^\*\*Out of scope:\*\*\s*(.+)$/);
    if (label) {
      current = { title: `${label[1]} requirements`, items: [] };
      groups.push(current);
    } else if (item) {
      if (!current) {
        current = { title: 'Requirements', items: [] };
        groups.push(current);
      }
      current.items.push(coverageItem(item[1]));
    } else if (scope) {
      outOfScope = scope[1];
    }
  }
  return { groups: groups.filter((g) => g.items.length > 0), outOfScope };
};

const UML_OPEN = /^\s*`{3,}uml\b/;
const FENCE_CLOSE = /^\s*`{3,}\s*$/;
const DECLARATION = /^(abstract class|class|interface|enum|record)\s+(\w+)/;

/** Types declared in every ```uml block of the text, including blocks nested in reveals. */
export const umlTypes = (markdown: string): UmlType[] => {
  const types: UmlType[] = [];
  let inUml = false;
  for (const line of markdown.split('\n')) {
    if (!inUml) {
      inUml = UML_OPEN.test(line);
      continue;
    }
    if (FENCE_CLOSE.test(line)) {
      inUml = false;
      continue;
    }
    const m = line.match(DECLARATION);
    if (m && !types.some((t) => t.name === m[2])) types.push({ name: m[2], kind: m[1] });
  }
  return types;
};

const hintsIn = (sections: Section[]) =>
  sections.flatMap((s) =>
    fencedBlocks(s.body)
      .filter((b) => blockLanguage(b.info) === 'hint')
      .map((b) => b.body.trim()),
  );

export const parseLldInterviewScript = (markdown: string): LldInterviewScript => {
  const list = splitSections(markdown).map((s) => ({ title: s.title, body: stripTryItFirst(s.body) }));
  const sections: Record<string, string> = {};
  for (const s of list) sections[s.title] = s.body;

  const steps = list.filter((s) => STEP.test(s.title));
  const stepName = (s: Section) => s.title.match(STEP)?.[1] ?? s.title;
  const designAt = steps.findIndex((s) => /^Class design/i.test(stepName(s)));
  const implementationAt = steps.findIndex((s) => /^Implementation/i.test(stepName(s)));
  const modelling = steps.slice(0, designAt < 0 ? 0 : designAt);
  const design = designAt < 0 ? [] : steps.slice(designAt, implementationAt < 0 ? undefined : implementationAt);
  const implementationStep = implementationAt < 0 ? undefined : steps[implementationAt];

  const hints: Partial<Record<LldScriptPhase, string[]>> = {};
  const add = (phase: LldScriptPhase, found: string[]) => {
    if (found.length > 0) hints[phase] = found;
  };
  add('entities', hintsIn(modelling));
  add('class-design', hintsIn(design));
  add('implementation', implementationStep ? hintsIn([implementationStep]) : []);

  const followUps = fencedBlocks(sections['Follow-up questions'] ?? '')
    .filter((b) => blockLanguage(b.info) === 'reveal')
    .map((b) => ({ title: blockTitle(b.info) ?? 'Follow-up question', body: b.body.trim() }));

  const { groups, outOfScope } = parseRequirements(sections.Requirements ?? '');

  return {
    prompt: sections['Problem statement'] ?? '',
    clarifications: parseClarifications(sections['Clarifying questions'] ?? ''),
    sections,
    checklist: parseChecklistItems(sections['Interviewer checklist'] ?? ''),
    requirements: groups,
    outOfScope,
    types: umlTypes(design.map((s) => s.body).join('\n')),
    modelling,
    design,
    implementation: implementationStep && { title: implementationStep.title, body: dropBlocks(implementationStep.body, 'hint') },
    hints,
    followUps,
  };
};

// ── Matching ───────────────────────────────────────────────────

/** Words that mean the same thing for matching purposes, mapped to one canonical form. Keep groups narrow. */
const SYNONYM_GROUPS: string[][] = [
  ['concurrent', 'concurrency', 'concurrently', 'thread', 'threads', 'threaded', 'multithreaded', 'thread-safe', 'parallel', 'simultaneous', 'simultaneously', 'race', 'races'],
  ['price', 'pricing', 'fee', 'fees', 'fare', 'fares', 'cost', 'costs', 'charge', 'charged', 'tariff'],
  ['payment', 'payments', 'pay', 'paid', 'paying'],
  ['error', 'errors', 'fail', 'fails', 'failure', 'failures', 'failed', 'invalid', 'exception', 'exceptions'],
  ['scope', 'exclude', 'excluded', 'exclusions'],
  ['persist', 'persistence', 'persistent', 'database', 'db', 'storage', 'disk', 'durable', 'durability'],
  ['cancel', 'cancels', 'cancellation', 'cancelled', 'canceled', 'cancelling'],
  ['refund', 'refunds', 'refunded'],
  ['notify', 'notification', 'notifications', 'notified', 'alert', 'alerts'],
  ['user', 'users', 'customer', 'customers', 'people', 'person'],
  ['ui', 'display', 'screen', 'frontend', 'gui'],
  ['undo', 'rollback', 'revert'],
  ['retry', 'retries', 'retried'],
  ['expire', 'expiry', 'expiration', 'expired', 'ttl', 'timeout', 'timeouts'],
  ['duplicate', 'duplicates', 'twice', 'idempotent', 'idempotency', 'dedup'],
  ['distributed', 'cluster', 'servers', 'nodes'],
];

/** Big-O notation becomes one word ("O(log n)" → "big-o-logn"), so complexity requirements can be matched. */
const bigO = (text: string) => text.replace(/\bO\(([^)]{1,12})\)/gi, (_, inner: string) => ` big-o-${inner.replace(/\s+/g, '').toLowerCase()} `);

export const { keywords, matchClarification, mentions } = createMatcher(SYNONYM_GROUPS, bigO);

/** Lower-cased words, camelCase split and crudely singularised, so "ParkingSpot", "parking spots" and "parking_spot" agree. */
const typeWords = (text: string) =>
  text
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));

/** Whether the learner's text names a type from the reference diagram (its first term is the type name). */
export const mentionsType = (text: string, item: CoverageItem): boolean => {
  const name = typeWords(item.terms[0] ?? item.text);
  if (name.length === 0) return false;
  const words = typeWords(text);
  for (let i = 0; i + name.length <= words.length; i++) {
    if (name.every((w, j) => words[i + j] === w)) return true;
  }
  return false;
};
