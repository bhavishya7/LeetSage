import React, { useEffect, useState, useMemo } from 'react';
import type { ProblemIndexEntry, ProblemRecord } from '../types';
import { getProgressIndex, getRecord, deleteRecord } from '../services/progress-records';
import { computeInsights } from '../services/progress-analytics';
import type { ProgressInsights } from '../services/progress-analytics';

interface ProgressViewProps { onClose: () => void; }

const difficultyColor: Record<string, string> = {
  Easy: 'text-green-500', Medium: 'text-yellow-500', Hard: 'text-red-500',
};

function timeAgo(ms: number): string {
  const days = Math.floor((Date.now() - ms) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

const PatternChips: React.FC<{ patterns: string[] }> = ({ patterns }) => (
  <div className="flex flex-wrap gap-1">
    {patterns.map(p => (
      <span key={p} className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-300">{p}</span>
    ))}
  </div>
);

/** Minimum saved problems before insights are meaningful enough to show. */
const INSIGHTS_MIN_PROBLEMS = 3;

/**
 * The insights ("weakest link" + revisit) panel — reads from computeInsights.
 * Hidden until there are enough problems to say anything trustworthy; once
 * shown, it labels the confidence level explicitly so the user knows how much
 * to trust the ranking.
 */
const InsightsPanel: React.FC<{ insights: ProgressInsights }> = ({ insights }) => {
  if (insights.totalProblems < INSIGHTS_MIN_PROBLEMS) return null;
  const w = insights.weakestLink;
  const confidence = !w ? 'Low' : w.lowConfidence ? 'Low' : w.problemCount >= 6 ? 'High' : 'Medium';
  const confidenceColor =
    confidence === 'High' ? 'text-green-500' : confidence === 'Medium' ? 'text-yellow-500' : 'text-neutral-400';
  return (
    <div className="mb-3 p-2.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[12px] font-semibold">📊 Insights</div>
        <span className={`text-[10px] font-medium ${confidenceColor}`} title="How much to trust the weakest-link ranking, based on how many problems it's computed from">
          {confidence} confidence
        </span>
      </div>
      <div className="text-[11px] text-neutral-600 dark:text-neutral-300 space-y-1">
        <div>{insights.totalProblems} problems · {insights.totalAttempts} saved attempts</div>
        {w && (
          <div>
            <span className="font-medium">Weakest link:</span>{' '}
            <span className="text-orange-500">{w.pattern}</span>{' '}
            <span className="text-neutral-400">
              (based on {w.problemCount} problem{w.problemCount === 1 ? '' : 's'}; avg {w.avgHintsUsed.toFixed(1)} hints)
            </span>
          </div>
        )}
        {insights.revisit.length > 0 && (
          <div>
            <span className="font-medium">Worth revisiting:</span>{' '}
            {insights.revisit.slice(0, 5).map((r, i) => (
              <span key={r.slug} className="text-neutral-500">
                {i > 0 ? ', ' : ''}{r.title} <span className="text-neutral-400">({r.reason})</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** The detail view for a single record: notes + attempts timeline. */
const RecordDetail: React.FC<{ record: ProblemRecord; onBack: () => void; onDelete: () => void }> = ({ record, onBack, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try { await navigator.clipboard.writeText(record.notes); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <div>
      <button onClick={onBack} className="text-[11px] text-blue-500 hover:underline mb-2">← Back to list</button>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-semibold text-sm break-words">{record.title}</div>
        <span className={`text-[11px] font-bold shrink-0 ${difficultyColor[record.difficulty] ?? ''}`}>{record.difficulty}</span>
      </div>
      <PatternChips patterns={record.patterns} />
      <div className="text-[10px] text-neutral-400 mt-1">
        {record.attempts.length} attempt{record.attempts.length === 1 ? '' : 's'} · updated {timeAgo(record.lastUpdatedAt)}
      </div>

      <div className="mt-3 text-[12px] font-semibold">Attempts</div>
      <ol className="mt-1 space-y-1.5">
        {record.attempts.map((a, i) => (
          <li key={i} className={`text-[11px] p-2 rounded border ${i === record.bestAttemptIndex ? 'border-green-500/50 bg-green-500/5' : 'border-neutral-200 dark:border-neutral-700'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{a.outcome}{i === record.bestAttemptIndex ? ' · best' : ''}</span>
              <span className="text-neutral-400">{new Date(a.date).toLocaleDateString()}</span>
            </div>
            <div className="text-neutral-500 dark:text-neutral-400 break-words">{a.approachSummary}</div>
            <div className="text-neutral-400">
              {a.complexity.time} time / {a.complexity.space} space · {a.hintsUsed} hint{a.hintsUsed === 1 ? '' : 's'}{a.language ? ` · ${a.language}` : ''}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-[12px] font-semibold">Note</div>
        <div className="flex gap-2">
          <button onClick={handleCopy} className="text-[11px] text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200">{copied ? '✓ Copied' : '⧉ Copy'}</button>
          <button onClick={onDelete} className="text-[11px] text-red-500 hover:underline">Delete</button>
        </div>
      </div>
      <pre className="mt-1 text-[11px] whitespace-pre-wrap break-words bg-neutral-100 dark:bg-neutral-800 rounded p-2 max-h-48 overflow-y-auto">{record.notes || '(no note saved)'}</pre>
    </div>
  );
};

/** Concatenates every saved record's note into one Markdown document. */
function buildAllNotesMarkdown(records: ProblemRecord[]): string {
  return records
    .slice()
    .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt)
    .map(r => {
      const header = `# ${r.title} (${r.difficulty})`;
      const meta = `_Patterns: ${r.patterns.join(', ') || 'none'} · ${r.attempts.length} attempt${r.attempts.length === 1 ? '' : 's'}_`;
      return `${header}\n${meta}\n\n${r.notes || '(no note saved)'}`;
    })
    .join('\n\n---\n\n');
}

const ProgressView: React.FC<ProgressViewProps> = ({ onClose }) => {
  const [index, setIndex] = useState<ProblemIndexEntry[]>([]);
  const [records, setRecords] = useState<ProblemRecord[]>([]);
  const [selected, setSelected] = useState<ProblemRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedAll, setCopiedAll] = useState(false);

  useEffect(() => {
    (async () => {
      const idx = await getProgressIndex();
      idx.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
      setIndex(idx);
      // Load full records for analytics (small; ~1-2KB each). The list itself
      // only needs the index, but insights aggregate over records.
      const recs = (await Promise.all(idx.map(e => getRecord(e.slug)))).filter((r): r is ProblemRecord => !!r);
      setRecords(recs);
      setLoading(false);
    })();
  }, []);

  const insights = useMemo(() => computeInsights(records), [records]);

  const openRecord = async (slug: string) => {
    const r = await getRecord(slug);
    if (r) setSelected(r);
  };

  const handleDelete = async (slug: string) => {
    await deleteRecord(slug);
    setIndex(prev => prev.filter(e => e.slug !== slug));
    setRecords(prev => prev.filter(r => r.slug !== slug));
    setSelected(null);
  };

  const handleCopyAll = async () => {
    try {
      await navigator.clipboard.writeText(buildAllNotesMarkdown(records));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch { /* clipboard can fail if unfocused; ignore */ }
  };

  // Full-panel screen (not a modal): fills the whole side panel below the app
  // header, so it reads as a place you navigated to rather than a dialog
  // floating over faintly-visible content — which looked off in a narrow panel.
  return (
    <div className="flex-1 min-w-0 flex flex-col bg-neutral-50 dark:bg-neutral-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm">📈</span>
          <span className="text-sm font-semibold">My Progress</span>
          {!loading && index.length > 0 && (
            <span className="text-[11px] text-neutral-400 leading-none">({index.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          {!loading && !selected && index.length > 0 && (
            <button
              onClick={handleCopyAll}
              title="Copy all saved notes as one Markdown document"
              className={`text-[11px] transition-colors ${copiedAll ? 'text-green-600 dark:text-green-400' : 'text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}`}
            >
              {copiedAll ? '✓ Copied all' : '⧉ Copy all'}
            </button>
          )}
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200" aria-label="Close My Progress" title="Back to coaching">✕</button>
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto">
        {loading ? (
          <div className="text-center text-neutral-400 text-xs py-6">Loading…</div>
        ) : selected ? (
          <RecordDetail record={selected} onBack={() => setSelected(null)} onDelete={() => handleDelete(selected.slug)} />
        ) : index.length === 0 ? (
          <div className="text-center text-neutral-400 text-xs py-10 px-4">
            <div className="text-3xl mb-2">📈</div>
            <p>No saved progress yet.</p>
            <p className="mt-1">Generate a study report on a problem, then click <span className="font-medium">💾 Save to My Progress</span> to start building your record.</p>
          </div>
        ) : (
          <>
            <InsightsPanel insights={insights} />
            <div className="space-y-1.5">
              {index.map(e => (
                <button
                  key={e.slug}
                  onClick={() => openRecord(e.slug)}
                  className="w-full text-left p-2.5 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:border-blue-400 dark:hover:border-blue-500 transition-colors group"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium break-words">{e.title}</span>
                    <span className={`text-[10px] font-bold shrink-0 ${difficultyColor[e.difficulty] ?? ''}`}>{e.difficulty}</span>
                  </div>
                  <div className="mt-1"><PatternChips patterns={e.patterns} /></div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-neutral-400">
                      {e.attemptCount} attempt{e.attemptCount === 1 ? '' : 's'} · {timeAgo(e.lastUpdatedAt)}
                    </span>
                    <span className="text-[11px] text-neutral-300 dark:text-neutral-600 group-hover:text-blue-400 transition-colors">View →</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressView;
