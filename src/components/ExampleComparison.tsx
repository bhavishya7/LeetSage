/**
 * Example Comparison Component
 *
 * Shows original problem examples alongside AI-generated examples
 * in a side-by-side layout to highlight patterns and differences.
 */

import React from 'react';
import type { Example } from '../types';

interface ExampleComparisonProps {
  originalExamples: Example[];
}

const ExampleComparison: React.FC<ExampleComparisonProps> = ({ originalExamples }) => {
  if (originalExamples.length === 0) return null;

  return (
    <div className="mt-2">
      <p className="text-[11px] font-medium text-gray-500 mb-1">Original Examples (for reference)</p>
      <div className="space-y-1">
        {originalExamples.map((ex, i) => (
          <div key={i} className="bg-gray-50 border border-gray-200 rounded p-2 text-xs font-mono">
            <span className="text-gray-500">Input: </span><span className="text-gray-800">{ex.input}</span>
            <br />
            <span className="text-gray-500">Output: </span><span className="text-gray-800">{ex.output}</span>
            {ex.explanation && (
              <>
                <br />
                <span className="text-gray-500">Explanation: </span>
                <span className="text-gray-600 font-sans">{ex.explanation}</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExampleComparison;
