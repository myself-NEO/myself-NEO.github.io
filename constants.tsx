
import React from 'react';
import { Milestone, Skill } from './types';

export const MILESTONES: Milestone[] = [
  {
    year: '2024 - Present',
    title: '',
    location: 'Google',
    description: 'Developing Ads partner tools and underlying infrastructure, enabling scalable, reliable communication between publishers and internal systems while improving partner workflows and user experience.'
  },
  {
    year: '2021 - 2024',
    title: 'Software Developer',
    location: 'Optum (UnitedHealth Group)',
    description: 'Developed scalable microservices for healthcare platforms using Java Spring Boot. Focused on data integrity and high availability.'
  },
  {
    year: '2017 - 2021',
    title: 'Bachelor of Technology',
    location: 'NIT Raipur',
    description: 'Deep-dived into algorithms, OS, and software engineering principles. Missed last year of college life, thanks to COVID'
  }
];

export const SKILLS: Skill[] = [
  { name: 'Java', category: 'backend', icon: '☕' },
  { name: 'Spring Boot', category: 'backend', icon: '🍃' },
  { name: 'Python', category: 'backend', icon: '🐍' },
  { name: 'REST API', category: 'backend', icon: '🔗' },
  { name: 'Angular', category: 'frontend', icon: '🅰️' },
  { name: 'React', category: 'frontend', icon: '⚛️' },
  { name: 'Google Ad Manager', category: 'tools', icon: '📊' },
  { name: 'TypeScript', category: 'frontend', icon: '🟦' },
  { name: 'Microservices', category: 'backend', icon: '🧱' },
  { name: 'Cloud Native', category: 'cloud', icon: '☁️' }
];
