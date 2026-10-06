import React from 'react';

/**
 * E4 onboarding (chat-polish §5). The first-run welcome: what LeetSage is, the
 * no-solutions promise, and how to get started. Rendered in TWO places from the
 * same source so they can't drift:
 *   - as the chat empty state (ContentDisplay, when there's no content yet), and
 *   - as a dismissible overlay re-openable any time via the header "?" button.
 *
 * Purely presentational — no API calls. `onDismiss` is only passed in the
 * overlay case (shows a "Got it" button + close affordance); the empty-state
 * case omits it.
 */
interface WelcomeCardProps {
  onDismiss?: () => void;
}

const WelcomeCard: React.FC<WelcomeCardProps> = ({ onDismiss }) => (
  <div className="max-w-[300px] text-center">
    <div className="text-4xl mb-3">🧠</div>
    <h2 className="text-sm font-semibold text-neutral-700 dark:text-neutral-100 mb-1.5">
      Welcome to LeetSage
    </h2>
    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-3">
      Your AI coach for this problem. I guide you toward the answer with hints,
      breakdowns, and code review —{' '}
      <span className="font-medium text-neutral-700 dark:text-neutral-200">
        I never hand over the full solution.
      </span>
    </p>
    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed mb-2">
      To start, add a free Google Gemini API key (no billing required). Grab one
      from{' '}
      <a
        href="https://aistudio.google.com/app/apikey"
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-teal-600 dark:text-teal-400 underline underline-offset-2 hover:brightness-110"
      >
        Google AI&nbsp;Studio
      </a>{' '}
      → <span className="font-medium">Get API key</span>, then paste it into
      Settings&nbsp;⚙️. It's stored locally and sent only to Google.
    </p>
    <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">
      Then tap a quick action below or try one of the suggested questions to get
      started.
    </p>
    {onDismiss && (
      <button
        onClick={onDismiss}
        className="leetsage-pressable leetsage-sage-fill mt-4 text-xs font-medium px-4 py-1.5 rounded-full shadow-sm hover:brightness-105"
      >
        Got it
      </button>
    )}
  </div>
);

export default WelcomeCard;
