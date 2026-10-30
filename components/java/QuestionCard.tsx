import React, { useEffect, useRef, useState } from 'react';
import { Level, Track } from '../../content/shared/types';
import { findLesson } from '../../content/shared/curriculum';
import { InterviewQuestion, QUESTION_KINDS, topicTitle } from '../../content/java/interview';
import MarkdownContent from '../learn/MarkdownContent';
import { isSaved, itemKey, notebookActions, SelfRating, useNotebook } from '../learn/notebook';
import { lessonHref } from '../learn/routes';
import { BookmarkIcon, CheckCircleIcon, Chip, ChevronIcon, FlagIcon, ToggleChip, focusRing } from '../learn/ui';

const LEVEL_TEXT: Record<Level, string> = { beginner: 'Basic', intermediate: 'Intermediate', advanced: 'Advanced' };
const LEVEL_CLASSES: Record<Level, string> = {
  beginner: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  intermediate: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  advanced: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

export const QuestionLevel: React.FC<{ level: Level }> = ({ level }) => (
  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded-md border ${LEVEL_CLASSES[level]}`}>{LEVEL_TEXT[level]}</span>
);

export const kindLabel = (kind: string) => QUESTION_KINDS.find((k) => k.id === kind)?.label ?? kind;

const RATINGS: { id: SelfRating; label: string; classes: string }[] = [
  { id: 'got-it', label: 'Got it', classes: 'bg-emerald-500/15 border-emerald-500/50 text-emerald-200' },
  { id: 'partial', label: 'Partially', classes: 'bg-amber-500/15 border-amber-500/50 text-amber-200' },
  { id: 'missed', label: 'Missed it', classes: 'bg-rose-500/15 border-rose-500/50 text-rose-200' },
];

export const RATING_LABEL: Record<SelfRating, string> = { 'got-it': 'Got it', partial: 'Partially', missed: 'Missed' };

const DRAFT_DELAY_MS = 500;

/** The full, interactive question: attempt, progressive hints, answer, rating and flags. */
const QuestionBody: React.FC<{ track: Track; question: InterviewQuestion }> = ({ track, question }) => {
  const notebook = useNotebook();
  const k = itemKey(track.id, question.id);
  const status = notebook.questions[k] ?? {};
  const [draft, setDraft] = useState(status.draft ?? '');
  const [revealed, setRevealed] = useState(Boolean(status.revealedAt));
  const hintsShown = Math.min(status.hints ?? 0, question.hints.length);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const answerRef = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const bookmarked = isSaved(notebook, 'question', track.id, question.id);
  const revise = Boolean(notebook.revise[k]);
  const lessons = question.lessons.map((slug) => findLesson(track, slug)?.lesson).filter((l): l is NonNullable<typeof l> => Boolean(l));
  const draftId = `answer-${question.id}`;

  const onDraft = (value: string) => {
    setDraft(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => notebookActions.updateQuestion(track.id, question.id, { draft: value }), DRAFT_DELAY_MS);
  };

  const reveal = () => {
    setRevealed(true);
    clearTimeout(timer.current);
    notebookActions.updateQuestion(track.id, question.id, { draft, revealedAt: status.revealedAt ?? Date.now() });
    requestAnimationFrame(() => answerRef.current?.focus());
  };

  return (
    <div className="space-y-5">
      {question.body && <MarkdownContent markdown={question.body} basePath={track.basePath} javaVersion={track.javaVersion} />}

      <div>
        <label htmlFor={draftId} className="block text-sm font-semibold text-slate-200 mb-1.5">
          Your answer
        </label>
        <p className="text-xs text-slate-500 mb-2">Answer out loud or in writing before revealing. Your draft is saved in this browser.</p>
        <textarea
          id={draftId}
          value={draft}
          onChange={(e) => onDraft(e.target.value)}
          rows={4}
          placeholder="Explain it as you would to an interviewer: definition, how it works, trade-offs, an example…"
          className="w-full rounded-lg bg-slate-950/60 border border-slate-700 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {question.hints.length > 0 && (
        <div className="space-y-2">
          {question.hints.slice(0, hintsShown).map((hint, i) => (
            <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/[0.04] px-4 py-3 text-sm text-slate-200">
              <p className="text-xs font-semibold text-amber-300 mb-1">
                Hint {i + 1} of {question.hints.length}
              </p>
              <MarkdownContent markdown={hint} basePath={track.basePath} />
            </div>
          ))}
          {hintsShown < question.hints.length && (
            <button
              type="button"
              onClick={() => notebookActions.updateQuestion(track.id, question.id, { hints: hintsShown + 1 })}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-3 py-1.5 text-sm font-semibold text-amber-200 hover:bg-amber-500/10 ${focusRing}`}
            >
              💡 Show hint {hintsShown + 1} of {question.hints.length}
            </button>
          )}
        </div>
      )}

      {!revealed ? (
        <button
          type="button"
          onClick={reveal}
          className={`inline-flex items-center gap-2 rounded-xl bg-sky-500 hover:bg-sky-400 px-4 py-2.5 text-sm font-semibold text-white ${focusRing}`}
        >
          Reveal the answer
        </button>
      ) : (
        <div ref={answerRef} tabIndex={-1} className="space-y-5 focus:outline-none">
          <section aria-label="Answer" className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.03] px-4 sm:px-5 py-4">
            <h4 className="text-sm font-semibold text-emerald-300 mb-2">Answer</h4>
            <MarkdownContent markdown={question.answer} basePath={track.basePath} javaVersion={track.javaVersion} />
          </section>
          {question.whyNot && (
            <section aria-label="Why other answers fall short" className="rounded-xl border border-slate-700 bg-slate-900/40 px-4 sm:px-5 py-4">
              <h4 className="text-sm font-semibold text-slate-200 mb-2">Why other answers fall short</h4>
              <MarkdownContent markdown={question.whyNot} basePath={track.basePath} />
            </section>
          )}
          {question.followUp && (
            <details className="group rounded-xl border border-violet-500/30 bg-violet-500/[0.03]">
              <summary className={`flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-violet-200 [&::-webkit-details-marker]:hidden ${focusRing}`}>
                <span>🎯 Follow-up question</span>
                <span className="text-xs font-medium text-slate-400 group-open:hidden">Click to reveal</span>
                <span className="text-xs font-medium text-slate-400 hidden group-open:inline">Hide</span>
              </summary>
              <div className="px-4 sm:px-5 pb-4 border-t border-slate-800/80 pt-4">
                <MarkdownContent markdown={question.followUp} basePath={track.basePath} javaVersion={track.javaVersion} />
              </div>
            </details>
          )}

          <div role="group" aria-label="How did you do?" className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-300 mr-1">How did you do?</span>
            {RATINGS.map((r) => (
              <button
                key={r.id}
                type="button"
                aria-pressed={status.rating === r.id}
                onClick={() => notebookActions.rateQuestion(track.id, question.id, r.id)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${focusRing} ${
                  status.rating === r.id ? r.classes : 'border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
            {status.rating === 'missed' && <span className="text-xs text-amber-300">Added to your revision list.</span>}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
        <ToggleChip
          pressed={bookmarked}
          onClick={() =>
            notebookActions.toggleSaved({
              kind: 'question',
              track: track.id,
              ref: question.id,
              title: question.title,
              context: topicTitle(question.topic),
              topic: question.topic,
            })
          }
          icon={<BookmarkIcon filled={bookmarked} className="h-3.5 w-3.5" />}
          label="Bookmark"
          pressedLabel="Bookmarked"
        />
        <ToggleChip
          pressed={revise}
          onClick={() => notebookActions.toggleRevise(track.id, question.id)}
          icon={<FlagIcon filled={revise} className="h-3.5 w-3.5" />}
          label="Mark for revision"
          pressedLabel="On revision list"
          tone="amber"
        />
        {lessons.length > 0 && (
          <span className="text-xs text-slate-500 ml-auto">
            Learn it:{' '}
            {lessons.map((l, i) => (
              <React.Fragment key={l.slug}>
                {i > 0 && ', '}
                <a href={lessonHref(track, l.slug)} className="text-sky-400 hover:underline">
                  {l.title}
                </a>
              </React.Fragment>
            ))}
          </span>
        )}
      </div>
    </div>
  );
};

/** A collapsible question row; expands into the interactive card. */
const QuestionCard: React.FC<{ track: Track; question: InterviewQuestion; defaultOpen?: boolean; showTopic?: boolean }> = ({
  track,
  question,
  defaultOpen = false,
  showTopic = true,
}) => {
  const notebook = useNotebook();
  const [open, setOpen] = useState(defaultOpen);
  const k = itemKey(track.id, question.id);
  const status = notebook.questions[k];
  const bookmarked = isSaved(notebook, 'question', track.id, question.id);
  const revise = Boolean(notebook.revise[k]);
  const panelId = `question-${question.id}`;
  const attempted = Boolean(status?.revealedAt || status?.draft?.trim());

  return (
    <article id={`q-${question.id}`} className="rounded-xl border border-slate-700/80 bg-slate-800/40 scroll-mt-32">
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className={`w-full flex items-start gap-3 rounded-xl px-4 py-3.5 text-left hover:bg-slate-800/60 transition-colors ${focusRing}`}
        >
          <CheckCircleIcon
            filled={status?.rating === 'got-it'}
            className={`h-5 w-5 mt-0.5 flex-shrink-0 ${
              status?.rating === 'got-it' ? 'text-emerald-400' : status?.rating === 'missed' ? 'text-rose-400' : status?.rating === 'partial' ? 'text-amber-400' : attempted ? 'text-sky-400' : 'text-slate-600'
            }`}
          />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-slate-100 leading-snug">
              <MarkdownInline text={question.title} />
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-1.5">
              <QuestionLevel level={question.level} />
              <Chip>{kindLabel(question.kind)}</Chip>
              {showTopic && <Chip>{topicTitle(question.topic)}</Chip>}
              {question.tricky && <Chip className="!bg-violet-500/10 !text-violet-300 !border-violet-500/30">Tricky</Chip>}
              {status?.rating && <span className="text-xs text-slate-400">· {RATING_LABEL[status.rating]}</span>}
              {!status?.rating && attempted && <span className="text-xs text-slate-400">· Attempted</span>}
              {bookmarked && <BookmarkIcon filled className="h-3.5 w-3.5 text-sky-300" />}
              {revise && <FlagIcon filled className="h-3.5 w-3.5 text-amber-300" />}
              <span className="sr-only">
                {bookmarked ? ' bookmarked' : ''}
                {revise ? ' marked for revision' : ''}
              </span>
            </span>
          </span>
          <ChevronIcon direction={open ? 'down' : 'right'} className="h-5 w-5 mt-0.5 text-slate-500 flex-shrink-0" />
        </button>
      </h3>
      {open && (
        <div id={panelId} className="px-4 sm:px-5 pb-5 pt-1">
          <QuestionBody track={track} question={question} />
        </div>
      )}
    </article>
  );
};

/** Renders inline code in titles without a full markdown pass. */
const MarkdownInline: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(`[^`]+`)/g).map((part, i) =>
      part.startsWith('`') && part.endsWith('`') ? (
        <code key={i} className="font-mono text-[0.9em] text-sky-300 bg-slate-900/80 px-1 py-0.5 rounded">
          {part.slice(1, -1)}
        </code>
      ) : (
        <React.Fragment key={i}>{part}</React.Fragment>
      ),
    )}
  </>
);

export { MarkdownInline };
export default QuestionCard;
