import type { RubricId } from '../../../components/learn/interviews';

/** What HLD interviewers score, with the bar at SDE-2 and at senior level. */
export const EVALUATION_DIMENSIONS: { title: string; looksFor: string; sde2: string; senior: string }[] = [
  {
    title: 'Problem navigation',
    looksFor: 'Scoping a vague prompt, asking questions that change the design, managing the clock.',
    sde2: 'Asks sensible questions and settles on a reasonable scope with some guidance.',
    senior: 'Drives scoping, states assumptions, prioritises what matters most and keeps the interview on schedule.',
  },
  {
    title: 'Requirements & estimation',
    looksFor: 'Functional and quantified non-functional requirements, and estimates that inform decisions.',
    sde2: 'Lists the core features and the obvious scale and latency targets.',
    senior: 'Quantifies the requirements that drive the design and uses numbers to justify choices.',
  },
  {
    title: 'High-level design',
    looksFor: 'A working end-to-end design that satisfies every functional requirement.',
    sde2: 'Produces a correct, reasonable architecture with standard components.',
    senior: 'Produces a clean design quickly, with clear data flow and well-placed boundaries.',
  },
  {
    title: 'Technical depth',
    looksFor: 'Deep dives into the hard parts: data partitioning, consistency, contention, failure.',
    sde2: 'Goes deep on one or two areas when the interviewer points at them.',
    senior: 'Identifies the hard parts unprompted and goes deep with several options per problem.',
  },
  {
    title: 'Trade-offs',
    looksFor: 'Alternatives considered and the reasons for each choice.',
    sde2: 'Can explain why a choice was made when asked.',
    senior: 'Volunteers alternatives, quantifies their costs and knows when the simpler option wins.',
  },
  {
    title: 'Communication',
    looksFor: 'Structured, collaborative explanation; checking in; responding well to pushback.',
    sde2: 'Explains clearly and takes hints.',
    senior: 'Leads like a design review: summarises, checks alignment and adapts without losing the thread.',
  },
];

/** The simulator's self-evaluation rubric. */
export const RUBRIC: { id: RubricId; label: string; strong: string; weak: string }[] = [
  {
    id: 'requirements',
    label: 'Requirement completeness',
    strong: 'Core features scoped to 3–5 requirements; scale, latency, availability and consistency quantified; exclusions stated.',
    weak: 'Jumped to design, missed a core feature, or left non-functional requirements vague ("fast", "scalable").',
  },
  {
    id: 'api',
    label: 'API design',
    strong: 'One endpoint per requirement with clear requests, responses and status codes; auth, pagination and idempotency covered.',
    weak: 'Missing endpoints, user identity in the body, unbounded list endpoints, or unsafe retries.',
  },
  {
    id: 'data-model',
    label: 'Data modeling',
    strong: 'Entities and keys match the access patterns; store chosen per entity with a reason; indexes and partition keys named.',
    weak: 'Store chosen by habit, no keys or indexes, or a partition key that creates hot spots.',
  },
  {
    id: 'architecture',
    label: 'Architecture correctness',
    strong: 'Every functional requirement traced through the diagram; components have single clear responsibilities.',
    weak: 'Boxes without data flow, a requirement no path satisfies, or components that do everything.',
  },
  {
    id: 'scalability',
    label: 'Scalability',
    strong: 'Bottlenecks found from the numbers and addressed: caching, partitioning, async work, fan-out strategy.',
    weak: 'Scaling hand-waved ("add more servers") or applied where the numbers say it isn’t needed.',
  },
  {
    id: 'reliability',
    label: 'Reliability',
    strong: 'Single points of failure removed; failures, retries, duplicates and data loss discussed with mitigations.',
    weak: 'Happy path only; no answer for a node, cache or queue failing.',
  },
  {
    id: 'tradeoffs',
    label: 'Trade-off reasoning',
    strong: 'Alternatives named for the key decisions, with costs and the reason the chosen option wins here.',
    weak: 'Choices stated without reasons, or every option described as "better".',
  },
  {
    id: 'communication',
    label: 'Communication',
    strong: 'Structured, time-aware, checked in at each step, summarised the design at the end.',
    weak: 'Rambled, went silent, overran early steps, or never confirmed direction with the interviewer.',
  },
];

/** Suggested minutes per mock-interview phase. */
export const PHASE_BUDGETS: Record<45 | 60, Record<string, number>> = {
  45: { clarify: 3, requirements: 4, estimation: 3, api: 4, 'data-model': 4, architecture: 10, 'deep-dives': 10, bottlenecks: 4, tradeoffs: 3 },
  60: { clarify: 4, requirements: 5, estimation: 4, api: 5, 'data-model': 5, architecture: 13, 'deep-dives': 15, bottlenecks: 5, tradeoffs: 4 },
};
