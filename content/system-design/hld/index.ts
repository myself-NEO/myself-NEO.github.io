import { Track } from '../types';

// HLD is planned. Add stages/problems (and markdown under ./lessons, ./problems)
// here when the track is built — the System Design pages render any track
// whose status is 'active' without further changes.
export const HLD_TRACK: Track = {
  id: 'hld',
  title: 'High-Level Design',
  shortTitle: 'HLD',
  status: 'planned',
  tagline: 'Distributed systems architecture',
  description:
    'Design the services, data stores, caches, queues and APIs that make up a whole system — and reason about scale, availability and consistency.',
  stages: [],
  problems: [],
  plannedTopics: [
    { title: 'Estimation & requirements', description: 'Back-of-the-envelope maths for QPS, storage and bandwidth.' },
    { title: 'Core building blocks', description: 'Load balancers, caches, CDNs, databases, queues and object storage.' },
    { title: 'Data modeling & storage', description: 'SQL vs NoSQL, indexing, partitioning, replication.' },
    { title: 'Consistency & availability', description: 'CAP, quorum, consensus and their practical consequences.' },
    { title: 'Scaling patterns', description: 'Sharding, read replicas, fan-out, CQRS and event-driven designs.' },
    { title: 'Classic HLD problems', description: 'URL shortener, news feed, chat, ride-hailing, rate limiting at scale.' },
  ],
};
