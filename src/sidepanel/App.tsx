import React, { useState, useEffect, useCallback } from 'react';
import QuickActions from '../components/QuickActions';
import ContentDisplay from '../components/ContentDisplay';
import SettingsModal from '../components/SettingsModal';
import ProgressView from '../components/ProgressView';
import { StuckTimer } from '../services/stuck-timer';
import type { ProblemContext, ProgressState, LearningContent, ActionType, UserSettings, StuckSuggestion } from '../types';
import { loadProgress, trackAction, appendContent, clearProgress } from '../services/progress-tracker';
import { getSettings, saveSettings } from '../services/storage';
import { streamLLMRequest } from '../services/llm-service';
import { filterResponse, isSolutionExemptAction } from '../services/solution-filter';
import { checkRateLimit, recordRequest, getUsageToday } from '../services/rate-limiter';
import { recordMetric } from '../services/metrics-store';
import { extractCurrentCode } from '../services/code-extractor';
import { parseStructuredResponse, stripDataBlockForDisplay } from '../services/structured-parser';
import { buildSessionDigest, extractSessionFacts, buildRecordProjection } from '../services/session-digest';
import { saveAttempt, slugFromUrl } from '../services/progress-records';
import { routeMessage } from '../services/intent-router';
import ConfirmAffordance from '../components/ConfirmAffordance';
import { PLACEHOLDER_EXAMPLES, TRY_ASKING_CHIPS } from '../components/discovery-prompts';

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
    UNDERSTAND_SOLUTION: 'EXPLANATION', GENERATE_REPORT: 'EXPLANATION',
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
  const [showProgress, setShowProgress] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [stuckSuggestion, setStuckSuggestion] = useState<StuckSuggestion | null>(null);
  const [usageCount, setUsageCount] = useState(0);
  const [chatInput, setChatInput] = useState('');
  const [savedReportIds, setSavedReportIds] = useState<Set<string>>(new Set());
  // Chat intent routing: a pending confirm affordance (exempt guardrail OR the
  // borderline `ask` outcome). `query` is the original message so "Just answer"
  // can fall through to chat with it. See .kiro/specs/leetsage-chat-intent-routing.
  const [pendingConfirm, setPendingConfirm] = useState<{ action: ActionType; reason: 'exempt' | 'borderline'; query: string } | null>(null);
  // Discovery (R8): rotating-placeholder index + a dismissible "Try asking…" row.
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [showTryChips, setShowTryChips] = useState(true);
  // "Reset this problem" is destructive (wipes the session's history +
  // progress), so it's a two-step confirm rather than a one-tap action.
  const [confirmReset, setConfirmReset] = useState(false);
  const stuckTimerRef = React.useRef<StuckTimer | null>(null);

  // Always-fresh mirror of learningContent. handleActionClick is a useCallback
  // that does NOT list learningContent as a dependency (to avoid recreating it
  // on every streamed chunk), so the closure's learningContent goes stale.
  // buildSessionDigest for the report must read the CURRENT history, so we read
  // it through this ref instead of the captured variable.
  const learningContentRef = React.useRef<LearningContent[]>([]);
  useEffect(() => { learningContentRef.current = learningContent; }, [learningContent]);

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
    const onActivated = () => { pullFromActiveTab(); };
    const onUpdated = (_tabId: number, info: { status?: string }, tab: chrome.tabs.Tab) => {
      if (info.status === 'complete' && tab.active) { pullFromActiveTab(); }
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

    // Refresh the usage counter whenever the panel becomes visible again.
    // getUsageToday() keys on the current date, so this also clears a stale
    // count left over from a previous day (the daily reset).
    const onVisible = () => { if (!document.hidden) getUsageToday().then(u => setUsageCount(u.count)); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    if (problemContext) {
      stuckTimerRef.current?.start({
        difficulty: problemContext.difficulty,
        hintsExhausted: (progress?.hintLevel ?? 0) >= 3,
      });
    }
  }, [problemContext?.url, progress?.hintLevel]);

  // Discovery (R8): cycle the placeholder examples so users learn the intents
  // that lost their buttons. Purely presentational — no API call. Pauses while
  // the user is typing (a non-empty input keeps a static placeholder). A calm
  // 5s cadence so each suggestion is comfortably readable.
  useEffect(() => {
    if (chatInput.trim()) return;
    const id = setInterval(() => {
      setPlaceholderIdx(i => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 5000);
    return () => clearInterval(id);
  }, [chatInput]);

  const handleActionClick = useCallback(async (actionType: ActionType, userApproach?: string) => {
    if (!problemContext || !settings?.apiConfig.apiKey) return;

    // The user is interacting — dismiss any stale "are you stuck?" suggestion.
    setStuckSuggestion(null);

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
    if (actionType === 'CHECK_APPROACH' || actionType === 'UNDERSTAND_SOLUTION' || actionType === 'GENERATE_REPORT') {
      const tabId = await getActiveLeetCodeTabId();
      if (tabId != null) {
        const extracted = await extractCurrentCode(tabId);
        if (extracted) { userCode = extracted.code; codeLanguage = extracted.language; }
      }
    }

    // For the report, assemble a deterministic digest of the session's
    // structured activity so the report reflects what the user actually did
    // rather than a generic writeup (see session-digest.ts).
    const sessionDigest = actionType === 'GENERATE_REPORT'
      ? buildSessionDigest(learningContentRef.current, progress)
      : undefined;

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
      // B1 pre-display gate: for NON-EXEMPT actions the guardrail (filterResponse)
      // must run BEFORE any model content is shown, so a leak is never briefly
      // visible. We accumulate tokens in `fullContent` but do NOT render them
      // mid-stream; the card shows an animated "thinking" placeholder (driven by
      // an empty `content` + streamingId in ContentDisplay) until we commit the
      // filtered result below. EXEMPT actions (solutions allowed, filter bypassed)
      // keep streaming live for responsive UX.
      // See .kiro/specs/leetsage-guardrail-hardening (B1).
      const streamLive = isSolutionExemptAction(actionType);
      // Runtime metrics: wall-clock latency around the call + token usage if the
      // stream surfaces it. Recorded best-effort after the stream (see below).
      const startedAt = performance.now();
      let capturedUsage: { promptTokens: number; completionTokens: number } | undefined;
      for await (const chunk of streamLLMRequest({
        problemContext, actionType, systemPrompt: '', userMessage: '',
        apiKey: settings.apiConfig.apiKey, model: settings.apiConfig.model,
        maxTokens: settings.guardrails.maxTokens, timeoutMs: settings.guardrails.requestTimeoutMs,
        previousHintLevel: progress?.hintLevel ?? 0, userApproach, userCode, codeLanguage, sessionDigest,
        onUsage: (u) => { capturedUsage = u; },
      })) {
        fullContent += chunk;
        // Only exempt actions paint tokens as they arrive. For exempt structured
        // actions, hide the trailing data block while streaming so the raw JSON
        // never flashes in the card (§6.2: stream the prose, finalize the data
        // block once complete). Non-exempt actions render nothing here — the
        // placeholder holds until the filtered commit.
        if (streamLive) {
          const display = stripDataBlockForDisplay(fullContent, actionType);
          setLearningContent(prev => prev.map(c => c.id === contentId ? { ...c, content: display } : c));
        }
      }
      // Record runtime metrics (best-effort — never let a metrics write break the
      // response or the rate-limit accounting; design R7).
      void recordMetric({
        model: settings.apiConfig.model,
        latencyMs: performance.now() - startedAt,
        usage: capturedUsage,
      }).catch(() => { /* metrics are non-critical */ });
      // Split prose from the machine-readable data block, then filter the prose.
      // structured?.data (if any) is stored on metadata for the report/records/
      // analytics to consume — the prose is never re-parsed for facts (§2, §4).
      const { prose, data } = parseStructuredResponse(fullContent, actionType);
      const { filteredContent } = filterResponse(prose, actionType);
      const finalContent: LearningContent = {
        ...newContent,
        content: filteredContent,
        metadata: data
          ? { ...(newContent.metadata ?? {}), structured: data }
          : newContent.metadata,
      };
      setLearningContent(prev => prev.map(c => c.id === contentId ? finalContent : c));
      const updatedProgress = await trackAction(problemContext.url, actionType);
      setProgress(updatedProgress);
      await appendContent(problemContext.url, finalContent);
      stuckTimerRef.current?.start({ difficulty: problemContext.difficulty, hintsExhausted: updatedProgress.hintLevel >= 3 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLearningContent(prev => prev.filter(c => c.id !== contentId));
    } finally { setIsLoading(false); setStreamingId(null); }
  }, [problemContext, settings, progress]);

  // Free-form question: adds a user bubble, then streams a coaching answer.
  const handleChatSubmit = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q || !problemContext || !settings?.apiConfig.apiKey) return;

    // The user is interacting — dismiss any stale "are you stuck?" suggestion.
    setStuckSuggestion(null);

    const check = await checkRateLimit(settings.guardrails);
    if (!check.allowed) {
      const wait = check.retryAfterMs ? ` (try again in ${Math.ceil(check.retryAfterMs / 1000)}s)` : '';
      setError((check.reason ?? 'Request blocked by rate limits.') + wait);
      return;
    }

    // B4: free-form chat used to be blind to the editor, so "what is my code's
    // time complexity?" got "you didn't include your code". Read the current
    // editor code and send it along (when non-empty) so chat can answer about
    // the user's own work — like a tutor who can see their screen. Chat stays
    // NON-EXEMPT (filtered): the model may analyze/quote short pieces, but a
    // full-solution dump is still caught by filterResponse below.
    // See .kiro/specs/leetsage-guardrail-hardening (B4).
    let userCode: string | undefined;
    let codeLanguage: string | undefined;
    {
      const tabId = await getActiveLeetCodeTabId();
      if (tabId != null) {
        const extracted = await extractCurrentCode(tabId);
        if (extracted && extracted.code.trim().length > 0) {
          userCode = extracted.code;
          codeLanguage = extracted.language;
        }
      }
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
      const startedAt = performance.now();
      let capturedUsage: { promptTokens: number; completionTokens: number } | undefined;
      for await (const chunk of streamLLMRequest({
        problemContext, actionType: 'EXPLAIN_CONCEPT', systemPrompt: '', userMessage: '',
        apiKey: settings.apiConfig.apiKey, model: settings.apiConfig.model,
        maxTokens: settings.guardrails.maxTokens, timeoutMs: settings.guardrails.requestTimeoutMs,
        userQuery: q, userCode, codeLanguage,
        onUsage: (u) => { capturedUsage = u; },
      })) {
        full += chunk;
        // B1: free-form chat is a NON-EXEMPT path (routed through filterResponse
        // below), so its tokens are withheld mid-stream too — the card shows the
        // "Answering…" placeholder until the filtered reveal. We only accumulate
        // here. See .kiro/specs/leetsage-guardrail-hardening (B1, R2.4).
      }
      // Runtime metrics (best-effort; design R7).
      void recordMetric({
        model: settings.apiConfig.model,
        latencyMs: performance.now() - startedAt,
        usage: capturedUsage,
      }).catch(() => { /* metrics are non-critical */ });
      const { filteredContent } = filterResponse(full, 'EXPLAIN_CONCEPT');
      const finalResp = { ...respMsg, content: filteredContent };
      setLearningContent(prev => prev.map(c => c.id === respId ? finalResp : c));
      await appendContent(problemContext.url, userMsg);
      await appendContent(problemContext.url, finalResp);
      stuckTimerRef.current?.start({ difficulty: problemContext.difficulty, hintsExhausted: (progress?.hintLevel ?? 0) >= 3 });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setLearningContent(prev => prev.filter(c => c.id !== respId));
    } finally { setIsLoading(false); setStreamingId(null); }
  }, [problemContext, settings]);

  const handleReset = useCallback(async () => {
    if (!problemContext) return;
    await clearProgress(problemContext.url);
    setProgress(null); setLearningContent([]);
    setConfirmReset(false);
  }, [problemContext]);

  // Persist a generated report to "My Progress" as a ProblemRecord attempt.
  // The record's facts (patterns, complexity, approach) are projected from the
  // session's structured data — the same data the report itself was built from.
  const handleSaveToProgress = useCallback(async (item: LearningContent) => {
    if (!problemContext) return;
    try {
      const facts = extractSessionFacts(learningContentRef.current, progress);
      // The report card's own structured data (ReportData) is the primary,
      // always-available source of patterns/complexity — even when the user
      // never ran Understand Solution. It has approachSummary + solvedOptimally
      // (not keyInsight/approachDetected), which is how we tell it apart.
      const s = item.metadata?.structured;
      const reportData =
        s && 'solvedOptimally' in s ? s : null;
      // Re-read the editor language so the attempt records it (best-effort).
      let language: string | undefined;
      const tabId = await getActiveLeetCodeTabId();
      if (tabId != null) {
        const extracted = await extractCurrentCode(tabId);
        language = extracted?.language;
      }
      const projection = buildRecordProjection(facts, reportData, item.content, language);
      await saveAttempt({
        slug: slugFromUrl(problemContext.url),
        url: problemContext.url,
        title: problemContext.title,
        difficulty: problemContext.difficulty,
        patterns: projection.patterns,
        attempt: projection.attempt,
        notes: item.content,
      });
      setSavedReportIds(prev => new Set(prev).add(item.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save to My Progress');
    }
  }, [problemContext, progress]);

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

  // Chat intent routing (design §7): the chat box is a smart entry point. Before
  // sending a message to the free-form chat path, run the PURE pipeline
  // (classify → resolveOverlap → route) and interpret its effect:
  //   - dispatch → run the matched action, exactly like pressing its button (R7).
  //   - confirm  → surface the confirm affordance (exempt guardrail OR borderline
  //                ask). "Yes" → the action; "Just answer" → chat.
  //   - chat     → the existing free-form chat path, unchanged.
  // The router is a PRE-STEP only: filterResponse, the pre-display gate, and
  // getChatSystemPrompt are untouched — routing sits in front of them.
  const submitChat = () => {
    const q = chatInput.trim();
    if (!q) return;
    // A new submission supersedes any stale confirm prompt.
    setPendingConfirm(null);

    // Context for classification: does the editor currently have code? We reuse
    // the already-loaded problem context; hasCode is best-effort from what chat
    // will read anyway. We don't block the classify on an async editor read —
    // the routed action re-reads the live code itself (handleActionClick), so a
    // false "no code" here at worst under-sharpens (falls to chat/ask), never
    // misroutes into an exempt action silently.
    const effect = routeMessage(q, { hasCode: !!problemContext });

    switch (effect.kind) {
      case 'dispatch':
        // Non-exempt route: fire the action now (identical to a button press).
        // It still flows through filterResponse + the pre-display gate.
        handleActionClick(effect.action);
        setChatInput('');
        return;
      case 'confirm':
        // Exempt route OR borderline ask: never silent. Ask first. `reason`
        // drives the affordance's copy + emphasis (exempt = louder heads-up).
        setPendingConfirm({ action: effect.action, reason: effect.reason, query: q });
        return;
      case 'chat':
        handleChatSubmit(q);
        setChatInput('');
        return;
    }
  };

  // Confirm affordance — "Yes": run the matched action like a button press, then
  // clear the input + prompt.
  const confirmRoutedAction = () => {
    if (!pendingConfirm) return;
    const { action } = pendingConfirm;
    setPendingConfirm(null);
    setChatInput('');
    handleActionClick(action);
  };

  // Confirm affordance — "Just answer": fall through to free-form chat with the
  // original message (the deliberate-act guardrail: a solution-bearing action is
  // never reached without the explicit "Yes" tap).
  const dismissRoutedAction = () => {
    if (!pendingConfirm) return;
    const { query } = pendingConfirm;
    setPendingConfirm(null);
    setChatInput('');
    handleChatSubmit(query);
  };

  const currentPlaceholder = canInteract ? PLACEHOLDER_EXAMPLES[placeholderIdx] : 'Configure your API key first';

  return (
    <div className={`${isDark ? 'dark' : ''} flex flex-col h-screen bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-sm`}>
      {/* Single consolidated header: problem title + difficulty on the left,
          usage counter + theme + settings on the right. (Chrome's side-panel
          title bar already shows the "LeetSage" name, so we don't repeat it.) */}
      <div className="flex items-start justify-between gap-2 px-3 py-2 bg-white dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700 shrink-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 min-w-0 flex-1">
          {problemContext ? (
            <>
              <span className="text-sm font-semibold break-words">{problemContext.title}</span>
              <span className={`text-xs font-bold shrink-0 ${difficultyColor[problemContext.difficulty] ?? 'text-neutral-400'}`}>
                {problemContext.difficulty}
              </span>
            </>
          ) : (
            <span className="text-xs text-neutral-400 italic">Open a LeetCode problem to get started</span>
          )}
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          {settings && (
            <span className="text-[11px] text-neutral-400" title={`AI requests used today (limit ${settings.guardrails.maxRequestsPerDay})`}>
              {usageCount}/{settings.guardrails.maxRequestsPerDay}
            </span>
          )}
          <button onClick={() => setShowProgress(v => !v)} className={`transition-colors ${showProgress ? 'text-blue-500' : 'text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200'}`} aria-label="My Progress" aria-pressed={showProgress} title="My Progress">📈</button>
          <button onClick={toggleTheme} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" aria-label="Toggle theme" title={isDark ? 'Switch to light' : 'Switch to dark'}>
            {isDark ? '☀️' : '🌙'}
          </button>
          <button onClick={() => setShowSettings(true)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors" aria-label="Settings">⚙️</button>
        </div>
      </div>

      {/* My Progress is a full-panel screen that replaces the coaching UI
          (below the shared header) rather than a modal — reads better in a
          narrow side panel. Toggle it from the 📈 header button. */}
      {showProgress ? (
        <ProgressView onClose={() => setShowProgress(false)} />
      ) : (
      <>
      {/* API key prompt */}
      {!apiKeyConfigured && (
        <button onClick={() => setShowSettings(true)}
          className="mx-3 mt-2 text-xs text-center py-1.5 bg-orange-500/10 border border-orange-500/30 rounded text-orange-500 hover:bg-orange-500/20 transition-colors shrink-0">
          ⚠️ Add your free Gemini API key to get started →
        </button>
      )}

      {/* Conversation / content stream */}
      <ContentDisplay content={learningContent} isLoading={isLoading} streamingId={streamingId} onSaveToProgress={handleSaveToProgress} savedReportIds={savedReportIds} />

      {/* Errors + stuck suggestion */}
      {error && (
        <div className="mx-3 mb-2 p-2 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs shrink-0">
          {error} <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}
      {stuckSuggestion && !(stuckSuggestion.suggestedAction === 'GET_HINT' && (progress?.hintLevel ?? 0) >= 3) && (
        <div className="mx-3 mb-2 p-2 bg-blue-500/10 border border-blue-500/30 rounded text-xs flex items-center justify-between shrink-0">
          <span className="text-blue-500">{stuckSuggestion.message}</span>
          <div className="flex gap-2 ml-2 shrink-0">
            <button onClick={() => { handleActionClick(stuckSuggestion.suggestedAction); setStuckSuggestion(null); }} className="text-blue-500 underline">Try it</button>
            <button onClick={() => setStuckSuggestion(null)} className="text-neutral-400">✕</button>
          </div>
        </div>
      )}

      {/* Chat intent routing: confirm affordance for an exempt-action match or a
          borderline `ask`. Reused for both — keyed on { prompt, action }. */}
      {pendingConfirm && (
        <ConfirmAffordance
          reason={pendingConfirm.reason}
          action={pendingConfirm.action}
          onConfirm={confirmRoutedAction}
          onDismiss={dismissRoutedAction}
        />
      )}

      {/* Bottom input bar: quick-command chips + free-form text input */}
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 space-y-2">
        <QuickActions progress={progress} disabled={!canInteract} isLoading={isLoading} onAction={handleActionClick} />

        {/* Discovery (R8): dismissible "Try asking…" chips teach the intents that
            no longer have buttons. Tapping a chip only FILLS the input (no API
            call); the user still presses Send. */}
        {canInteract && showTryChips && learningContent.length === 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-neutral-400 shrink-0">Try asking:</span>
            {TRY_ASKING_CHIPS.map(chip => (
              <button
                key={chip}
                onClick={() => setChatInput(chip)}
                className="text-[11px] px-2 py-0.5 rounded-full border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 hover:border-blue-400 dark:hover:border-blue-400 transition-colors"
              >
                {chip}
              </button>
            ))}
            <button
              onClick={() => setShowTryChips(false)}
              aria-label="Dismiss suggestions"
              title="Dismiss suggestions"
              className="ml-auto text-[11px] text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 shrink-0"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitChat(); } }}
            disabled={!canInteract}
            placeholder={currentPlaceholder}
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
          confirmReset ? (
            <div className="flex items-center justify-center gap-2 text-[11px]">
              <span className="text-neutral-500 dark:text-neutral-400">Reset this problem? This clears its history.</span>
              <button onClick={handleReset} className="px-2 py-0.5 rounded bg-red-500 text-white hover:bg-red-600 transition-colors font-medium">
                Reset
              </button>
              <button onClick={() => setConfirmReset(false)} className="px-2 py-0.5 rounded border border-neutral-300 dark:border-neutral-600 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors">
                Cancel
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmReset(true)} className="w-full text-[11px] text-neutral-400 hover:text-red-500 transition-colors text-center">
              Reset this problem
            </button>
          )
        )}
      </div>
      </>
      )}

      {showSettings && <SettingsModal currentSettings={settings} onSave={handleSettingsSave} onClose={() => setShowSettings(false)} />}
    </div>
  );
};

export default App;
