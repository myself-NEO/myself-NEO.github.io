/** LLD vs HLD, shown on the System Design landing and the HLD overview. */
export const COMPARISON: { aspect: string; lld: string; hld: string }[] = [
  { aspect: 'Question it answers', lld: 'How is the code inside one component organised?', hld: 'Which components exist and how do they talk?' },
  { aspect: 'Building blocks', lld: 'Classes, interfaces, enums, methods, patterns', hld: 'Services, databases, caches, queues, load balancers' },
  { aspect: 'Typical prompt', lld: '“Design a parking lot” — model it in Java', hld: '“Design Twitter” — serve 100M users' },
  { aspect: 'Main concerns', lld: 'Responsibilities, extensibility, correctness, testability', hld: 'Scalability, availability, latency, consistency' },
  { aspect: 'Output', lld: 'Class diagram + working code for core flows', hld: 'Architecture diagram + data model + APIs' },
  { aspect: 'Scale of thinking', lld: 'Objects and method calls (ns–ms)', hld: 'Machines and network hops (ms–s)' },
];
