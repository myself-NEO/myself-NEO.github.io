import React, { useEffect, useMemo, useRef, useState } from 'react';
import { tokenizeJava, TOKEN_CLASSES } from './javaHighlight';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

const LANGUAGE_LABEL: Record<string, string> = {
  java: 'Java',
  text: 'Diagram',
  txt: 'Text',
  bash: 'Shell',
  sh: 'Shell',
  json: 'JSON',
  xml: 'XML',
};

const copyText = async (text: string) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Fallback for browsers/contexts without the async clipboard API.
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!ok) throw new Error('Copy failed');
};

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language, title }) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const source = code.replace(/\n$/, '');
  const lang = language?.toLowerCase();

  const content = useMemo(() => {
    if (lang !== 'java') return source;
    return tokenizeJava(source).map((token, i) =>
      token.type === 'plain' ? token.text : (
        <span key={i} className={TOKEN_CLASSES[token.type]}>
          {token.text}
        </span>
      ),
    );
  }, [source, lang]);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const onCopy = async () => {
    try {
      await copyText(source);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState('idle'), 2000);
  };

  const label = title ?? (lang ? LANGUAGE_LABEL[lang] ?? lang : 'Code');

  return (
    <div className="not-prose my-6 rounded-xl border border-slate-700/80 bg-slate-950/70 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-slate-800 bg-slate-900/80">
        <span className="text-xs font-mono text-slate-400 truncate">{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white px-2 py-1 rounded-md hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label={copyState === 'copied' ? 'Code copied' : 'Copy code'}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M7 3.5A1.5 1.5 0 018.5 2h3.879a1.5 1.5 0 011.06.44l3.122 3.12A1.5 1.5 0 0117 6.622V12.5a1.5 1.5 0 01-1.5 1.5h-1v-3.379a3 3 0 00-.879-2.121L10.5 5.379A3 3 0 008.379 4.5H7v-1z" />
            <path d="M4.5 6A1.5 1.5 0 003 7.5v9A1.5 1.5 0 004.5 18h7a1.5 1.5 0 001.5-1.5v-5.879a1.5 1.5 0 00-.44-1.06L9.44 6.439A1.5 1.5 0 008.378 6H4.5z" />
          </svg>
          <span aria-live="polite">{copyState === 'copied' ? 'Copied!' : copyState === 'failed' ? 'Copy failed' : 'Copy'}</span>
        </button>
      </div>
      <pre className="overflow-x-auto p-4 text-[13px] leading-relaxed text-slate-200 font-mono" tabIndex={0}>
        <code>{content}</code>
      </pre>
    </div>
  );
};

export default CodeBlock;
