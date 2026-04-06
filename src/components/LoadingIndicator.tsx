/**
 * Loading Indicator Component
 * Animated skeleton screen shown while AI content is generating.
 */

import React from 'react';

const LoadingIndicator: React.FC = () => (
  <div className="px-3 py-3 space-y-2 animate-pulse" aria-label="Loading content" aria-live="polite">
    <div className="h-3 bg-gray-200 rounded w-3/4" />
    <div className="h-3 bg-gray-200 rounded w-full" />
    <div className="h-3 bg-gray-200 rounded w-5/6" />
    <div className="h-3 bg-gray-200 rounded w-2/3" />
  </div>
);

export default LoadingIndicator;
