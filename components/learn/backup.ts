import { getNotebook, notebookActions, sanitizeNotebook } from './notebook';
import { getProgress, progressActions, sanitizeProgress } from './progress';
import { getInterviews, interviewActions, sanitizeInterviews } from './interviews';

// One backup file holds everything stored in this browser (progress, notebook and mock
// interviews, all sections), so a backup exported from any section restores in any other.

/** Downloads progress and notebook as a dated JSON file. */
export const downloadBackup = () => {
  const data = { app: 'keshav.dev learning notebook', version: 1, exportedAt: new Date().toISOString(), progress: getProgress(), notebook: getNotebook(), interviews: getInterviews() };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `learning-notebook-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Replaces progress and notebook with a backup file's contents, after asking the learner. */
export const restoreBackup = async (file: File): Promise<'restored' | 'cancelled' | 'invalid'> => {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const record = parsed as { progress?: unknown; notebook?: unknown; interviews?: unknown };
    if (typeof parsed !== 'object' || parsed === null || (!record.progress && !record.notebook)) return 'invalid';
    if (!window.confirm('Replace your current progress and notebook in this browser with the backup?')) return 'cancelled';
    if (record.progress) progressActions.replace(sanitizeProgress(record.progress));
    if (record.notebook) notebookActions.replace(sanitizeNotebook(record.notebook));
    // Backups made before mock interviews existed don't have this part; keep what is stored then.
    if (record.interviews) interviewActions.replace(sanitizeInterviews(record.interviews));
    return 'restored';
  } catch {
    return 'invalid';
  }
};
