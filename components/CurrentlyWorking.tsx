
import React, { useEffect, useRef, useState } from 'react';
import { LEARNING_TOPICS } from '../constants';

interface CodeforcesContest {
  id: number;
  name: string;
  startTimeSeconds: number;
  durationSeconds: number;
}

const formatIST = (date: Date) =>
  date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }) + ' IST';

const formatDuration = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// LeetCode Weekly Contest: every Sunday, 02:30 UTC (08:00 IST)
const getNextWeeklyContest = (): Date => {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(2, 30, 0, 0);
  let daysToAdd = (7 - next.getUTCDay()) % 7;
  if (daysToAdd === 0 && next.getTime() <= now.getTime()) daysToAdd = 7;
  next.setUTCDate(next.getUTCDate() + daysToAdd);
  return next;
};

// LeetCode Biweekly Contest: every other Saturday, 14:30 UTC (20:00 IST)
// Anchored to Biweekly Contest 190 (confirmed for 2026-08-29)
const BIWEEKLY_ANCHOR_MS = Date.UTC(2026, 7, 29, 14, 30, 0);
const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

const getNextBiweeklyContest = (): Date => {
  const now = Date.now();
  let next = BIWEEKLY_ANCHOR_MS;
  if (next < now) {
    next += Math.ceil((now - next) / TWO_WEEKS_MS) * TWO_WEEKS_MS;
  }
  return new Date(next);
};

// CodeChef Starters: every Wednesday, 14:30 UTC (20:00 IST)
const getNextCodeChefContest = (): Date => {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(14, 30, 0, 0);
  const WEDNESDAY = 3;
  let daysToAdd = (WEDNESDAY - next.getUTCDay() + 7) % 7;
  if (daysToAdd === 0 && next.getTime() <= now.getTime()) daysToAdd = 7;
  next.setUTCDate(next.getUTCDate() + daysToAdd);
  return next;
};

const CurrentlyWorking: React.FC = () => {
  const [cfContests, setCfContests] = useState<CodeforcesContest[] | null>(null);
  const [cfError, setCfError] = useState(false);
  const [isLearningOpen, setIsLearningOpen] = useState(false);
  const learningRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (learningRef.current && !learningRef.current.contains(event.target as Node)) {
        setIsLearningOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    fetch('https://codeforces.com/api/contest.list?gym=false')
      .then((res) => res.json())
      .then((data) => {
        if (data.status !== 'OK') throw new Error('Unexpected response');
        const upcoming: CodeforcesContest[] = data.result
          .filter((c: any) => c.phase === 'BEFORE')
          .sort((a: CodeforcesContest, b: CodeforcesContest) => a.startTimeSeconds - b.startTimeSeconds)
          .slice(0, 3);
        setCfContests(upcoming);
      })
      .catch(() => setCfError(true));
  }, []);

  const nextWeekly = getNextWeeklyContest();
  const nextBiweekly = getNextBiweeklyContest();
  const nextCodeChef = getNextCodeChefContest();

  return (
    <section id="currently-working" className="py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Currently <span className="text-sky-500">Working On</span></h2>
          <div className="w-20 h-1.5 bg-sky-500 mx-auto rounded-full mb-6"></div>
          <p className="text-slate-400 max-w-2xl mx-auto text-lg">
            A snapshot of what's occupying my nights and weekends right now.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 items-start">
          <div className="flex flex-col gap-8">
          {/* Project Card */}
          <div className="p-8 bg-slate-800 border border-slate-700 rounded-3xl shadow-xl hover:border-sky-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">🎯</span>
              <h3 className="text-2xl font-bold">neoLevelUp</h3>
            </div>
            <p className="text-slate-400 leading-relaxed mb-6">
              A 3-tier architectured skill-tracking app to help engineers prepare for interviews and manage
              learning milestones and time, built with Angular, Java Spring Boot, and MySQL. Building the app to be more scalable and reliable.
            </p>
            <div className="flex flex-wrap gap-2 mb-8">
              {['GCP', 'Angular', 'Java', 'Spring Boot', 'OAuth2', 'MySQL', 'Claude Code', 'Scalable', 'Latency Optimised'].map((tech) => (
                <span key={tech} className="px-3 py-1 bg-sky-500/10 text-sky-400 text-xs font-bold rounded-full">
                  {tech}
                </span>
              ))}
            </div>
            <a
              href="https://neolevelup.vercel.app"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-sky-500/20"
            >
              Visit neoLevelUp
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </a>
          </div>

          {/* Learning Card */}
          <div className="p-8 bg-slate-800 border border-slate-700 rounded-3xl shadow-xl hover:border-sky-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">📘</span>
              <h3 className="text-2xl font-bold">Learning</h3>
            </div>
            <p className="text-slate-400 leading-relaxed mb-6">
              Compiling & deep-diving into DSA & Desiging System with low latency High Throughput, building strong fundamentals one topic at a time to help anyone looking for a guide.
            </p>
            <div className="relative inline-block" ref={learningRef}>
              <button
                onClick={() => setIsLearningOpen((open) => !open)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-sky-500/20"
              >
                Explore
                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isLearningOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isLearningOpen && (
                <div className="absolute left-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-20">
                  {LEARNING_TOPICS.map((topic) => (
                    <a
                      key={topic.slug}
                      href={`#learning/${topic.slug}`}
                      onClick={() => setIsLearningOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                    >
                      <span>{topic.icon}</span>
                      {topic.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          </div>
          </div>

          {/* Competitive Programming Card */}
          <div className="p-8 bg-slate-800 border border-slate-700 rounded-3xl shadow-xl hover:border-sky-500/30 transition-colors">
            <div className="flex items-center gap-3 mb-6">
              <span className="text-3xl">🏆</span>
              <h3 className="text-2xl font-bold">Competitive Programming</h3>
            </div>

            {/* LeetCode */}
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <a
                  href="https://leetcode.com/neokkj11/"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-slate-200 hover:text-sky-400 transition-colors flex items-center gap-2"
                >
                  LeetCode
                  <span className="text-slate-500 font-normal text-sm">@neokkj11</span>
                </a>
                <a href="https://leetcode.com/contest/" target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
                  All contests →
                </a>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Next Weekly Contest</p>
                    <p className="text-xs text-slate-500">{formatIST(nextWeekly)}</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded-full font-bold">Sun</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Next Biweekly Contest</p>
                    <p className="text-xs text-slate-500">{formatIST(nextBiweekly)}</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded-full font-bold">Sat</span>
                </div>
              </div>
            </div>

            {/* Codeforces */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <a
                  href="https://codeforces.com/profile/iNEO"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-slate-200 hover:text-sky-400 transition-colors flex items-center gap-2"
                >
                  Codeforces
                  <span className="text-slate-500 font-normal text-sm">@iNEO</span>
                </a>
                <a href="https://codeforces.com/contests" target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
                  All contests →
                </a>
              </div>
              <div className="space-y-2">
                {cfError && (
                  <p className="text-sm text-slate-500 p-3">
                    Couldn't load live contest data — check the{' '}
                    <a href="https://codeforces.com/contests" target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">
                      contests page
                    </a>{' '}
                    directly.
                  </p>
                )}
                {!cfError && cfContests === null && (
                  <p className="text-sm text-slate-500 p-3">Loading upcoming contests…</p>
                )}
                {!cfError && cfContests && cfContests.length === 0 && (
                  <p className="text-sm text-slate-500 p-3">No upcoming contests scheduled right now.</p>
                )}
                {cfContests?.map((contest) => (
                  <a
                    key={contest.id}
                    href={`https://codeforces.com/contestRegistration/${contest.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-xl hover:border-sky-500/50 transition-colors group"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-200 truncate group-hover:text-sky-400 transition-colors">
                        {contest.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatIST(new Date(contest.startTimeSeconds * 1000))} · {formatDuration(contest.durationSeconds)}
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 group-hover:text-sky-400 transition-colors flex-shrink-0 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>
                ))}
              </div>
            </div>

            {/* CodeChef */}
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <a
                  href="https://www.codechef.com/users/neo_11"
                  target="_blank"
                  rel="noreferrer"
                  className="font-bold text-slate-200 hover:text-sky-400 transition-colors flex items-center gap-2"
                >
                  CodeChef
                  <span className="text-slate-500 font-normal text-sm">@neo_11</span>
                </a>
                <a href="https://www.codechef.com/contests" target="_blank" rel="noreferrer" className="text-xs text-sky-400 hover:underline">
                  All contests →
                </a>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-700 rounded-xl">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">Next Starters Contest</p>
                    <p className="text-xs text-slate-500">{formatIST(nextCodeChef)}</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-sky-500/10 text-sky-400 rounded-full font-bold">Wed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CurrentlyWorking;
