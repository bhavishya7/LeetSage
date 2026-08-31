import React, { useState } from 'react';
import type { ActionType, ProgressState } from '../types';

interface QuickActionsProps {
  progress: ProgressState | null;
  disabled: boolean;
  isLoading: boolean;
  /** True when the editor has code — used to surface code-aware actions first. */
  hasCode: boolean;
  onAction: (actionType: ActionType) => void;
}

interface Chip { type: ActionType; label: string; icon: string; title: string; }

// Primary actions — always visible. The four most-reached-for coaching modes.
const PRIMARY: Chip[] = [
  { type: 'GET_HINT', label: 'Hint', icon: '💡', title: 'Progressive hint (3 levels)' },
  { type: 'BREAK_DOWN_PROBLEM', label: 'Break down', icon: '🧩', title: 'Decompose into sub-problems' },
  { type: 'CHECK_APPROACH', label: 'Analyze my code', icon: '🔬', title: 'Analyze your current code — Approach, Efficiency, Code Style' },
  { type: 'UNDERSTAND_SOLUTION', label: 'Understand solution', icon: '🧠', title: 'Understand why your solution works — analogy, key insight, why it works, complexity' },
];

// Secondary actions — hidden behind "More" to reduce clutter.
const SECONDARY: Chip[] = [
  { type: 'GENERATE_EXAMPLES', label: 'Examples', icon: '🔢', title: 'Generate alternative test cases' },
  { type: 'EXPLAIN_CONCEPT', label: 'Concept', icon: '📚', title: 'Explain a relevant concept' },
  { type: 'TIME_COMPLEXITY_HINT', label: 'Complexity', icon: '⏱️', title: 'Hint at optimal complexity' },
  { type: 'PATTERN_RECOGNITION', label: 'Pattern', icon: '🔍', title: 'Identify the algorithmic pattern' },
];

// Actions that operate on the user's code — emphasized once code is present.
const CODE_ACTIONS = new Set<ActionType>(['CHECK_APPROACH', 'UNDERSTAND_SOLUTION']);

const QuickActions: React.FC<QuickActionsProps> = ({ progress, disabled, isLoading, hasCode, onAction }) => {
  const [showMore, setShowMore] = useState(false);
  const used = progress?.usedActions ?? new Set<ActionType>();
  const hintsExhausted = (progress?.hintLevel ?? 0) >= 3;

  // Context-aware ordering: when the user has code, surface the code-aware
  // actions (Analyze / Understand) to the front of the primary row.
  const primary = hasCode
    ? [...PRIMARY].sort((a, b) => Number(CODE_ACTIONS.has(b.type)) - Number(CODE_ACTIONS.has(a.type)))
    : PRIMARY;

  const renderChip = (chip: Chip, emphasized: boolean) => {
    const isUsed = used.has(chip.type);
    const chipDisabled = disabled || isLoading || (chip.type === 'GET_HINT' && hintsExhausted);
    // Emphasized (primary, and code-actions when code present) get a filled
    // accent; everything else is a lighter outline. This hierarchy is what
    // makes the row scannable instead of a wall of identical pills.
    const highlight = emphasized && CODE_ACTIONS.has(chip.type) && hasCode;
    return (
      <button
        key={chip.type}
        onClick={() => onAction(chip.type)}
        disabled={chipDisabled}
        title={chip.title}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shadow-sm transition-colors
          ${chipDisabled
            ? 'opacity-40 cursor-not-allowed bg-neutral-100 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-400'
            : highlight
              ? 'bg-blue-500/15 border-blue-500 text-blue-600 dark:text-blue-300 hover:bg-blue-500/25 cursor-pointer'
              : 'bg-white dark:bg-neutral-700 border-neutral-400 dark:border-neutral-500 text-neutral-700 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-600 cursor-pointer'}
        `}
      >
        <span>{chip.icon}</span>
        <span>{chip.label}</span>
        {isUsed && <span className="text-green-500 dark:text-green-400 text-[10px]">✓</span>}
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {primary.map(chip => renderChip(chip, true))}

      <button
        onClick={() => setShowMore(v => !v)}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-dashed border-neutral-400 dark:border-neutral-500 text-neutral-500 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
        title="More actions"
      >
        {showMore ? 'Less ▴' : 'More ▾'}
      </button>

      {showMore && SECONDARY.map(chip => renderChip(chip, false))}
    </div>
  );
};

export default QuickActions;
