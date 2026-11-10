import type { RubricId } from '../../../components/learn/interviews';

/** The LLD mock interview's self-evaluation rubric. */
export const RUBRIC: { id: RubricId; label: string; strong: string; weak: string }[] = [
  {
    id: 'requirements',
    label: 'Requirement clarification',
    strong:
      'Asked about capabilities, rules, errors, scope and concurrency; wrote the functional requirements and the non-functional ones that shape the classes (thread safety, swappable policies); stated what is out of scope.',
    weak: 'Started designing from the prompt, missed a rule that changes the model (change-making, overlaps, double booking), or never asked about concurrency.',
  },
  {
    id: 'object-model',
    label: 'Object modelling',
    strong:
      'Entities limited to what the requirements need, each with one clear responsibility; value objects as records, fixed sets as enums; state owned by the class that enforces its rules.',
    weak: 'A god class, data holders with the logic elsewhere, or classes for nouns with no behaviour (gates, screens, “managers” of nothing).',
  },
  {
    id: 'class-design',
    label: 'Class design & relationships',
    strong:
      'Interfaces where behaviour varies, composition over inheritance, correct relationships and multiplicities, dependencies on abstractions passed in through constructors.',
    weak: 'Deep inheritance trees, collaborators created with `new` inside classes, or a class diagram that doesn’t match the code.',
  },
  {
    id: 'principles',
    label: 'Patterns & principles',
    strong:
      'Each pattern is there because a requirement calls for it, and is named; SOLID respected; the simpler alternative considered and rejected for a reason.',
    weak: 'Patterns forced in (Singleton everywhere, a factory for one class), or a switch on type where polymorphism or a strategy belongs.',
  },
  {
    id: 'implementation',
    label: 'Implementation quality',
    strong:
      'The core flow is real Java: clear names, small methods, invariants checked at the boundary, meaningful exceptions, immutability where possible, time and IDs injected.',
    weak: 'Pseudo-code for the hard part, mutable state leaking through getters, swallowed exceptions, or validation scattered across callers.',
  },
  {
    id: 'edge-cases',
    label: 'Edge cases & concurrency',
    strong:
      'Invalid input, empty, full and duplicate cases handled; shared state found and made atomic without deadlock risk; tests described, including a concurrent one.',
    weak: 'Happy path only, check-then-act races, one global lock with no reason given, or no idea how it would be tested.',
  },
  {
    id: 'extensibility',
    label: 'Extensibility',
    strong: 'Follow-ups land as new classes or local changes (open/closed); you can say what changes and what doesn’t, and the cost of the key operations.',
    weak: 'Every follow-up means edits across many classes, or the answer is “rewrite the core”.',
  },
  {
    id: 'communication',
    label: 'Communication',
    strong: 'Explained decisions while making them, checked in before coding, kept to time and summarised the design and its trade-offs at the end.',
    weak: 'Coded in silence, over-designed before confirming scope, or ran out of time before the core flow worked.',
  },
];

/** Suggested minutes per mock-interview phase. */
export const PHASE_BUDGETS: Record<45 | 60, Record<string, number>> = {
  45: { clarify: 4, requirements: 4, entities: 5, 'class-design': 10, implementation: 13, 'edge-cases': 5, extensibility: 4 },
  60: { clarify: 5, requirements: 5, entities: 6, 'class-design': 12, implementation: 20, 'edge-cases': 7, extensibility: 5 },
};
