import React, { useEffect, useRef } from 'react';
import type { LearningContent } from '../types';

interface ContentDisplayProps { content: LearningContent[]; isLoading: boolean; streamingId: string | null; }

const TYPE_META: Record<LearningContent['type'], { accent: string; icon: string }> = {
  HINT:         { accent: 'border-l-yellow-400', icon: '💡' },
  EXAMPLES:     { accent: 'border-l-blue-400',   icon: '🔢' },
  BREAKDOWN:    { accent: 'border-l-purple-400', icon: '🧩' },
  EXPLANATION:  { accent: 'border-l-green-400',  icon: '📚' },
  FEEDBACK:     { accent: 'border-l-teal-400',   icon: '✅' },
  CHAT_MESSAGE: { accent: 'border-l-neutral-400',icon: '💬' },
};

const ACTION_LABELS: Record<string, string> = {
  GET_HINT: 'Hint', GENERATE_EXAMPLES: 'New Examples', BREAK_DOWN_PROBLEM: 'Problem Breakdown',
  EXPLAIN_CONCEPT: 'Concept Explanation', CHECK_APPROACH: 'Approach Review',
  TIME_COMPLEXITY_HINT: 'Complexity Hint', PATTERN_RECOGNITION: 'Pattern Recognition',
  UNDERSTAND_SOLUTION: 'Understand Solution',
};

/**
 * Defensive cleanup for math notation the model sometimes emits despite the
 * prompt asking for plain text. Converts inline LaTeX ($...$ and \(...\)) into
 * backtick code so it renders cleanly instead of showing raw dollar signs.
 */
function stripLatex(text: string): string {
  return text
    .replace(/\\\((.+?)\\\)/g, (_, inner) => `\`${inner.trim()}\``)
    .replace(/\$([^$\n]+?)\$/g, (_, inner) => `\`${inner.trim()}\``);
}

/**
 * Renders Big-O / complexity notation with proper formatting:
 * - O(N²) instead of O(n^2)
 * - Styled as a visually distinct inline badge
 * Handles: O(1), O(N), O(N²), O(N³), O(N log N), O(2^N), O(N!), etc.
 */
function renderComplexity(text: string, keyBase: number): React.ReactNode[] {
  // Match O(...) patterns, including nested content like "N log N", "N^2", "2^N"
  const regex = /O\(([^)]+)\)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    // Text before this match
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));

    const inner = match[1];
    // Convert ^2 -> superscript, uppercase N for consistency
    const formatted = inner
      .replace(/\^(\d+)/g, '⁰¹²³⁴⁵⁶⁷⁸⁹'.includes('') ? '$1' : '^$1') // fallback
      .replace(/n/g, 'N');

    // Build the styled content with real superscripts
    const superscripted = formatSuperscripts(formatted);

    parts.push(
      <span key={`complexity-${keyBase}-${match.index}`}
        className="inline-flex items-baseline px-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-mono text-[12px] font-semibold whitespace-nowrap">
        O({superscripted})
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

/** Converts ^2, ^3 etc. AND bare trailing digits like N2 into superscript elements. */
function formatSuperscripts(text: string): React.ReactNode {
  // First normalize: if the model wrote "N2" or "n2" (no caret), insert one.
  // Match a letter followed directly by a digit (e.g. N2 → N^2, N3 → N^3).
  const normalized = text.replace(/([A-Za-z])(\d+)/g, '$1^$2');
  const parts = normalized.split(/(\^\d+)/g);
  return parts.map((part, i) => {
    if (part.startsWith('^')) {
      return <sup key={i} className="text-[9px]">{part.slice(1)}</sup>;
    }
    return part;
  });
}

function renderInline(raw: string): React.ReactNode {
  const text = stripLatex(raw);
  // Split on markdown inline formatting first.
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-neutral-900 dark:text-white">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-neutral-200 dark:bg-neutral-700 text-pink-600 dark:text-pink-300 px-1 rounded font-mono text-[12px]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    // For plain text, render complexity notation with nice formatting.
    return <React.Fragment key={i}>{renderComplexity(part, i)}</React.Fragment>;
  });
}

/**
 * Picks a heading color from its leading emoji / keyword so each section has a
 * clear visual identity (like LeetCode's colored section headers). Falls back
 * to a neutral-but-distinct indigo.
 */
function headingColor(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('approach') || t.includes('🧭')) return 'text-blue-600 dark:text-blue-400';
  if (t.includes('efficiency') || t.includes('complexity') || t.includes('⚡') || t.includes('📊') || t.includes('⏱')) return 'text-amber-600 dark:text-amber-400';
  if (t.includes('code style') || t.includes('🎨')) return 'text-purple-600 dark:text-purple-400';
  if (t.includes('analogy') || t.includes('🌍') || t.includes('why it works') || t.includes('⚙')) return 'text-emerald-600 dark:text-emerald-400';
  if (t.includes('insight') || t.includes('🔑') || t.includes('hint') || t.includes('💡') || t.includes('think')) return 'text-yellow-600 dark:text-yellow-400';
  if (t.includes('pattern') || t.includes('🔍') || t.includes('breakdown') || t.includes('step') || t.includes('🧩')) return 'text-pink-600 dark:text-pink-400';
  if (t.includes('example') || t.includes('🔢')) return 'text-cyan-600 dark:text-cyan-400';
  return 'text-indigo-600 dark:text-indigo-400';
}

function renderContent(text: string): React.ReactNode {
  if (!text) return null;
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const codeLines: string[] = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++; }
      elements.push(<pre key={i} className="bg-neutral-950 text-neutral-100 border border-neutral-700 rounded p-2 text-[12px] overflow-x-auto my-1.5 font-mono leading-relaxed">{codeLines.join('\n')}</pre>);
    } else if (line.startsWith('## ')) { elements.push(<h2 key={i} className={`font-bold text-[15px] mt-3 mb-1 ${headingColor(line)}`}>{line.slice(3)}</h2>); }
    else if (line.startsWith('### ')) { elements.push(<h3 key={i} className={`font-semibold text-[13px] mt-2 mb-0.5 ${headingColor(line)}`}>{line.slice(4)}</h3>); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { elements.push(<li key={i} className="ml-4 text-[13px] text-neutral-700 dark:text-neutral-200 list-disc leading-relaxed">{renderInline(line.slice(2))}</li>); }
    else if (/^\d+\.\s/.test(line)) { elements.push(<li key={i} className="ml-4 text-[13px] text-neutral-700 dark:text-neutral-200 list-decimal leading-relaxed">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>); }
    else if (line.trim() === '') { elements.push(<div key={i} className="h-1.5" />); }
    else { elements.push(<p key={i} className="text-[13px] text-neutral-700 dark:text-neutral-200 leading-relaxed">{renderInline(line)}</p>); }
    i++;
  }
  return <>{elements}</>;
}

const UserBubble: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex justify-end mb-2">
    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-[13px] bg-blue-600 text-white">{text}</div>
  </div>
);

const ContentCard: React.FC<{ item: LearningContent; isStreaming: boolean }> = ({ item, isStreaming }) => {
  const [expanded, setExpanded] = React.useState(true);
  const meta = TYPE_META[item.type];
  const label = ACTION_LABELS[item.actionType] ?? item.actionType;
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`border border-neutral-200 dark:border-neutral-700 border-l-2 ${meta.accent} bg-white dark:bg-neutral-800 rounded-lg overflow-hidden mb-2`}>
      <button onClick={() => setExpanded(v => !v)} className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700/50" aria-expanded={expanded}>
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{meta.icon}</span>
          <span className="text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{label}</span>
          {item.metadata?.hintLevel && <span className="text-[10px] bg-yellow-400/20 text-yellow-600 dark:text-yellow-400 px-1.5 rounded-full">Level {item.metadata.hintLevel}</span>}
          {isStreaming && <span className="text-[10px] text-neutral-400 animate-pulse">generating…</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-neutral-400">{time}</span>
          <span className="text-neutral-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-2">
          {item.content ? renderContent(item.content) : <div className="h-4 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse" />}
          {isStreaming && item.content && <span className="inline-block w-1 h-3 bg-neutral-400 animate-pulse ml-0.5" />}
        </div>
      )}
    </div>
  );
};

const ContentDisplay: React.FC<ContentDisplayProps> = ({ content, isLoading, streamingId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [content.length, streamingId]);

  if (content.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div className="text-neutral-400">
          <div className="text-3xl mb-2">🧠</div>
          <p className="text-xs">Tap a quick action below, or ask your own question. I'll coach you toward the answer — never hand it over.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {content.map(item =>
        item.type === 'CHAT_MESSAGE' && item.actionType === 'CHECK_APPROACH' && item.metadata?.isUserQuery
          ? <UserBubble key={item.id} text={item.content} />
          : <ContentCard key={item.id} item={item} isStreaming={item.id === streamingId} />
      )}
      <div ref={bottomRef} />
    </div>
  );
};

export default ContentDisplay;
