import React, { createContext, useContext, useMemo } from 'react';
import ReactMarkdown, { Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import CodeBlock from './CodeBlock';
import UmlDiagram from './UmlDiagram';
import StateDiagram from './StateDiagram';
import Quiz from './Quiz';
import { lessonHref, problemHref } from './routes';
import { TrackId } from '../../content/system-design/types';

// Authoring conventions for lesson/problem markdown (in addition to GFM):
//
//   > [!NOTE] / [!TIP] / [!WARNING] / [!INTERVIEW] Optional title   → callout
//   ```java title="Ticket.java"                                     → highlighted, copyable code
//   ```uml / ```states                                              → class / state diagrams
//   ```quiz                                                          → knowledge check (see Quiz.tsx)
//   ````hint title="Hint 1"  (four backticks, may contain code)      → collapsed hint
//   ````solution title="..." / ````reveal title="..."                → collapsed solution / explanation
//   [text](lesson:slug) and [text](problem:slug)                     → links within the current track

interface MarkdownEnv {
  track: TrackId;
  /** Called when a hint or solution is opened. */
  onReveal?: () => void;
  onQuizPassed?: () => void;
  quizAlreadyPassed?: boolean;
}

const MarkdownEnvContext = createContext<MarkdownEnv>({ track: 'lld' });

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
  data?: { meta?: string };
};

const CALLOUT_RE = /^\[!(NOTE|TIP|WARNING|INTERVIEW)\][ \t]*([^\n]*)\n?/;

/** Rehype plugin: turns `> [!TIP] Title` blockquotes into tagged callouts. */
const rehypeCallouts = () => (tree: HastNode) => {
  const visit = (node: HastNode) => {
    if (node.type === 'element' && node.tagName === 'blockquote') {
      const paragraph = node.children?.find((c) => c.type === 'element');
      const first = paragraph?.tagName === 'p' ? paragraph.children?.[0] : undefined;
      const match = first?.type === 'text' ? first.value?.match(CALLOUT_RE) : null;
      if (first && match) {
        first.value = first.value!.slice(match[0].length);
        node.properties = { ...node.properties, dataCallout: match[1].toLowerCase(), dataCalloutTitle: match[2].trim() };
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
};

const CALLOUTS: Record<string, { label: string; icon: string; classes: string; titleClass: string }> = {
  note: { label: 'Note', icon: 'ℹ️', classes: 'border-sky-500/40 bg-sky-500/5', titleClass: 'text-sky-300' },
  tip: { label: 'Tip', icon: '💡', classes: 'border-emerald-500/40 bg-emerald-500/5', titleClass: 'text-emerald-300' },
  warning: { label: 'Watch out', icon: '⚠️', classes: 'border-amber-500/40 bg-amber-500/5', titleClass: 'text-amber-300' },
  interview: { label: 'Interview insight', icon: '🎯', classes: 'border-violet-500/40 bg-violet-500/5', titleClass: 'text-violet-300' },
};

const parseMeta = (meta: string | undefined) => {
  const attrs: Record<string, string> = {};
  if (!meta) return attrs;
  for (const match of meta.matchAll(/(\w+)="([^"]*)"/g)) attrs[match[1]] = match[2];
  return attrs;
};

const textOf = (node: HastNode | undefined): string =>
  !node ? '' : node.type === 'text' ? node.value ?? '' : (node.children ?? []).map(textOf).join('');

const REVEAL_STYLES: Record<string, { icon: string; defaultTitle: string; classes: string; summaryClass: string }> = {
  hint: { icon: '💡', defaultTitle: 'Hint', classes: 'border-amber-500/30 bg-amber-500/[0.03]', summaryClass: 'text-amber-200' },
  solution: { icon: '✅', defaultTitle: 'Reference solution', classes: 'border-emerald-500/30 bg-emerald-500/[0.03]', summaryClass: 'text-emerald-200' },
  reveal: { icon: '🔍', defaultTitle: 'Show explanation', classes: 'border-slate-600 bg-slate-900/40', summaryClass: 'text-slate-200' },
};

const Reveal: React.FC<{ kind: string; title?: string; body: string }> = ({ kind, title, body }) => {
  const env = useContext(MarkdownEnvContext);
  const style = REVEAL_STYLES[kind];
  return (
    <details
      className={`group my-5 rounded-xl border ${style.classes}`}
      onToggle={(e) => {
        if (e.currentTarget.open && kind !== 'reveal') env.onReveal?.();
      }}
    >
      <summary
        className={`flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold ${style.summaryClass} rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 [&::-webkit-details-marker]:hidden`}
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true">{style.icon}</span>
          {title ?? style.defaultTitle}
        </span>
        <span className="text-xs font-medium text-slate-400 group-open:hidden">Click to reveal</span>
        <span className="text-xs font-medium text-slate-400 hidden group-open:inline">Hide</span>
      </summary>
      <div className="px-4 sm:px-5 pb-4 border-t border-slate-800/80 pt-4">
        <MarkdownBody markdown={body} />
      </div>
    </details>
  );
};

const PreBlock: Components['pre'] = ({ node }) => {
  const env = useContext(MarkdownEnvContext);
  const codeEl = (node as unknown as HastNode)?.children?.[0];
  const classes = (codeEl?.properties?.className as string[] | undefined) ?? [];
  const language = classes.find((c) => c.startsWith('language-'))?.slice('language-'.length);
  const meta = parseMeta(codeEl?.data?.meta);
  const source = textOf(codeEl);

  if (language === 'quiz') return <Quiz source={source} onPassed={env.onQuizPassed} alreadyPassed={env.quizAlreadyPassed} />;
  if (language === 'uml') return <UmlDiagram source={source} title={meta.title} />;
  if (language === 'states') return <StateDiagram source={source} title={meta.title} />;
  if (language && language in REVEAL_STYLES) return <Reveal kind={language} title={meta.title} body={source} />;
  return <CodeBlock code={source} language={language} title={meta.title ?? meta.file} />;
};

const Callout: Components['blockquote'] = ({ node, children }) => {
  const props = (node as unknown as HastNode)?.properties ?? {};
  const type = props.dataCallout as string | undefined;
  const callout = type ? CALLOUTS[type] : undefined;
  if (!callout) return <blockquote>{children}</blockquote>;
  const title = (props.dataCalloutTitle as string) || callout.label;
  return (
    // Not `not-prose`: the callout body should keep the article's typography.
    <aside className={`my-6 rounded-xl border-l-4 border ${callout.classes} px-4 py-3`} aria-label={callout.label}>
      <p className={`!mt-0 !mb-1 text-sm font-semibold flex items-center gap-2 ${callout.titleClass}`}>
        <span aria-hidden="true">{callout.icon}</span>
        {title}
      </p>
      <div className="text-[15px] [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5 [&_li]:my-0.5 [&>*:last-child]:mb-0">{children}</div>
    </aside>
  );
};

const Table: Components['table'] = ({ children }) => (
  <div className="overflow-x-auto my-6 rounded-xl border border-slate-700/80">
    <table className="my-0 min-w-full">{children}</table>
  </div>
);

const Link: Components['a'] = ({ href = '', children }) => {
  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  if (href.startsWith('#') && !href.startsWith('#system-design')) {
    // In-page anchor: scroll without touching the hash (the hash is the route).
    return (
      <a
        href={href}
        onClick={(e) => {
          const target = document.getElementById(decodeURIComponent(href.slice(1)));
          if (!target) return;
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
      >
        {children}
      </a>
    );
  }
  return <a href={href}>{children}</a>;
};

// Module-level so component identities stay stable across renders (otherwise
// quizzes and reveals would remount and lose their state).
const COMPONENTS: Components = { pre: PreBlock, blockquote: Callout, table: Table, a: Link };

const makeUrlTransform = (track: TrackId) => (url: string) => {
  if (url.startsWith('lesson:')) return lessonHref(track, url.slice('lesson:'.length));
  if (url.startsWith('problem:')) return problemHref(track, url.slice('problem:'.length));
  return defaultUrlTransform(url);
};

const MarkdownBody: React.FC<{ markdown: string }> = ({ markdown }) => {
  const { track } = useContext(MarkdownEnvContext);
  // Parsing is the expensive part; context consumers inside still update.
  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeCallouts]}
        components={COMPONENTS}
        urlTransform={makeUrlTransform(track)}
      >
        {markdown}
      </ReactMarkdown>
    ),
    [markdown, track],
  );
  return (
    <div className="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-headings:scroll-mt-24 prose-h2:text-2xl prose-h2:mt-12 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-800 prose-h3:text-lg prose-p:leading-7 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline prose-code:text-sky-300 prose-code:bg-slate-800/70 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-normal prose-code:before:content-none prose-code:after:content-none prose-th:text-slate-200 prose-th:px-3 prose-td:px-3 prose-td:text-slate-300 prose-thead:bg-slate-900/80 prose-hr:border-slate-800">
      {rendered}
    </div>
  );
};

interface MarkdownContentProps extends MarkdownEnv {
  markdown: string;
}

const MarkdownContent: React.FC<MarkdownContentProps> = ({ markdown, ...env }) => (
  <MarkdownEnvContext.Provider value={env}>
    <MarkdownBody markdown={markdown} />
  </MarkdownEnvContext.Provider>
);

export default MarkdownContent;
