import { LessonFormat } from '../../shared/types';

// The content contract for HLD markdown. Every lesson has the `##` sections of its format,
// in this order (optional sections may appear between them). Problem breakdowns have every
// PROBLEM_SECTIONS heading in order; the mock interview reads them by name.
//
// Markdown conventions on top of the shared ones (components/learn/MarkdownContent.tsx):
//   ```mermaid title="…"        diagram; flowchart nodes may use :::client :::lb :::svc :::db :::cache :::queue :::store :::ext
//   ````question title="…?"     interview question with a model answer (savable to the notebook)
//   ```estimator / ```drill      capacity calculator / numeric estimation exercises
//   ```checklist title="…"      persisted checklist (problem evaluation checklists)
//   Quiz options may be followed by "! why this option is wrong".

export const LESSON_SECTIONS: Record<LessonFormat, string[]> = {
  concept: [
    'Why it matters',
    'How it works',
    'Architecture',
    'Failure scenarios',
    'Trade-offs',
    'In real systems',
    'Common mistakes',
    'In the interview',
    'Key takeaways',
    'Knowledge check',
  ],
  pattern: [
    'The problem',
    'Architecture',
    'Request and data flow',
    'Advantages',
    'Disadvantages',
    'Failure scenarios',
    'Alternatives',
    'Where it shows up in interviews',
    'Common mistakes',
    'Key takeaways',
    'Knowledge check',
  ],
  technology: [
    'What it is for',
    'Data model',
    'How it works inside',
    'Strengths and weaknesses',
    'Scaling characteristics',
    'When to use it',
    'Alternatives',
    'Interview trade-offs',
    'Key takeaways',
    'Knowledge check',
  ],
  estimation: [
    'The question it answers',
    'Formula',
    'Worked example',
    'Try it',
    'How it changes the design',
    'Common mistakes',
    'Key takeaways',
    'Knowledge check',
  ],
  method: ['What to do', 'Questions to ask', 'What to draw', 'What to say', 'Common mistakes', 'Example conversation', 'Key takeaways', 'Knowledge check'],
  workshop: ['How to use this workshop', 'Exercises', 'Key takeaways', 'Knowledge check'],
  checkpoint: ['How to use this checkpoint', 'Questions', 'Where to review'],
};

/** Sections a lesson may add between the required ones. */
export const OPTIONAL_LESSON_SECTIONS = ['Java and Spring Boot example'];

export const PROBLEM_SECTIONS = [
  'Problem statement',
  'Clarifying questions',
  'Functional requirements',
  'Non-functional requirements',
  'Scope and exclusions',
  'Capacity estimation',
  'API design',
  'Data model',
  'Initial high-level architecture',
  'Architecture diagram',
  'Request and data flow',
  'Component responsibilities',
  'Database and technology choices',
  'Scaling strategy',
  'Caching strategy',
  'Messaging strategy',
  'Failure scenarios',
  'Bottleneck analysis',
  'Consistency and availability trade-offs',
  'Security considerations',
  'Monitoring and observability',
  'Final architecture',
  'Alternative designs and trade-offs',
  'Interviewer follow-up questions',
  'Common mistakes',
  'Evaluation checklist',
];
