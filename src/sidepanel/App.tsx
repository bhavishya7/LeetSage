/**
 * Main App Component — Side Panel
 *
 * This is the root of the React app that runs in Chrome's side panel.
 * It manages global state and coordinates between all child components.
 *
 * State management approach:
 * - We use React's built-in useState/useEffect (no Redux needed for this scale)
 * - Problem context comes from Chrome Storage (written by content script)
 * - Progress is loaded from Chrome Storage on mount and updated on actions
 * - LLM responses are streamed and appended to learningContent array
 */

import React, { useState, useEffect, useCallback } from 'react';
import ActionPanel from '../components/ActionPanel';
import ContentDisplay from '../components/ContentDisplay';
import SettingsModal from '../components/SettingsModal';
import type {
  ProblemContext,
  ProgressState,
  LearningContent,
  ActionType,
  UserSettings,
} from '../types';
import { loadProgress, trackAction, appendContent, clearProgress } from '../services/progress-tracker';
import { getSettings } from '../services/storage';
import { streamLLMRequest } from '../services/llm-service';
import { filterResponse } from '../services/solution-filter';
import { generateHint } from '../services/hint-system';
import { StuckTimer } from '../services/stuck-timer';
import ChatMode from '../components/ChatMode';
import type { StuckSuggestion } from '../types';

/** Generates a unique ID for content items */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Maps ActionType to ContentType */
function actionToContentType(actionType: ActionType): LearningContent['type'] {
  const map: Record<ActionType, LearningContent['type']> = {
    GET_HINT: 'HINT',
    GENERATE_EXAMPLES: 'EXAMPLES',
    BREAK_DOWN_PROBLEM: 'BREAKDOWN',
    EXPLAIN_CONCEPT: 'EXPLANATION',
    CHECK_APPROACH: 'FEEDBACK',
    TIME_COMPLEXITY_HINT: 'HINT',
    PATTERN_RECOGNITION: 'EXPLANATION',
  };
  return map[actionType];
}

const App: React.FC = () => {
  const [problemContext, setProblemContext] = useState<ProblemContext | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [learningContent, setLearningContent] = useState<LearningContent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [stuckSuggestion, setStuckSuggestion] = useState<StuckSuggestion | null>(null);
  const stuckTimerRef = React.useRef<StuckTimer | null>(null);

  // Load problem context from Chrome Storage on mount
  useEffect(() => {
    chrome.storage.local.get('problemData', (result) => {
      if (result.problemData) {
        const ctx = result.problemData as ProblemContext;
        setProblemContext(ctx);
        loadProgress(ctx.url).then(p => {
          setProgress(p);
          if (p) setLearningContent(p.contentHistory);
        });
      }
    });

    // Listen for problem data updates from content script
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.problemData?.newValue) {
        const ctx = changes.problemData.newValue as ProblemContext;
        setProblemContext(ctx);
        setLearningContent([]);
        loadProgress(ctx.url).then(p => {
          setProgress(p);
          if (p) setLearningContent(p.contentHistory);
        });
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Load user settings
  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      stuckTimerRef.current = new StuckTimer(
        (suggestion) => setStuckSuggestion(suggestion),
        s.enableStuckTimer
      );
    });
  }, []);

  // Start stuck timer when problem loads
  useEffect(() => {
    if (problemContext) {
      stuckTimerRef.current?.start(problemContext.difficulty);
    }
  }, [problemContext?.url]);

  const handleActionClick = useCallback(async (actionType: ActionType, userApproach?: string) => {
    if (!problemContext || !settings?.apiConfig.apiKey) return;

    setIsLoading(true);
    setError(null);

    const contentId = generateId();
    setStreamingId(contentId);

    // Optimistically add a loading content item
    const newContent: LearningContent = {
      id: contentId,
      type: actionToContentType(actionType),
      actionType,
      content: '',
      timestamp: Date.now(),
      expanded: true,
      metadata: actionType === 'GET_HINT'
        ? { hintLevel: (progress?.hintLevel ?? 0) + 1 }
        : undefined,
    };

    setLearningContent(prev => [...prev, newContent]);

    try {
      let fullContent = '';

      // Stream the response
      for await (const chunk of streamLLMRequest({
        problemContext,
        actionType,
        systemPrompt: '',
        userMessage: '',
        apiKey: settings.apiConfig.apiKey,
        previousHintLevel: progress?.hintLevel ?? 0,
        userApproach,
      })) {
        fullContent += chunk;
        setLearningContent(prev =>
          prev.map(c => c.id === contentId ? { ...c, content: fullContent } : c)
        );
      }

      // Filter the completed response
      const { filteredContent } = filterResponse(fullContent, actionType);

      const finalContent: LearningContent = { ...newContent, content: filteredContent };

      setLearningContent(prev =>
        prev.map(c => c.id === contentId ? finalContent : c)
      );

      // Track action and persist
      const updatedProgress = await trackAction(problemContext.url, actionType);
      setProgress(updatedProgress);
      await appendContent(problemContext.url, finalContent);
      // Reset stuck timer on action
      stuckTimerRef.current?.start(problemContext.difficulty);

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setError(message);
      // Remove the failed content item
      setLearningContent(prev => prev.filter(c => c.id !== contentId));
    } finally {
      setIsLoading(false);
      setStreamingId(null);
    }
  }, [problemContext, settings, progress]);

  const handleReset = useCallback(async () => {
    if (!problemContext) return;
    await clearProgress(problemContext.url);
    setProgress(null);
    setLearningContent([]);
  }, [problemContext]);

  const handleSettingsSave = useCallback((newSettings: UserSettings) => {
    setSettings(newSettings);
    setShowSettings(false);
  }, []);

  const apiKeyConfigured = Boolean(settings?.apiConfig.apiKey);

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-orange-500">LeetSage</span>
          <span className="text-xs text-gray-400">AI Learning Companion</span>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Settings"
        >
          ⚙️
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-col flex-1 overflow-hidden">
        <ActionPanel
          problemContext={problemContext}
          progress={progress}
          apiKeyConfigured={apiKeyConfigured}
          isLoading={isLoading}
          onActionClick={handleActionClick}
          onReset={handleReset}
          onOpenSettings={() => setShowSettings(true)}
        />

        {error && (
          <div className="mx-3 mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
          </div>
        )}

        {stuckSuggestion && (
          <div className="mx-3 mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs flex items-center justify-between">
            <span className="text-blue-700">{stuckSuggestion.message}</span>
            <div className="flex gap-2 ml-2 shrink-0">
              <button
                onClick={() => { handleActionClick(stuckSuggestion.suggestedAction); setStuckSuggestion(null); }}
                className="text-blue-600 underline"
              >Try it</button>
              <button onClick={() => setStuckSuggestion(null)} className="text-gray-400">✕</button>
            </div>
          </div>
        )}

        {showChat && settings?.apiConfig.apiKey ? (
          <ChatMode
            problemContext={problemContext}
            apiKey={settings.apiConfig.apiKey}
            onClose={() => setShowChat(false)}
          />
        ) : (
          <ContentDisplay
            content={learningContent}
            isLoading={isLoading}
            streamingId={streamingId}
          />
        )}

        {!showChat && (
          <div className="shrink-0 px-3 pb-2">
            <button
              onClick={() => setShowChat(true)}
              disabled={!apiKeyConfigured || !problemContext}
              className="w-full text-xs text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-30"
            >
              💬 Open free-form chat
            </button>
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsModal
          currentSettings={settings}
          onSave={handleSettingsSave}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
};

export default App;
