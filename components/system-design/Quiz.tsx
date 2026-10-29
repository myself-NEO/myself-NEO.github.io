import React, { useEffect, useId, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { CheckCircleIcon } from './ui';

// Quiz block format (one or more questions):
//
//   ? Which principle is violated?
//   - A wrong option
//   + The correct option
//   - Another wrong option
//   > Explanation shown once the question is answered correctly.

interface QuizQuestion {
  prompt: string;
  options: { text: string; correct: boolean }[];
  explanation: string;
}

export const parseQuiz = (source: string): QuizQuestion[] => {
  const questions: QuizQuestion[] = [];
  let current: QuizQuestion | null = null;
  for (const raw of source.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('? ')) {
      current = { prompt: line.slice(2), options: [], explanation: '' };
      questions.push(current);
    } else if (current && (line.startsWith('- ') || line.startsWith('+ '))) {
      current.options.push({ text: line.slice(2), correct: line.startsWith('+') });
    } else if (current && line.startsWith('>')) {
      current.explanation = `${current.explanation} ${line.slice(1).trim()}`.trim();
    }
  }
  return questions.filter((q) => q.options.some((o) => o.correct));
};

const Inline: React.FC<{ text: string }> = ({ text }) => (
  <ReactMarkdown
    components={{
      p: ({ children }) => <>{children}</>,
      code: ({ children }) => <code className="font-mono text-[0.9em] text-sky-300 bg-slate-800/80 px-1 py-0.5 rounded">{children}</code>,
    }}
  >
    {text}
  </ReactMarkdown>
);

const Question: React.FC<{
  question: QuizQuestion;
  index: number;
  selected: number | undefined;
  revealed: boolean;
  onSelect: (option: number) => void;
  onReveal: () => void;
}> = ({ question, index, selected, revealed, onSelect, onReveal }) => {
  const name = useId();
  const answeredCorrectly = selected !== undefined && question.options[selected].correct;
  const showAnswer = answeredCorrectly || revealed;

  return (
    <div className="rounded-xl border border-slate-700/80 bg-slate-900/50 p-4 sm:p-5">
      <fieldset className="min-w-0 m-0 p-0 border-0">
        <legend className="font-semibold text-slate-100 mb-3">
          <span className="text-sky-400 mr-2">Q{index + 1}.</span>
          <Inline text={question.prompt} />
        </legend>
        <div className="space-y-2">
          {question.options.map((option, i) => {
            const isSelected = selected === i;
            const state = showAnswer && option.correct ? 'correct' : isSelected && !option.correct ? 'wrong' : 'idle';
            const styles = {
              correct: 'border-emerald-500/60 bg-emerald-500/10',
              wrong: 'border-rose-500/60 bg-rose-500/10',
              idle: 'border-slate-700 hover:border-slate-500 bg-slate-950/40',
            }[state];
            return (
              <label
                key={i}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm text-slate-200 cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500 ${styles} ${
                  answeredCorrectly ? 'cursor-default' : ''
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  className="mt-0.5 accent-sky-500"
                  checked={isSelected}
                  disabled={answeredCorrectly}
                  onChange={() => onSelect(i)}
                />
                <span className="flex-1">
                  <Inline text={option.text} />
                </span>
                {state === 'correct' && <span className="text-emerald-400 text-xs font-semibold">Correct</span>}
                {state === 'wrong' && <span className="text-rose-400 text-xs font-semibold">Not quite</span>}
              </label>
            );
          })}
        </div>

        <div aria-live="polite">
          {selected !== undefined && !answeredCorrectly && !revealed && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-rose-300">Not quite — try another option.</span>
              <button type="button" onClick={onReveal} className="text-slate-400 hover:text-white underline underline-offset-2">
                Show answer
              </button>
            </div>
          )}
          {showAnswer && question.explanation && (
            <p className="mt-3 text-sm text-slate-300 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-2">
              <span className="font-semibold text-emerald-300">Why: </span>
              <Inline text={question.explanation} />
            </p>
          )}
        </div>
      </fieldset>
    </div>
  );
};

interface QuizProps {
  source: string;
  /** Called once every question has been answered correctly. */
  onPassed?: () => void;
  alreadyPassed?: boolean;
}

const Quiz: React.FC<QuizProps> = ({ source, onPassed, alreadyPassed }) => {
  const questions = useMemo(() => parseQuiz(source), [source]);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  const correctCount = questions.filter((q, i) => selected[i] !== undefined && q.options[selected[i]].correct).length;
  const allCorrect = questions.length > 0 && correctCount === questions.length;

  useEffect(() => {
    if (allCorrect) onPassed?.();
  }, [allCorrect, onPassed]);

  if (questions.length === 0) return null;

  return (
    <section className="not-prose my-6 space-y-4" aria-label="Knowledge check">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-400">
          {correctCount} / {questions.length} answered correctly
        </span>
        {(allCorrect || alreadyPassed) && (
          <span className="inline-flex items-center gap-1.5 text-emerald-300 font-semibold">
            <CheckCircleIcon filled className="h-4 w-4" />
            Knowledge check passed
          </span>
        )}
      </div>
      {questions.map((q, i) => (
        <Question
          key={i}
          question={q}
          index={i}
          selected={selected[i]}
          revealed={Boolean(revealed[i])}
          onSelect={(option) => setSelected((s) => ({ ...s, [i]: option }))}
          onReveal={() => setRevealed((r) => ({ ...r, [i]: true }))}
        />
      ))}
      {Object.keys(selected).length > 0 && (
        <button
          type="button"
          onClick={() => {
            setSelected({});
            setRevealed({});
          }}
          className="text-xs text-slate-400 hover:text-white underline underline-offset-2"
        >
          Reset answers
        </button>
      )}
    </section>
  );
};

export default Quiz;
