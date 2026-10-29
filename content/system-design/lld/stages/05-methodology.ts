import { Stage } from '../../types';

export const METHODOLOGY: Stage = {
  id: 'methodology',
  number: 5,
  title: 'LLD Interview Methodology',
  levelLabel: 'Intermediate → Advanced',
  description:
    'A repeatable, time-boxed framework for any LLD prompt — what to say, what to draw, and how to handle pushback.',
  modules: [
    {
      id: 'interview-framework',
      title: 'The Interview Framework',
      lessons: [
        {
          slug: 'delivery-framework',
          title: 'The LLD Interview Framework',
          summary: 'Twelve steps grouped into five time-boxed phases, with exactly what to say and draw at each one.',
          minutes: 25,
          level: 'intermediate',
          essential: true,
          objectives: [
            'Run an LLD interview through five time-boxed phases',
            'Know what to say and what to draw at each step',
            'Keep the interviewer aligned with checkpoints',
          ],
          prerequisites: ['requirements-gathering', 'entities-and-responsibilities', 'patterns-overview'],
          related: ['mock-interview-walkthrough', 'interview-anti-patterns', 'interview-expectations'],
          problems: ['parking-lot', 'movie-ticket-booking', 'rate-limiter'],
          tags: ['framework', 'interview', 'time management'],
        },
        {
          slug: 'mock-interview-walkthrough',
          title: 'Worked Interview: Handling Pushback',
          summary: 'A full transcript-style walkthrough of a meeting-room booking interview, including interviewer challenges and strong responses.',
          minutes: 25,
          level: 'intermediate',
          essential: true,
          objectives: [
            'See the framework applied end-to-end to a real prompt',
            'Respond to design challenges without abandoning your design',
            'Turn follow-up requirements into targeted, local changes',
          ],
          prerequisites: ['delivery-framework'],
          related: ['delivery-framework', 'interview-anti-patterns', 'concurrent-state-transitions'],
          problems: ['meeting-room-booking', 'hotel-reservation'],
          tags: ['mock interview', 'pushback', 'follow-ups'],
        },
        {
          slug: 'interview-anti-patterns',
          title: 'Interview Anti-Patterns & How to Avoid Them',
          summary: 'The nine mistakes that sink LLD interviews — each with a symptom, a fix, and what to say instead.',
          minutes: 15,
          level: 'intermediate',
          essential: true,
          objectives: [
            'Recognise the most common LLD interview failure modes',
            'Apply a concrete corrective for each one',
            'Self-review a design against an interviewer checklist',
          ],
          prerequisites: ['delivery-framework'],
          related: ['dry-kiss-yagni', 'composition-vs-inheritance', 'domain-invariants'],
          problems: ['chess', 'food-ordering'],
          tags: ['mistakes', 'god object', 'overengineering'],
        },
      ],
    },
  ],
};
