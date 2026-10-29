import React from 'react';
import { Level, ProblemStatus } from '../../content/system-design/types';

export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const LEVEL_CLASSES: Record<Level, string> = {
  beginner: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  intermediate: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  advanced: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export const LevelBadge: React.FC<{ level: Level; className?: string }> = ({ level, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border ${LEVEL_CLASSES[level]} ${className}`}>
    {LEVEL_LABEL[level]}
  </span>
);

export const Chip: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-slate-800 text-slate-300 border border-slate-700 ${className}`}>
    {children}
  </span>
);

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  'not-started': 'Not started',
  'in-progress': 'In progress',
  completed: 'Completed',
};

export const StatusBadge: React.FC<{ status: ProblemStatus }> = ({ status }) => {
  const classes: Record<ProblemStatus, string> = {
    'not-started': 'text-slate-400 bg-slate-800 border-slate-700',
    'in-progress': 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    completed: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold rounded-md border ${classes[status]}`}>
      <StatusIcon status={status} className="h-3.5 w-3.5" />
      {STATUS_LABEL[status]}
    </span>
  );
};

export const ProgressBar: React.FC<{ value: number; max: number; label: string; className?: string }> = ({
  value,
  max,
  label,
  className = '',
}) => {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={`${value} of ${max}`}
      className={`h-1.5 w-full rounded-full bg-slate-800 overflow-hidden ${className}`}
    >
      <div className="h-full rounded-full bg-sky-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
    </div>
  );
};

type IconProps = { className?: string };

export const CheckCircleIcon: React.FC<IconProps & { filled?: boolean }> = ({ className = 'h-4 w-4', filled }) =>
  filled ? (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
      <circle cx="10" cy="10" r="7.25" />
    </svg>
  );

export const HalfCircleIcon: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 20 20" aria-hidden="true">
    <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth={1.5} />
    <path d="M10 2.75a7.25 7.25 0 010 14.5z" fill="currentColor" />
  </svg>
);

export const StatusIcon: React.FC<IconProps & { status: ProblemStatus }> = ({ status, className = 'h-4 w-4' }) => {
  if (status === 'completed') return <CheckCircleIcon filled className={`${className} text-emerald-400`} />;
  if (status === 'in-progress') return <HalfCircleIcon className={`${className} text-amber-400`} />;
  return <CheckCircleIcon className={`${className} text-slate-600`} />;
};

export const ChevronIcon: React.FC<IconProps & { direction?: 'down' | 'right' | 'left' }> = ({
  className = 'h-4 w-4',
  direction = 'down',
}) => {
  const rotate = { down: '', right: '-rotate-90', left: 'rotate-90' }[direction];
  return (
    <svg className={`${className} ${rotate}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
};

export const ArrowIcon: React.FC<IconProps & { direction?: 'left' | 'right' }> = ({ className = 'h-4 w-4', direction = 'right' }) => (
  <svg className={`${className} ${direction === 'left' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

export const SearchIcon: React.FC<IconProps> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ className = 'h-3.5 w-3.5' }) => (
  <svg className={className} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" />
  </svg>
);

export const Breadcrumbs: React.FC<{ items: { label: string; href?: string }[] }> = ({ items }) => (
  <nav aria-label="Breadcrumb" className="mb-6">
    <ol className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
      {items.map((item, i) => (
        <li key={`${item.label}-${i}`} className="flex items-center gap-1.5 min-w-0">
          {i > 0 && <ChevronIcon direction="right" className="h-3.5 w-3.5 text-slate-600 flex-shrink-0" />}
          {item.href ? (
            <a href={item.href} className="hover:text-sky-400 transition-colors truncate">
              {item.label}
            </a>
          ) : (
            <span aria-current="page" className="text-slate-300 truncate">
              {item.label}
            </span>
          )}
        </li>
      ))}
    </ol>
  </nav>
);

export const focusRing = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900';
