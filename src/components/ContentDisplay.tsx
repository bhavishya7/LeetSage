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
};

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-neutral-200 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 px-1 rounded font-mono text-[11px]">{part.slice(1, -1)}</code>;
    if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
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
      elements.push(<pre key={i} className="bg-neutral-950 text-neutral-100 border border-neutral-700 rounded p-2 text-xs overflow-x-auto my-1 font-mono">{codeLines.join('\n')}</pre>);
    } else if (line.startsWith('## ')) { elements.push(<h2 key={i} className="font-bold text-sm mt-2 mb-1 text-neutral-800 dark:text-neutral-100">{line.slice(3)}</h2>); }
    else if (line.startsWith('### ')) { elements.push(<h3 key={i} className="font-semibold text-xs mt-2 mb-0.5 text-neutral-700 dark:text-neutral-200">{line.slice(4)}</h3>); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { elements.push(<li key={i} className="ml-3 text-xs text-neutral-700 dark:text-neutral-300 list-disc">{renderInline(line.slice(2))}</li>); }
    else if (/^\d+\.\s/.test(line)) { elements.push(<li key={i} className="ml-3 text-xs text-neutral-700 dark:text-neutral-300 list-decimal">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>); }
    else if (line.trim() === '') { elements.push(<div key={i} className="h-1" />); }
    else { elements.push(<p key={i} className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">{renderInline(line)}</p>); }
    i++;
  }
  return <>{elements}</>;
}

const UserBubble: React.FC<{ text: string }> = ({ text }) => (
  <div className="flex justify-end mb-2">
    <div className="max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-xs bg-blue-600 text-white">{text}</div>
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
          <span>{meta.icon}</span>
          <span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
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
