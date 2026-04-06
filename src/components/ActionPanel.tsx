import React from 'react';
import type { ProblemContext, ProgressState, ActionType } from '../types';

interface ActionPanelProps {
  problemContext: ProblemContext | null;
  progress: ProgressState | null;
  apiKeyConfigured: boolean;
  isLoading: boolean;
  onActionClick: (actionType: ActionType, userApproach?: string) => void;
  onReset: () => void;
  onOpenSettings: () => void;
}

interface ActionConfig { type: ActionType; label: string; icon: string; description: string; color: string; }

const ACTIONS: ActionConfig[] = [
  { type: 'GET_HINT', label: 'Get Hint', icon: '💡', description: 'Progressive hint (3 levels)', color: 'bg-yellow-50 hover:bg-yellow-100 border-yellow-200' },
  { type: 'GENERATE_EXAMPLES', label: 'New Examples', icon: '🔢', description: 'Generate alternative test cases', color: 'bg-blue-50 hover:bg-blue-100 border-blue-200' },
  { type: 'BREAK_DOWN_PROBLEM', label: 'Break It Down', icon: '🧩', description: 'Decompose into sub-problems', color: 'bg-purple-50 hover:bg-purple-100 border-purple-200' },
  { type: 'EXPLAIN_CONCEPT', label: 'Explain Concept', icon: '📚', description: 'Explain relevant algorithms', color: 'bg-green-50 hover:bg-green-100 border-green-200' },
  { type: 'TIME_COMPLEXITY_HINT', label: 'Complexity Hint', icon: '⏱️', description: 'Hint about optimal complexity', color: 'bg-orange-50 hover:bg-orange-100 border-orange-200' },
  { type: 'PATTERN_RECOGNITION', label: 'Find Pattern', icon: '🔍', description: 'Identify algorithmic patterns', color: 'bg-pink-50 hover:bg-pink-100 border-pink-200' },
  { type: 'CHECK_APPROACH', label: 'Check Approach', icon: '✅', description: 'Review your proposed solution', color: 'bg-teal-50 hover:bg-teal-100 border-teal-200' },
];

const DIFFICULTY_COLORS: Record<string, string> = { Easy: 'bg-green-100 text-green-700', Medium: 'bg-yellow-100 text-yellow-700', Hard: 'bg-red-100 text-red-700' };

const ActionPanel: React.FC<ActionPanelProps> = ({ problemContext, progress, apiKeyConfigured, isLoading, onActionClick, onReset, onOpenSettings }) => {
  const [approachInput, setApproachInput] = React.useState('');
  const [showApproachInput, setShowApproachInput] = React.useState(false);
  const usedActions = progress?.usedActions ?? new Set<ActionType>();
  const hintLevel = progress?.hintLevel ?? 0;
  const hintsExhausted = hintLevel >= 3;

  const handleClick = (action: ActionConfig) => {
    if (action.type === 'CHECK_APPROACH') { setShowApproachInput(v => !v); return; }
    onActionClick(action.type);
  };
  const handleApproachSubmit = () => {
    if (!approachInput.trim()) return;
    onActionClick('CHECK_APPROACH', approachInput.trim());
    setApproachInput(''); setShowApproachInput(false);
  };

  return (
    <div className="shrink-0 bg-white border-b border-gray-200 px-3 py-3">
      {problemContext ? (
        <div className="mb-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-gray-800 leading-tight text-xs">{problemContext.title}</p>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_COLORS[problemContext.difficulty] ?? 'bg-gray-100 text-gray-600'}`}>{problemContext.difficulty}</span>
          </div>
        </div>
      ) : (
        <div className="mb-3 text-xs text-gray-400 italic">Navigate to a LeetCode problem to get started.</div>
      )}
      {!apiKeyConfigured && (
        <button onClick={onOpenSettings} className="w-full mb-3 text-xs text-center py-1.5 bg-orange-50 border border-orange-200 rounded text-orange-700 hover:bg-orange-100 transition-colors">
          ⚠️ Configure your API key to get started →
        </button>
      )}
      {hintLevel > 0 && (
        <div className="mb-2 flex items-center gap-1 text-xs text-gray-500">
          <span>Hints used:</span>
          {[1, 2, 3].map(l => (
            <span key={l} className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${l <= hintLevel ? 'bg-yellow-400 text-white' : 'bg-gray-200 text-gray-400'}`}>{l}</span>
          ))}
          {hintsExhausted && <span className="text-yellow-600 ml-1">All hints used</span>}
        </div>
      )}
      <div className="grid grid-cols-2 gap-1.5">
        {ACTIONS.map(action => {
          const isUsed = usedActions.has(action.type);
          const isDisabled = isLoading || !apiKeyConfigured || !problemContext || (action.type === 'GET_HINT' && hintsExhausted);
          return (
            <button key={action.type} onClick={() => handleClick(action)} disabled={isDisabled} title={action.description} aria-label={action.label}
              className={`relative flex items-center gap-1.5 px-2 py-2 rounded border text-left transition-all ${action.color} ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
              <span className="text-base leading-none">{action.icon}</span>
              <span className="text-xs font-medium text-gray-700 leading-tight">{action.label}</span>
              {isUsed && <span className="absolute top-1 right-1 text-[10px] text-green-500" aria-label="Used">✓</span>}
            </button>
          );
        })}
      </div>
      {showApproachInput && (
        <div className="mt-2">
          <textarea value={approachInput} onChange={e => setApproachInput(e.target.value)}
            placeholder="Describe your approach..." className="w-full text-xs border border-gray-300 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-teal-400" rows={3} />
          <div className="flex gap-2 mt-1">
            <button onClick={handleApproachSubmit} disabled={!approachInput.trim() || isLoading}
              className="flex-1 text-xs py-1 bg-teal-500 text-white rounded hover:bg-teal-600 disabled:opacity-40 transition-colors">Submit Approach</button>
            <button onClick={() => setShowApproachInput(false)} className="text-xs px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition-colors">Cancel</button>
          </div>
        </div>
      )}
      {progress && (usedActions.size > 0 || (progress.contentHistory?.length ?? 0) > 0) && (
        <button onClick={onReset} className="mt-2 w-full text-xs text-gray-400 hover:text-red-500 transition-colors text-center">Reset progress for this problem</button>
      )}
    </div>
  );
};

export default ActionPanel;
