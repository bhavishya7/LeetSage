import React, { useState, useEffect, useCallback } from 'react';
import QuickActions from '../components/QuickActions';
import ContentDisplay from '../components/ContentDisplay';
import SettingsModal from '../components/SettingsModal';
import { StuckTimer } from '../services/stuck-timer';
import type { ProblemContext, ProgressState, LearningContent, ActionType, UserSettings, StuckSuggestion } from '../types';
import { loadProgress, trackAction, appendContent, clearProgress } from '../services/progress-tracker';
import { getSettings, saveSettings } from '../services/storage';
import { streamLLMRequest } from '../services/llm-service';
import { filterResponse } from '../services/solution-filter';
import { checkRateLimit, recordRequest, getUsageToday } from '../services/rate-limiter';
import { extractCurrentCode } from '../services/code-extractor';

function generateId(): string { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }

/** Resolves the active tab's id if it's a LeetCode problem page, else null. */
function getActiveLeetCodeTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      resolve(tab?.id && tab.url?.includes('leetcode.com/problems/') ? tab.id : null);
    });
  });
}

function actionToContentType(actionType: ActionType): LearningContent['type'] {
  const map: Record<ActionType, LearningContent['type']> = {
    GET_HINT: 'HINT', GENERATE_EXAMPLES: 'EXAMPLES', BREAK_DOWN_PROBLEM: 'BREAKDOWN',
    EXPLAIN_CONCEPT: 'EXPLANATION', CHECK_APPROACH: 'FEEDBACK', TIME_COMPLEXITY_HINT: 'HINT', PATTERN_RECOGNITION: 'EXPLANATION',
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
  const [stuckSuggestion, setStuckSuggestion] = useState<StuckSuggestion | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const stuckTimerRef = React.useRef<StuckTimer | null>(null);

  // Applies a freshly obtained problem context to state + loads its progress.
  const applyProblem = useCallback((ctx: ProblemContext) => {
    setProblemContext(prev => {
      // Same problem (URL is normalized to /problems/{slug}/, so it's stable
      // across submissions/tab changes): keep the live in-memory content and
      // progress as-is. Re-extraction on submit must NOT wipe the session.
      if (prev && prev.url === ctx.url) return ctx;

      // Genuinely a different problem: reset transient content and load that
      // problem's saved progress/history.
      setLearningContent([]);
      loadProgress(ctx.url).then(p => { setProgress(p); if (p) setLearningContent(p.contentHistory); });
      return ctx;
    });
  }, []);

  // Pull problem data directly from the active tab's content script.
  // This is the reliable path — the panel asks when it's ready, avoiding
  // the MV3 race where the background worker is asleep at page-load time.
  //
  // Retries with backoff: on a fresh page load the content script may not be
  // injected yet, or its initial extraction may still be running, so a single
  // request can come back empty. We retry a few times over a few seconds.
  const pullFromActiveTab = useCallback((attempt = 0) => {
    const MAX_ATTEMPTS = 6;
    const DELAY_MS = 700;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id || !tab.url?.includes('leetcode.com/problems/')) return;
      const tabId = tab.id;

      const ask = () => chrome.tabs.sendMessage(tabId, { type: 'REQUEST_PROBLEM_DATA' }, (response) => {
        const lastError = chrome.runtime.lastError;
        const notReady = lastError || !response?.success || !response?.data;
        if (!notReady) { applyProblem(response!.data as ProblemContext); return; }

        // "Could not establish connection. Receiving end does not exist."
        // means no content script is running on this tab — this happens on
        // tabs that were already open before the extension was (re)loaded,
        // since Chrome only auto-injects on fresh page loads. Inject it
        // manually once, then retry the message.
        const noReceiver = !!lastError?.message?.includes('Receiving end does not exist');
        if (noReceiver && attempt === 0) {
          chrome.scripting.executeScript(
            { target: { tabId }, files: ['content.js'] },
            () => { setTimeout(() => pullFromActiveTab(1), 300); }
          );
          return;
        }

        if (attempt < MAX_ATTEMPTS) {
          setTimeout(() => pullFromActiveTab(attempt + 1), DELAY_MS);
        }
      });

      ask();
    });
  }, [applyProblem]);

  useEffect(() => {
    // 1) Fast path: show whatever is cached in storage immediately.
    chrome.storage.local.get('problemData', (result) => {
      if (result.problemData) applyProblem(result.problemData as ProblemContext);
    });

    // 2) Reliable path: actively pull the current problem from the tab.
    pullFromActiveTab();

    // 3) Keep in sync when the user switches tabs or navigates.
    const onActivated = () => pullFromActiveTab();
    const onUpdated = (_tabId: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
      if (info.status === 'complete' && tab.active) pullFromActiveTab();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);

    // 4) Still honor storage changes (push path) as a bonus.
    const storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes.problemData?.newValue) applyProblem(changes.problemData.newValue as ProblemContext);
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.storage.onChanged.removeListener(storageListener);
    };
  }, [applyProblem, pullFromActiveTab]);

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      stuckTimerRef.current = new StuckTimer((suggestion) => setStuckSuggestion(suggestion), s.enableStuckTimer);
    });
    getUsageToday().then(u => setUsageCount(u.count));
  }, []);

  useEffect(() => {
    if (problemContext) stuckTimerRef.current?.start(problemContext.difficulty);
  }, [problemContext?.url]);

  const handleActionClick = useCallback(async (actionType: ActionType, userApproach?: string) => {
    if (!problemContext || !settings?.apiConfig.apiKey) return;

    // Guardrail pre-check: kill switch, daily/per-minute caps, cooldown.
    const check = await checkRateLimit(settings.guardrails);
    if (!check.allowed) {
      const wait = check.retryAfterMs ? ` (try again in ${Math.ceil(check.retryAfterMs / 1000)}s)` : '';
      setError((check.reason ?? 'Request blocked by rate limits.') + wait);
      return;
    }

    // For Check Approach: read the user's current editor code first so the
    // analysis is grounded in what they've actually written.
    let userCode: string | undefined;
    let codeLanguage: string | undefined;
    if (actionType === 'CHECK_APPROACH') {
      const tabId = await getActiveLeetCodeTabId();
      if (tabId != null) {
        const extracted = await extractCurrentCode(tabId);
        if (extracted) { userCode = extracted.code; codeLanguage = extracted.language; }
      }
    }

    setIsLoading(true); setError(null);
    const contentId = generateId();
    setStreamingId(contentId);
    const newContent: LearningContent = {
      id: contentId, type: actionToContentType(actionType), actionType, content: '', timestamp: Date.now(), expanded: true,
      metadata: actionType === 'GET_HINT' ? { hintLevel: (progress?.hintLevel ?? 0) + 1 } : undefined,
    };
    setLearningContent(prev => [...prev, newContent]);
    try {
      // Record the request against today's usage (counts toward the caps).
      const usage = await recordRequest();
      setUsageCount(usage.count);

      let fullContent = '';
      for await (const chunk of streamLLMRequest({
        problemContext, actionType, systemPrompt: '', userMessage: '',
        apiKey: settings.apiConfig.apiKey, model: settings.apiConfig.model,
        maxTokens: settings.guardrails.maxTokens, timeoutMs: settings.guardrails.requestTimeoutMs,
        previousHintLevel: progress?.hintLevel ?? 0, userApproach, userCode, codeLanguage,
      })) {
        fullContent += chunk;
        setLearningContent(prev => prev.map(c => c.id === contentId ? { ...c, content: fullContent } : c));
      }
      const { filteredContent } = filterResponse(fullContent, actionType);
      const finalContent: LearningContent = { ...newContent, content: filteredContent };
      setLearningContent(prev => prev.map(c => c.id === contentId ? finalContent : c));
      const updatedProgress = await trackAction(problemContext.url, actionType);
      setProgress(updatedProgress);
      await appendContent(problemContext.url, finalContent);
      stuckTimerRef.current?.start(problemContext.difficulty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLearningContent(prev => prev.filter(c => c.id !== contentId));
    } finally { setIsLoading(false); setStreamingId(null); }
  }, [problemContext, settings, progress]);

  // Free-form question: adds a user bubble, then streams a coaching answer.
  const handleChatSubmit = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q || !problemContext || !settings?.apiConfig.apiKey) return;

    const check = await checkRateLimit(settings.guardrails);
    if (!check.allowed) {
      const wait = check.retryAfterMs ? ` (try again in ${Math.ceil(check.retryAfterMs / 1000)}s)` : '';
      setError((check.reason ?? 'Request blocked by rate limits.') + wait);
      return;
    }

    // User bubble
    const userMsg: LearningContent = {
      id: generateId(), type: 'CHAT_MESSAGE', actionType: 'CHECK_APPROACH', content: q,
      timestamp: Date.now(), expanded: true, metadata: { isUserQuery: true },
    };
    // Assistant response card
    const respId = generateId();
    const respMsg: LearningContent = {
      id: respId, type: 'CHAT_MESSAGE', actionType: 'EXPLAIN_CONCEPT', content: '',
      timestamp: Date.now(), expanded: true,
    };
    setLearningContent(prev => [...prev, userMsg, respMsg]);
    setIsLoading(true); setError(null); setStreamingId(respId);

    try {
      const usage = await recordRequest();
      setUsageCount(usage.count);

      let full = '';
      for await (const chunk of streamLLMRequest({
        problemContext, actionType: 'EXPLAIN_CONCEPT', systemPrompt: '', userMessage: '',
        apiKey: settings.apiConfig.apiKey, model: settings.apiConfig.model,
        maxTokens: settings.guardrails.maxTokens, timeoutMs: settings.guardrails.requestTimeoutMs,
        userQuery: q,
      })) {
        full += chunk;
        setLearningContent(prev => prev.map(c => c.id === respId ? { ...c, content: full } : c));
      }
      const { filteredContent } = filterResponse(full, 'EXPLAIN_CONCEPT');
      const finalResp = { ...respMsg, content: filteredContent };
      setLearningContent(prev => prev.map(c => c.id === respId ? finalResp : c));
      await appendContent(problemContext.url, userMsg);
      await appendContent(problemContext.url, finalResp);
      stuckTimerRef.current?.start(problemContext.difficulty);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLearningContent(prev => prev.filter(c => c.id !== respId));
    } finally { setIsLoading(false); setStreamingId(null); }
  }, [problemContext, settings]);

  const handleReset = useCallback(async () => {
    if (!problemContext) return;
    await clearProgress(problemContext.url);
    setProgress(null); setLearningContent([]);
  }, [problemContext]);

  const handleSettingsSave = useCallback((newSettings: UserSettings) => { setSettings(newSettings); setShowSettings(false); }, []);
  const apiKeyConfigured = Boolean(settings?.apiConfig.apiKey);

  // Manual light/dark toggle (defaults to dark). Persists to settings.
  const isDark = settings ? settings.theme !== 'light' : true;
  const toggleTheme = useCallback(async () => {
    if (!settings) return;
    const next: UserSettings = { ...settings, theme: isDark ? 'light' : 'dark' };
    setSettings(next);
    await saveSettings(next);
  }, [settings, isDark]);

  const difficultyColor: Record<string, string> = {
    Easy: 'text-green-500', Medium: 'text-yellow-500', Hard: 'text-red-500',
  };

  const canInteract = apiKeyConfigured && !!problemContext && !isLoading;

  const submitChat = () => {
    if (!chatInput.trim()) return;
    handleChatSubmit(chatInput);
    setChatInput('');
  };

  return (
    <div className={`${isDark ? 'dark' : ''} flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-orange-500">LeetSage</span>
        </div>
        <div className="flex items-center gap-3">
          {settings && (
            <span className="text-[11px] text-neutral-400" title={`AI requests used today (limit ${settings.guardrails.maxRequestsPerDay})`}>
              {usageCount}/{settings.guardrails.maxRequestsPerDay}
            </span>
          )}
          <button onClick={toggleTheme} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" aria-label="Toggle theme" title={isDark ? 'Switch to light' : 'Switch to dark'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setShowSettings(true)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" aria-label="Settings">⚙️</button>
        </div>
      </div>

      {/* Problem context bar */}
      {problemContext ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
          <span className="text-xs font-medium truncate">{problemContext.title}</span>
          <span className={`text-[11px] font-semibold shrink-0 ${difficultyColor[problemContext.difficulty] ?? 'text-neutral-400'}`}>
            {problemContext.difficulty}
          </span>
        </div>
      ) : (
        <div className="px-3 py-1.5 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shrink-0 text-[11px] text-neutral-400 italic">
          Open a LeetCode problem to get started
        </div>
      )}

      {/* API key prompt */}
      {!apiKeyConfigured && (
        <button onClick={() => setShowSettings(true)}
          className="mx-3 mt-2 text-xs text-center py-1.5 bg-orange-500/10 border border-orange-500/30 rounded text-orange-500 hover:bg-orange-500/20 transition-colors shrink-0">
          ⚠️ Add your free Gemini API key to get started →
        </button>
      )}

      {/* Conversation / content stream */}
      <ContentDisplay content={learningContent} isLoading={isLoading} streamingId={streamingId} />

      {/* Errors + stuck suggestion */}
      {error && (
        <div className="mx-3 mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs shrink-0">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {stuckSuggestion && (
        <div className="mx-3 mb-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs flex items-center justify-between shrink-0">
          <span className="text-blue-500">{stuckSuggestion.message}</span>
          <div className="flex gap-2 ml-2 shrink-0">
            <button onClick={() => { handleActionClick(stuckSuggestion.suggestedAction); setStuckSuggestion(null); }} className="text-blue-500 underline">Try it</button>
            <button onClick={() => setStuckSuggestion(null)} className="text-neutral-400">✕</button>
          </div>
        </div>
      )}

      {/* Bottom input bar: quick-command chips + free-form text input */}
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 space-y-2">
        <div className="flex items-center justify-between">
          <QuickActions progress={progress} disabled={!canInteract} isLoading={isLoading} onAction={handleActionClick} />
        </div>
        <div className="flex items-center gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
            disabled={!canInteract}
            placeholder={canInteract ? 'Ask a question…' : 'Configure your API key first'}
            className="flex-1 text-xs bg-neutral-100 dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-full px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:opacity-50"
          />
          <button
            onClick={submitChat}
            disabled={!canInteract || !chatInput.trim()}
            className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-40 transition-colors shrink-0"
          >
            Send
          </button>
        </div>
        {progress && learningContent.length > 0 && (
          <button onClick={handleReset} className="w-full text-[11px] text-neutral-400 hover:text-red-500 transition-colors text-center">
            Reset this problem
          </button>
        )}
      </div>

      {showSettings && <SettingsModal currentSettings={settings} onSave={handleSettingsSave} onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
