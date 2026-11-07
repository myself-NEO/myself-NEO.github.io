import React, { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';

// A structured Mermaid workspace: the text is the diagram, the palette inserts
// architecture components and the connect helper adds arrows between them.

const MermaidDiagram = lazy(() => import('./MermaidDiagram'));

export const STARTER_DIAGRAM = `flowchart LR
  C[Client]:::client --> LB[Load balancer]:::lb
  LB --> S[Service]:::svc
  S --> DB[(Database)]:::db
`;

const PALETTE: { label: string; prefix: string; shape: (id: string, label: string) => string }[] = [
  { label: 'Client', prefix: 'C', shape: (id, l) => `${id}[${l}]:::client` },
  { label: 'CDN', prefix: 'CDN', shape: (id, l) => `${id}[${l}]:::lb` },
  { label: 'Load balancer', prefix: 'LB', shape: (id, l) => `${id}[${l}]:::lb` },
  { label: 'API gateway', prefix: 'GW', shape: (id, l) => `${id}[${l}]:::lb` },
  { label: 'Service', prefix: 'S', shape: (id, l) => `${id}[${l}]:::svc` },
  { label: 'Worker', prefix: 'W', shape: (id, l) => `${id}[${l}]:::svc` },
  { label: 'Database', prefix: 'DB', shape: (id, l) => `${id}[(${l})]:::db` },
  { label: 'Cache', prefix: 'CA', shape: (id, l) => `${id}[(${l})]:::cache` },
  { label: 'Queue', prefix: 'Q', shape: (id, l) => `${id}[[${l}]]:::queue` },
  { label: 'Object storage', prefix: 'OS', shape: (id, l) => `${id}[(${l})]:::store` },
  { label: 'Search index', prefix: 'SE', shape: (id, l) => `${id}[(${l})]:::db` },
  { label: 'External service', prefix: 'X', shape: (id, l) => `${id}[${l}]:::ext` },
];

/** Node ids declared or used in a flowchart, in order of first appearance. */
export const nodeIds = (source: string) => {
  const ids: string[] = [];
  const add = (id: string) => {
    if (!ids.includes(id) && !/^(flowchart|graph|subgraph|end|classDef|class|style|linkStyle|direction|click)$/.test(id)) ids.push(id);
  };
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('%%') || /^(flowchart|graph|classDef|class|style|linkStyle|direction|subgraph|end)\b/.test(line)) continue;
    // Each side of an arrow starts with a node id, optionally after an |edge label|.
    for (const part of line.split(/<-->|-->|-\.->|==>|---|--x|--o|&/)) {
      const id = part.trim().replace(/^\|[^|]*\|\s*/, '').match(/^([A-Za-z][\w]*)/)?.[1];
      if (id) add(id);
    }
  }
  return ids;
};

const nextId = (source: string, prefix: string) => {
  const used = new Set(nodeIds(source));
  for (let i = 1; ; i++) if (!used.has(`${prefix}${i}`)) return `${prefix}${i}`;
};

interface DiagramEditorProps {
  value: string;
  onChange: (value: string) => void;
  label: string;
  rows?: number;
}

const buttonClass =
  'inline-flex items-center rounded-md border border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white hover:border-sky-500/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
const fieldClass =
  'rounded-md bg-slate-950/60 border border-slate-700 px-2 py-1 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500';

const DiagramEditor: React.FC<DiagramEditorProps> = ({ value, onChange, label, rows = 12 }) => {
  const id = useId();
  const [preview, setPreview] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [edgeLabel, setEdgeLabel] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const ids = useMemo(() => nodeIds(value), [value]);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setPreview(value), 500);
    return () => clearTimeout(timer.current);
  }, [value]);

  const append = (line: string) => {
    const base = value.trim() ? value.replace(/\s*$/, '\n') : 'flowchart LR\n';
    onChange(`${base}  ${line}\n`);
    requestAnimationFrame(() => textarea.current?.focus());
  };

  const isFlowchart = /^\s*(flowchart|graph)\b/.test(value.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%')) ?? '');

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="min-w-0 space-y-2">
        <label htmlFor={`${id}-src`} className="block text-sm font-semibold text-slate-200">
          {label}
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Insert a component">
          {PALETTE.map((p) => (
            <button key={p.label} type="button" className={buttonClass} onClick={() => append(p.shape(nextId(value, p.prefix), p.label))} disabled={!isFlowchart && value.trim() !== ''}>
              + {p.label}
            </button>
          ))}
        </div>
        <textarea
          id={`${id}-src`}
          ref={textarea}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          spellCheck={false}
          placeholder={STARTER_DIAGRAM}
          className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-[13px] leading-relaxed text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
        {isFlowchart && ids.length >= 2 && (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Connect two components">
            <span className="text-[11px] font-semibold text-slate-400">Connect</span>
            <label className="sr-only" htmlFor={`${id}-from`}>
              From
            </label>
            <select id={`${id}-from`} value={from} onChange={(e) => setFrom(e.target.value)} className={fieldClass}>
              <option value="">from…</option>
              {ids.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <span className="text-slate-500 text-xs" aria-hidden="true">
              →
            </span>
            <label className="sr-only" htmlFor={`${id}-to`}>
              To
            </label>
            <select id={`${id}-to`} value={to} onChange={(e) => setTo(e.target.value)} className={fieldClass}>
              <option value="">to…</option>
              {ids.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
            <label className="sr-only" htmlFor={`${id}-label`}>
              Arrow label
            </label>
            <input id={`${id}-label`} value={edgeLabel} onChange={(e) => setEdgeLabel(e.target.value)} placeholder="label (optional)" className={`${fieldClass} w-36`} />
            <button
              type="button"
              className={buttonClass}
              disabled={!from || !to}
              onClick={() => {
                const text = edgeLabel.trim().replace(/[|]/g, '/');
                append(text ? `${from} -->|${text}| ${to}` : `${from} --> ${to}`);
                setEdgeLabel('');
              }}
            >
              Add arrow
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-400">
          Mermaid syntax: <code className="text-slate-400">A --&gt; B</code>, <code className="text-slate-400">A --&gt;|label| B</code>, shapes{' '}
          <code className="text-slate-400">[box]</code> <code className="text-slate-400">[(store)]</code> <code className="text-slate-400">[[queue]]</code>. A{' '}
          <code className="text-slate-400">sequenceDiagram</code> works too.
        </p>
      </div>
      <div className="min-w-0" aria-live="polite">
        <p className="text-sm font-semibold text-slate-200 mb-2">Preview</p>
        {preview.trim() ? (
          <Suspense fallback={<div className="min-h-[8rem] rounded-xl border border-slate-800 bg-slate-900/40" />}>
            <MermaidDiagram source={preview} compact onRendered={setError} />
          </Suspense>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-700 px-4 py-10 text-center text-xs text-slate-400">
            Insert a component or type a diagram to see it here.
          </div>
        )}
        {error && preview.trim() && <p className="mt-2 text-xs text-amber-300">Fix the syntax and the preview updates.</p>}
      </div>
    </div>
  );
};

export default DiagramEditor;
