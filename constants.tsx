
import React from 'react';
import { Milestone, Skill, LearningTopic } from './types';

export const MILESTONES: Milestone[] = [
  {
    year: '2025 - 2026',
    title: 'Google',
    location: '',
    description: 'Developing Ads partner tools and underlying infrastructure, enabling scalable, reliable communication between publishers and internal systems while improving partner workflows and user experience.'
  },
  {
    year: '2022 - 2025',
    title: 'Senior Software Engineer',
    location: 'Optum (UnitedHealth Group)',
    description: 'Developed scalable microservices for healthcare platforms using Java Spring Boot. Focused on data integrity and high availability.'
  },
  {
    year: '2021 - 2022',
    title: 'Software Developer',
    location: 'Datoms',
    description: 'Enhanced Service APIs and created Dashboards'
  },
  {
    year: '2017 - 2021',
    title: 'Bachelor of Technology',
    location: 'NIT Raipur',
    description: 'Deep-dived into algorithms, OS, and software engineering principles. Missed last year of college life, thanks to COVID'
  },
  {
    year: '2014-2015',
    title: 'RMO & INMO',
    location: 'New Delhi',
    description: 'Secured AIR 6 in KVS Regional Mathematical Olympiad.'
  }
];

export const SKILLS: Skill[] = [
  { name: 'Java', category: 'backend', icon: '☕' },
  { name: 'Spring Boot', category: 'backend', icon: '🍃' },
  { name: 'REST API', category: 'backend', icon: '🔗' },
  { name: 'Microservices', category: 'backend', icon: '🧱' },
  { name: 'MySQL', category: 'backend', icon: '🐬' },
  { name: 'GCP', category: 'cloud', icon: '☁️' },
  { name: 'Agentic AI', category: 'cloud', icon: '🤖' },
  { name: 'System Design', category: 'backend', icon: '⚙' },
  { name: 'Kafka', category: 'cloud', icon: '📟' },
  { name: 'CI/CD', category: 'cloud', icon: '☁️' },
  { name: 'Python', category: 'backend', icon: '🐍' },
  { name: 'Google Ad Manager', category: 'tools', icon: '📊' },
  { name: 'TypeScript', category: 'frontend', icon: '🟦' },
  { name: 'Angular', category: 'frontend', icon: '🅰️' },
  { name: 'React', category: 'frontend', icon: '⚛️' }
];

export const LEARNING_TOPICS: LearningTopic[] = [
  { slug: 'arrays-strings', title: 'Arrays & Strings', icon: '🔢' },
  { slug: 'linked-list', title: 'Linked List', icon: '🔗' },
  { slug: 'stacks-queues', title: 'Stacks & Queues', icon: '📚' },
  { slug: 'recursion-backtracking', title: 'Recursion & Backtracking', icon: '🔁' },
  { slug: 'trees', title: 'Trees', icon: '🌳' },
  { slug: 'graphs', title: 'Graphs', icon: '🕸️' },
  { slug: 'dynamic-programming', title: 'Dynamic Programming', icon: '🧩' },
  { slug: 'bit-manipulation', title: 'Bit Manipulation', icon: '🔟' },
  { slug: 'cheatsheet', title: 'Cheatsheet', icon: '💻' },
  { slug: 'core-cheatsheet', title: 'Core Cheatsheet', icon: '📚' },
  { slug: 'graphs-cheatsheet', title: 'Graphs Cheatsheet', icon: '💀' }
];
