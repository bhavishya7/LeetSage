import React from 'react';
import type { ActionType, ProgressState } from '../types';

interface QuickActionsProps {
  progress: ProgressState | null;
  disabled: boolean;
  isLoading: boolean;
  onAction: (actionType: ActionType) => void;
}

interface Chip { type: ActionType; label: string; icon: string; title: string; }

const CHIPS: Chip[] = [
  { type: 'GET_HINT', label: 'Hint', icon: '💡', title: 'Progressive hint (3 levels)' },
  { type: 'GENERATE_EXAMPLES', label: 'Examples', icon: '🔢', title: 'Generate alternative test cases' },
  { type: 'BREAK_DOWN_PROBLEM', label: 'Break down', icon: '🧩', title: 'Decompose into sub-problems' },
  { type: 'EXPLAIN_CONCEPT', label: 'Concept', icon: '📚', title: 'Explain a relevant concept' },
  { type: 'TIME_COMPLEXITY_HINT', label: 'Complexity', icon: '⏱️', title: 'Hint at optimal complexity' },
  { type: 'PATTERN_RECOGNITION', label: 'Pattern', icon: '🔍', title: 'Identify the algorithmic pattern' },
  { type: 'CHECK_APPROACH', label: 'Analyze my code', icon: '🔬', title: 'Analyze your current editor code — Approach, Efficiency, Code Style' },
];

/**
 * Compact horizontal row of quick-command chips. This is the "action" half of
 * the chat-hybrid UI — one tap fires a coaching action without typing.
 */
const QuickActions: React.FC<QuickActionsProps> = ({ progress, disabled, isLoading, onAction }) => {
  const used = progress?.usedActions ?? new Set<ActionType>();
  const hintsExhausted = (progress?.hintLevel ?? 0) >= 3;

  return (
    <div className="flex flex-wrap gap-1.5">
      {CHIPS.map(chip => {
        const isUsed = used.has(chip.type);
        const chipDisabled = disabled || isLoading || (chip.type === 'GET_HINT' && hintsExhausted);
        return (
          <button
            key={chip.type}
            onClick={() => onAction(chip.type)}
            disabled={chipDisabled}
            title={chip.title}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] border transition-colors
              ${chipDisabled
                ? 'opacity-40 cursor-not-allowed border-neutral-700 text-neutral-500'
                : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500 cursor-pointer'}
            `}
          >
            <span>{chip.icon}</span>
            <span>{chip.label}</span>
            {isUsed && <span className="text-green-400 text-[10px]">✓</span>}
          </button>
        );
      })}
    </div>
  );
};

export default QuickActions;
