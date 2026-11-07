import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { copyText } from '../CodeBlock';

// Mermaid diagrams (```mermaid title="…"). Mermaid itself is a large library, so it is
// imported on first use and only by pages that have a diagram.
//
// Flowcharts get a shared set of node classes so architecture diagrams look alike:
//   A[Client]:::client  B[Load balancer]:::lb  C[Service]:::svc  D[(Postgres)]:::db
//   E[(Redis)]:::cache  F[[Kafka]]:::queue  G[(S3)]:::store  H[Stripe]:::ext
// Sequence diagrams (and flowcharts whose edge labels start with "1.", "2." …) can be
// stepped through one message at a time.

type MermaidApi = typeof import('mermaid')['default'];

let mermaidPromise: Promise<MermaidApi> | null = null;

const loadMermaid = () => {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
        themeVariables: {
          darkMode: true,
          background: '#0f172a',
          fontSize: '14px',
          primaryColor: '#1e293b',
          primaryTextColor: '#e2e8f0',
          primaryBorderColor: '#475569',
          secondaryColor: '#172033',
          tertiaryColor: '#0b1220',
          lineColor: '#64748b',
          textColor: '#cbd5e1',
          edgeLabelBackground: '#0f172a',
          clusterBkg: '#0b1220',
          clusterBorder: '#334155',
          noteBkgColor: '#1e293b',
          noteTextColor: '#e2e8f0',
          noteBorderColor: '#475569',
          actorBkg: '#1e293b',
          actorBorder: '#38bdf8',
          actorTextColor: '#e2e8f0',
          actorLineColor: '#475569',
          signalColor: '#94a3b8',
          signalTextColor: '#e2e8f0',
          labelBoxBkgColor: '#1e293b',
          labelBoxBorderColor: '#475569',
          labelTextColor: '#e2e8f0',
          loopTextColor: '#cbd5e1',
          activationBkgColor: '#334155',
          activationBorderColor: '#64748b',
          sequenceNumberColor: '#0f172a',
        },
        flowchart: { curve: 'basis', padding: 12 },
        sequence: { mirrorActors: false, showSequenceNumbers: false },
      });
      return mermaid;
    });
  }
  return mermaidPromise;
};

const CLASS_DEFS = [
  'classDef client fill:#0c4a6e,stroke:#38bdf8,color:#e0f2fe',
  'classDef lb fill:#1e1b4b,stroke:#818cf8,color:#e0e7ff',
  'classDef svc fill:#1e293b,stroke:#38bdf8,color:#e2e8f0',
  'classDef db fill:#064e3b,stroke:#34d399,color:#d1fae5',
  'classDef cache fill:#7f1d1d,stroke:#f87171,color:#fee2e2',
  'classDef queue fill:#78350f,stroke:#fbbf24,color:#fef3c7',
  'classDef store fill:#3b0764,stroke:#c084fc,color:#f3e8ff',
  'classDef ext fill:#262626,stroke:#a3a3a3,color:#e5e5e5,stroke-dasharray:4 3',
];

/** Adds the shared node classes to flowcharts (after the header line). */
export const prepareSource = (source: string) => {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const header = lines.findIndex((l) => l.trim() && !l.trim().startsWith('%%'));
  if (header === -1 || !/^(flowchart|graph)\b/.test(lines[header].trim())) return lines.join('\n');
  return [...lines.slice(0, header + 1), ...CLASS_DEFS.map((d) => `  ${d}`), ...lines.slice(header + 1)].join('\n');
};

export const diagramType = (source: string) => {
  const first = source.split('\n').find((l) => l.trim() && !l.trim().startsWith('%%'))?.trim() ?? '';
  return first.split(/\s+/)[0];
};

interface Step {
  els: Element[];
  label: string;
}

/** The message-by-message walk through a rendered diagram, when its structure allows one. */
const collectSteps = (svg: SVGSVGElement, type: string): Step[] => {
  if (type === 'sequenceDiagram') {
    const texts = Array.from(svg.querySelectorAll('.messageText'));
    const lines = Array.from(svg.querySelectorAll('.messageLine0, .messageLine1'));
    if (texts.length < 2 || texts.length !== lines.length) return [];
    const numbers = Array.from(svg.querySelectorAll('.sequenceNumber'));
    return texts.map((t, i) => ({
      els: [t, lines[i], ...(numbers.length === texts.length ? [numbers[i]] : [])],
      label: (t.textContent ?? '').trim(),
    }));
  }
  if (type === 'flowchart' || type === 'graph') {
    const labels = Array.from(svg.querySelectorAll('.edgeLabels .edgeLabel'));
    const paths = Array.from(svg.querySelectorAll('.edgePaths path, path.flowchart-link'));
    const uniquePaths = Array.from(new Set(paths));
    if (labels.length === 0 || labels.length !== uniquePaths.length) return [];
    const numbered = labels
      .map((l, i) => ({ text: (l.textContent ?? '').trim(), i }))
      .map((l) => ({ ...l, n: Number(l.text.match(/^(\d+)[.)]?\s/)?.[1]) }))
      .filter((l) => Number.isFinite(l.n))
      .sort((a, b) => a.n - b.n);
    if (numbered.length < 2) return [];
    return numbered.map((l) => ({ els: [labels[l.i], uniquePaths[l.i]], label: l.text }));
  }
  return [];
};

const applyStep = (svg: SVGSVGElement | null, steps: Step[], current: number) => {
  if (!svg) return;
  steps.forEach((s, i) => {
    for (const el of s.els) {
      const node = el as SVGElement | HTMLElement;
      node.style.transition = 'opacity 150ms';
      node.style.opacity = current < 0 || i <= current ? '1' : '0.12';
      if (node instanceof SVGElement && node.tagName !== 'text' && node.tagName !== 'g') {
        node.style.stroke = current >= 0 && i === current ? '#38bdf8' : '';
        node.style.strokeWidth = current >= 0 && i === current ? '2.5px' : '';
      } else {
        node.style.fontWeight = current >= 0 && i === current ? '700' : '';
      }
    }
  });
};

let renderCounter = 0;

interface MermaidDiagramProps {
  source: string;
  title?: string;
  /** Shows a Save button (e.g. to the revision notebook). */
  onSave?: (source: string, title?: string) => void;
  /** Smaller frame without toolbar extras (live previews). */
  compact?: boolean;
  /** Called after every render attempt (the diagram editor shows errors next to the text). */
  onRendered?: (error: string | null) => void;
}

type RenderState = { status: 'loading' } | { status: 'ready'; svg: string } | { status: 'error'; message: string };

const toolbarButton =
  'inline-flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';

const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ source, title, onSave, compact, onRendered }) => {
  const reactId = useId();
  const [state, setState] = useState<RenderState>({ status: 'loading' });
  const [showText, setShowText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);
  const [current, setCurrent] = useState(-1);
  const [zoom, setZoom] = useState(1);
  const holder = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogHolder = useRef<HTMLDivElement>(null);
  const prepared = useMemo(() => prepareSource(source.trim()), [source]);
  const type = useMemo(() => diagramType(source), [source]);
  const label = title ?? (type === 'sequenceDiagram' ? 'Request flow' : 'Architecture diagram');

  useEffect(() => {
    let cancelled = false;
    const id = `mmd-${reactId.replace(/[^a-zA-Z0-9]/g, '')}-${++renderCounter}`;
    loadMermaid()
      .then(async (mermaid) => {
        await mermaid.parse(prepared);
        const { svg } = await mermaid.render(id, prepared);
        if (!cancelled) {
          setState({ status: 'ready', svg });
          onRendered?.(null);
        }
      })
      .catch((error: unknown) => {
        // A failed render can leave Mermaid's scratch element behind.
        document.getElementById(id)?.remove();
        document.getElementById(`d${id}`)?.remove();
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          setState({ status: 'error', message });
          onRendered?.(message);
        }
      });
    return () => {
      cancelled = true;
    };
    // onRendered is a notification only; re-rendering when it changes identity isn't needed.
  }, [prepared, reactId]);

  // Put the SVG in place and work out the steps once it is in the document.
  useEffect(() => {
    if (state.status !== 'ready' || !holder.current) return;
    holder.current.innerHTML = state.svg;
    const svg = holder.current.querySelector('svg');
    if (!svg) return;
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
    // Keep text readable on small screens: scroll sideways rather than shrink below ~560px.
    const natural = svg.viewBox.baseVal?.width ?? 0;
    if (natural > 0) svg.style.minWidth = `${Math.min(natural, 560)}px`;
    setSteps(compact ? [] : collectSteps(svg, type));
    setCurrent(-1);
  }, [state, type, label, compact]);

  useEffect(() => {
    applyStep(holder.current?.querySelector('svg') ?? null, steps, current);
  }, [steps, current]);

  const openExpanded = () => {
    if (state.status !== 'ready') return;
    setZoom(1);
    dialog.current?.showModal();
    requestAnimationFrame(() => {
      if (!dialogHolder.current) return;
      dialogHolder.current.innerHTML = state.svg;
      const svg = dialogHolder.current.querySelector('svg');
      if (svg) {
        svg.removeAttribute('role');
        svg.setAttribute('aria-hidden', 'true');
      }
    });
  };

  useEffect(() => {
    const svg = dialogHolder.current?.querySelector('svg');
    if (!svg) return;
    const natural = svg.viewBox.baseVal?.width ?? 0;
    svg.style.maxWidth = 'none';
    svg.style.width = natural > 0 ? `${natural * zoom}px` : `${zoom * 100}%`;
  }, [zoom]);

  const onCopy = async () => {
    try {
      await copyText(source.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const stepping = current >= 0;

  return (
    <figure
      className={`not-prose ${compact ? 'my-0' : 'my-6'} rounded-xl border border-slate-700/80 bg-slate-950/50 overflow-hidden`}
      data-diagram={state.status}
      data-diagram-type={type}
    >
      {!compact && (
        <figcaption className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/80">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 min-w-0">{label}</span>
          <span className="flex flex-wrap items-center gap-0.5">
            {steps.length > 0 && !stepping && (
              <button type="button" onClick={() => setCurrent(0)} className={`${toolbarButton} !text-sky-300`}>
                ▶ Step through ({steps.length})
              </button>
            )}
            <button type="button" onClick={openExpanded} disabled={state.status !== 'ready'} className={toolbarButton} aria-haspopup="dialog">
              ⤢ Expand
            </button>
            <button type="button" onClick={() => setShowText((s) => !s)} aria-pressed={showText} className={toolbarButton}>
              {showText ? 'Hide text' : 'Text'}
            </button>
            <button type="button" onClick={onCopy} className={toolbarButton}>
              <span aria-live="polite">{copied ? 'Copied!' : 'Copy'}</span>
            </button>
            {onSave && (
              <button
                type="button"
                onClick={() => {
                  onSave(source.trim(), title);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }}
                className={toolbarButton}
                aria-label={saved ? 'Diagram saved to your notebook' : 'Save diagram to your notebook'}
              >
                <span aria-live="polite">{saved ? 'Saved' : 'Save'}</span>
              </button>
            )}
          </span>
        </figcaption>
      )}

      {stepping && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-sky-500/20 bg-sky-500/5" role="group" aria-label="Step through the flow">
          <p className="text-sm text-slate-200 min-w-0 [overflow-wrap:anywhere]" aria-live="polite">
            <span className="font-semibold text-sky-300">
              Step {current + 1} of {steps.length}:
            </span>{' '}
            {steps[current]?.label}
          </p>
          <span className="flex items-center gap-1">
            <button type="button" onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} className={`${toolbarButton} disabled:opacity-40`}>
              ← Prev
            </button>
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.min(steps.length - 1, c + 1))}
              disabled={current === steps.length - 1}
              className={`${toolbarButton} disabled:opacity-40`}
            >
              Next →
            </button>
            <button type="button" onClick={() => setCurrent(-1)} className={toolbarButton}>
              Show all
            </button>
          </span>
        </div>
      )}

      {state.status === 'loading' && (
        <div className="flex items-center justify-center min-h-[8rem] text-xs text-slate-400" role="status">
          Rendering diagram…
        </div>
      )}
      {state.status === 'error' && (
        <div className="px-4 py-3" role="alert">
          <p className="text-xs font-semibold text-amber-300 mb-2">This diagram couldn’t be drawn. Its text is shown instead.</p>
          {compact && <p className="text-xs text-slate-400 mb-2 [overflow-wrap:anywhere]">{state.message.split('\n')[0]}</p>}
          {!compact && <pre className="overflow-x-auto text-[13px] leading-relaxed text-slate-300 font-mono" tabIndex={0}>{source.trim()}</pre>}
        </div>
      )}
      <div className={`overflow-x-auto ${state.status === 'ready' ? 'px-3 py-4' : 'hidden'}`} tabIndex={state.status === 'ready' ? 0 : -1} aria-label={`${label} (scrollable)`}>
        <div ref={holder} className="mx-auto w-fit max-w-full [&_svg]:mx-auto [&_svg]:h-auto" />
      </div>

      {showText && (
        <pre className="border-t border-slate-800 overflow-x-auto px-4 py-3 text-[12.5px] leading-relaxed text-slate-300 font-mono" tabIndex={0}>{source.trim()}</pre>
      )}

      <dialog
        ref={dialog}
        aria-label={label}
        className="m-0 h-[100dvh] w-[100vw] max-h-none max-w-none bg-slate-950/95 p-0 text-slate-200 backdrop:bg-slate-950/80"
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="flex h-full flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-4 py-2">
            <p className="text-sm font-semibold text-white">{label}</p>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className={toolbarButton} aria-label="Zoom out">
                −
              </button>
              <span className="text-xs text-slate-400 w-12 text-center" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button type="button" onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className={toolbarButton} aria-label="Zoom in">
                +
              </button>
              <button type="button" onClick={() => setZoom(1)} className={toolbarButton}>
                Reset
              </button>
              <button type="button" onClick={() => dialog.current?.close()} className={`${toolbarButton} !text-white`} autoFocus>
                Close ✕
              </button>
            </span>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div ref={dialogHolder} className="mx-auto w-fit" />
          </div>
        </div>
      </dialog>
    </figure>
  );
};

export default MermaidDiagram;
