
import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { LEARNING_TOPICS } from '../constants';
import { LEARNING_CONTENT } from '../content/learning';

interface LearningPageProps {
  slug: string;
}

const LearningPage: React.FC<LearningPageProps> = ({ slug }) => {
  const topic = LEARNING_TOPICS.find((t) => t.slug === slug);
  const content = LEARNING_CONTENT[slug];

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [slug]);

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-lg border-b border-slate-800 py-4">
        <div className="max-w-4xl mx-auto px-6 flex items-center justify-between">
          <a href="#currently-working" className="text-sm font-medium text-slate-300 hover:text-white transition-colors flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to site
          </a>
          <a href="#" className="text-lg font-bold tracking-tighter hover:opacity-80 transition-opacity">
            KESHAV<span className="text-sky-500">.DEV</span>
          </a>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex flex-wrap gap-2 mb-10">
          {LEARNING_TOPICS.map((t) => (
            <a
              key={t.slug}
              href={`#learning/${t.slug}`}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                t.slug === slug
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-800 text-slate-300 border border-slate-700 hover:border-sky-500/50 hover:text-white'
              }`}
            >
              {t.icon} {t.title}
            </a>
          ))}
        </div>

        {topic && content ? (
          <article className="prose prose-invert prose-sky max-w-none prose-headings:font-bold prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-code:text-sky-300 prose-a:text-sky-400">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
          </article>
        ) : (
          <div className="text-center py-24">
            <h1 className="text-2xl font-bold mb-4">Topic not found</h1>
            <a href="#currently-working" className="text-sky-400 hover:underline">Go back to the site</a>
          </div>
        )}
      </div>
    </div>
  );
};

export default LearningPage;
