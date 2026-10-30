import React, { createContext, useContext, useMemo } from 'react';
import ReactMarkdown, { Components, defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import CodeBlock from './CodeBlock';
import UmlDiagram from './UmlDiagram';
import StateDiagram from './StateDiagram';
import Quiz from './Quiz';
import { LEARNING_ROUTE_PREFIXES } from './routes';
import type { QuizAnswer } from './progress';

// Authoring conventions for lesson/problem markdown (in addition to GFM):
//
//   > [!NOTE] / [!TIP] / [!WARNING] / [!INTERVIEW] Optional title   → callout
//   ```java title="Ticket.java"                                     → highlighted, copyable code
//   ```java file="Demo.java" java="21"                               → … with a "Java 21+" badge
//   ```java file="Demo.java" java="25" preview="true"                → … with a "Java 25 preview" badge
//   ```uml / ```states                                              → class / state diagrams
//   ```quiz                                                          → knowledge check (see Quiz.tsx)
//   ````hint title="Hint 1"  (four backticks, may contain code)      → collapsed hint
//   ````solution title="..." / ````reveal title="..."                → collapsed solution / explanation
//   [text](lesson:slug) and [text](problem:slug)                     → links within the current track
//   <details><summary>Title</summary> … </details>                   → same as a solution/hint/reveal block

interface MarkdownEnv {
  /** The track's route prefix, used to resolve lesson: and problem: links. */
  basePath: string;
  /** Called when a hint or solution is opened. */
  onReveal?: () => void;
  onQuizPassed?: () => void;
  quizAlreadyPassed?: boolean;
  /** Called on every knowledge-check choice. */
  onQuizAnswer?: (answer: QuizAnswer) => void;
  /** Baseline Java release: runnable examples (```java file="…") get a version badge. */
  javaVersion?: number;
  /** Shows "Save" on code blocks. */
  onSaveSnippet?: (snippet: { code: string; language: string; title?: string }) => void;
  /** Shows a bookmark button on section headings; `savedSections` holds the ids already saved. */
  onToggleSection?: (id: string, title: string) => void;
  savedSections?: ReadonlySet<string>;
}

const MarkdownEnvContext = createContext<MarkdownEnv>({ basePath: '' });

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

  if (language === 'quiz')
    return <Quiz source={source} onPassed={env.onQuizPassed} alreadyPassed={env.quizAlreadyPassed} onAnswer={env.onQuizAnswer} />;
  if (language === 'uml') return <UmlDiagram source={source} title={meta.title} />;
  if (language === 'states') return <StateDiagram source={source} title={meta.title} />;
  if (language && language in REVEAL_STYLES) return <Reveal kind={language} title={meta.title} body={source} />;
  const version = meta.java ? Number(meta.java) : language === 'java' && meta.file ? env.javaVersion : undefined;
  const onSave = env.onSaveSnippet;
  return (
    <CodeBlock
      code={source}
      language={language}
      title={meta.title ?? meta.file}
      version={version}
      preview={meta.preview === 'true'}
      onSave={onSave ? (code) => onSave({ code, language: language ?? 'text', title: meta.title ?? meta.file }) : undefined}
    />
  );
};

/** Section heading with an optional "save this concept" bookmark. */
const SectionHeading: Components['h2'] = ({ node: _node, children, ...props }) => {
  const env = useContext(MarkdownEnvContext);
  const id = typeof props.id === 'string' ? props.id : undefined;
  if (!env.onToggleSection || !id) return <h2 {...props}>{children}</h2>;
  const saved = env.savedSections?.has(id) ?? false;
  const title = textOf(_node as unknown as HastNode);
  return (
    <h2 {...props} className="group/heading flex items-start justify-between gap-3">
      <span>{children}</span>
      <button
        type="button"
        onClick={() => env.onToggleSection?.(id, title)}
        aria-pressed={saved}
        aria-label={saved ? `Remove “${title}” from saved concepts` : `Save “${title}” as a concept to revise`}
        title={saved ? 'Saved to your notebook' : 'Save this concept to your notebook'}
        className={`mt-1.5 flex-shrink-0 rounded-md p-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
          saved ? 'text-sky-300' : 'text-slate-600 hover:text-slate-300 sm:opacity-0 sm:group-hover/heading:opacity-100 focus-visible:opacity-100'
        }`}
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinejoin="round" d="M5.5 3.5h9a.5.5 0 01.5.5v12.6a.4.4 0 01-.64.32L10 13.75l-4.36 3.17A.4.4 0 015 16.6V4a.5.5 0 01.5-.5z" />
        </svg>
      </button>
    </h2>
  );
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
  if (href.startsWith('#') && !LEARNING_ROUTE_PREFIXES.some((prefix) => href.startsWith(prefix))) {
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
const COMPONENTS: Components = { pre: PreBlock, blockquote: Callout, table: Table, a: Link, h2: SectionHeading };

const makeUrlTransform = (basePath: string) => (url: string) => {
  if (url.startsWith('lesson:')) return `${basePath}/learn/${url.slice('lesson:'.length)}`;
  if (url.startsWith('problem:')) return `${basePath}/problems/${url.slice('problem:'.length)}`;
  return defaultUrlTransform(url);
};

const DETAILS_OPEN = /^\s*<details>\s*<summary>(.*?)<\/summary>(.*)$/;
const FENCE = /^\s*(```|~~~)/;

const revealKind = (title: string) => {
  if (/solution|answer/i.test(title)) return 'solution';
  if (/hint/i.test(title)) return 'hint';
  return 'reveal';
};

/**
 * Rewrites HTML <details><summary>…</summary>…</details> blocks (raw HTML isn't rendered)
 * into the reveal-block syntax above, so collapsible answers in authored notes work and
 * look like every other hint and solution. Handles the single-line form and the
 * multi-line form whose body may contain fenced code.
 */
export const htmlDetailsToReveals = (markdown: string): string => {
  if (!markdown.includes('<details')) return markdown;
  const out: string[] = [];
  let inFence = false;
  let inDetails = false;
  // Notes may be checked out with CRLF endings (git autocrlf on Windows); match per line without the \r.
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const isFence = FENCE.test(line);
    if (inDetails) {
      if (isFence) inFence = !inFence;
      if (!inFence && line.includes('</details>')) {
        const before = line.slice(0, line.indexOf('</details>'));
        if (before.trim()) out.push(before);
        out.push('````');
        inDetails = false;
      } else {
        out.push(line);
      }
      continue;
    }
    if (isFence) inFence = !inFence;
    const open = inFence ? null : line.match(DETAILS_OPEN);
    if (!open) {
      out.push(line);
      continue;
    }
    const title = open[1].replace(/"/g, "'").trim() || 'Details';
    let rest = open[2];
    const closesHere = rest.includes('</details>');
    if (closesHere) rest = rest.slice(0, rest.indexOf('</details>'));
    out.push('````' + revealKind(title) + ' title="' + title + '"');
    if (rest.trim()) out.push(rest.trim());
    if (closesHere) out.push('````');
    else inDetails = true;
  }
  if (inDetails) out.push('````');   // unterminated block: close it rather than swallow the page
  return out.join('\n');
};

const MarkdownBody: React.FC<{ markdown: string }> = ({ markdown }) => {
  const { basePath } = useContext(MarkdownEnvContext);
  // Parsing is the expensive part; context consumers inside still update.
  const rendered = useMemo(
    () => (
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSlug, rehypeCallouts]}
        components={COMPONENTS}
        urlTransform={makeUrlTransform(basePath)}
      >
        {htmlDetailsToReveals(markdown)}
      </ReactMarkdown>
    ),
    [markdown, basePath],
  );
  return (
    <div className="prose prose-invert prose-slate max-w-none prose-headings:font-bold prose-headings:scroll-mt-24 prose-h1:text-3xl prose-h1:mt-16 prose-h1:mb-6 prose-h1:pb-3 prose-h1:border-b prose-h1:border-sky-500/30 prose-h2:text-2xl prose-h2:mt-12 prose-h2:pb-2 prose-h2:border-b prose-h2:border-slate-800 prose-h3:text-lg prose-p:leading-7 prose-p:text-slate-300 prose-li:text-slate-300 prose-strong:text-slate-100 prose-a:text-sky-400 prose-a:no-underline hover:prose-a:underline prose-code:text-sky-300 prose-code:bg-slate-800/70 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:font-normal prose-code:[overflow-wrap:anywhere] prose-code:before:content-none prose-code:after:content-none prose-th:text-slate-200 prose-th:px-3 prose-td:px-3 prose-td:text-slate-300 prose-thead:bg-slate-900/80 prose-hr:border-slate-800">
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
