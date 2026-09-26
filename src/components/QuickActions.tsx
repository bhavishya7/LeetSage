import React from 'react';
import type { ActionType, ProgressState } from '../types';

interface QuickActionsProps {
  progress: ProgressState | null;
  disabled: boolean;
  isLoading: boolean;
  onAction: (actionType: ActionType) => void;
}

interface Chip { type: ActionType; label: string; icon: string; title: string; }

// The four surviving actions — an equal-weight 2x2 grid, always visible. Each is
// a distinct, high-value coaching intent with no real overlap: get unstuck
// (Hint), review my code (Analyze), learn the optimal (Understand), save a
// study note (Report). The five overlapping "understand the problem" actions
// (Break down / Concept / Pattern / Complexity / Examples) were dereferenced
// from the UI in the action-streamlining spec — their capabilities are kept in
// the code for the upcoming chat-intent-routing feature to dispatch to.
const ACTIONS: Chip[] = [
  { type: 'GET_HINT', label: 'Hint', icon: '💡', title: 'Progressive hint (3 levels)' },
  { type: 'CHECK_APPROACH', label: 'Analyze my code', icon: '🔬', title: 'Analyze your current code — Approach, Efficiency, Code Style' },
  { type: 'UNDERSTAND_SOLUTION', label: 'Understand solution', icon: '🧠', title: 'Understand the optimal solution — analogy, key insight, why it works, complexity (uses your code only as light context)' },
  { type: 'GENERATE_REPORT', label: 'Generate report', icon: '📝', title: 'Generate a study-note / progress report for this problem to save to your notes' },
];

const QuickActions: React.FC<QuickActionsProps> = ({ progress, disabled, isLoading, onAction }) => {
  const used = progress?.usedActions ?? new Set<ActionType>();
  const hintsExhausted = (progress?.hintLevel ?? 0) >= 3;

  const renderChip = (chip: Chip) => {
    const isUsed = used.has(chip.type);
    const chipDisabled = disabled || isLoading || (chip.type === 'GET_HINT' && hintsExhausted);
    // All four actions carry equal weight, so they share one uniform style —
    // no context-aware emphasis. Equal-width grid cells keep the row aligned
    // and scannable (recognition over recall).
    return (
      <button
        key={chip.type}
        onClick={() => onAction(chip.type)}
        disabled={chipDisabled}
        title={chip.title}
        className={`inline-flex items-center justify-start gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border shadow-sm transition-colors
          ${chipDisabled
            ? 'opacity-40 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-400'
            : 'bg-white dark:bg-neutral-700 border-neutral-300 dark:border-neutral-500 text-neutral-700 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-600 hover:border-blue-400 dark:hover:border-blue-400 cursor-pointer'}
        `}
      >
        <span className="shrink-0">{chip.icon}</span>
        <span className="truncate">{chip.label}</span>
        {isUsed && <span className="ml-auto shrink-0 text-green-500 dark:text-green-400 text-[10px]">✓</span>}
      </button>
    );
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {ACTIONS.map(renderChip)}
    </div>
  );
};

export default QuickActions;
