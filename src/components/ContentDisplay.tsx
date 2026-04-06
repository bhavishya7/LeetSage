import React, { useEffect, useRef } from 'react';
import type { LearningContent } from '../types';

interface ContentDisplayProps { content: LearningContent[]; isLoading: boolean; streamingId: string | null; }

const TYPE_STYLES: Record<LearningContent['type'], { border: string; header: string; icon: string }> = {
  HINT: { border: 'border-yellow-200', header: 'bg-yellow-50', icon: '💡' },
  EXAMPLES: { border: 'border-blue-200', header: 'bg-blue-50', icon: '🔢' },
  BREAKDOWN: { border: 'border-purple-200', header: 'bg-purple-50', icon: '🧩' },
  EXPLANATION: { border: 'border-green-200', header: 'bg-green-50', icon: '📚' },
  FEEDBACK: { border: 'border-teal-200', header: 'bg-teal-50', icon: '✅' },
  CHAT_MESSAGE: { border: 'border-gray-200', header: 'bg-gray-50', icon: '💬' },
};

const ACTION_LABELS: Record<string, string> = {
  GET_HINT: 'Hint', GENERATE_EXAMPLES: 'New Examples', BREAK_DOWN_PROBLEM: 'Problem Breakdown',
  EXPLAIN_CONCEPT: 'Concept Explanation', CHECK_APPROACH: 'Approach Review',
  TIME_COMPLEXITY_HINT: 'Complexity Hint', PATTERN_RECOGNITION: 'Pattern Recognition',
};

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="bg-gray-100 text-gray-800 px-1 rounded font-mono text-[11px]">{part.slice(1, -1)}</code>;
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
      elements.push(<pre key={i} className="bg-gray-900 text-gray-100 rounded p-2 text-xs overflow-x-auto my-1 font-mono">{codeLines.join('\n')}</pre>);
    } else if (line.startsWith('## ')) { elements.push(<h2 key={i} className="font-bold text-sm mt-2 mb-1 text-gray-800">{line.slice(3)}</h2>); }
    else if (line.startsWith('### ')) { elements.push(<h3 key={i} className="font-semibold text-xs mt-2 mb-0.5 text-gray-700">{line.slice(4)}</h3>); }
    else if (line.startsWith('- ') || line.startsWith('* ')) { elements.push(<li key={i} className="ml-3 text-xs text-gray-700 list-disc">{renderInline(line.slice(2))}</li>); }
    else if (/^\d+\.\s/.test(line)) { elements.push(<li key={i} className="ml-3 text-xs text-gray-700 list-decimal">{renderInline(line.replace(/^\d+\.\s/, ''))}</li>); }
    else if (line.trim() === '') { elements.push(<div key={i} className="h-1" />); }
    else { elements.push(<p key={i} className="text-xs text-gray-700 leading-relaxed">{renderInline(line)}</p>); }
    i++;
  }
  return <>{elements}</>;
}

const ContentCard: React.FC<{ item: LearningContent; isStreaming: boolean }> = ({ item, isStreaming }) => {
  const [expanded, setExpanded] = React.useState(true);
  const style = TYPE_STYLES[item.type];
  const label = ACTION_LABELS[item.actionType] ?? item.actionType;
  const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`border rounded-lg overflow-hidden mb-2 ${style.border}`}>
      <button onClick={() => setExpanded(v => !v)} className={`w-full flex items-center justify-between px-3 py-2 ${style.header} text-left`} aria-expanded={expanded}>
        <div className="flex items-center gap-1.5">
          <span>{style.icon}</span>
          <span className="text-xs font-medium text-gray-700">{label}</span>
          {item.metadata?.hintLevel && <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1.5 rounded-full">Level {item.metadata.hintLevel}</span>}
          {isStreaming && <span className="text-[10px] text-gray-400 animate-pulse">generating...</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400">{time}</span>
          <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>
      {expanded && (
        <div className="px-3 py-2 bg-white">
          {item.content ? renderContent(item.content) : <div className="h-4 bg-gray-100 rounded animate-pulse" />}
          {isStreaming && item.content && <span className="inline-block w-1 h-3 bg-gray-400 animate-pulse ml-0.5" />}
        </div>
      )}
    </div>
  );
};

const ContentDisplay: React.FC<ContentDisplayProps> = ({ content, isLoading, streamingId }) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [content.length]);
  if (content.length === 0 && !isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-center px-6">
        <div className="text-gray-400"><div className="text-3xl mb-2">🧠</div><p className="text-xs">Click an action button above to get AI-powered learning help.</p></div>
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-y-auto px-3 py-3">
      {content.map(item => <ContentCard key={item.id} item={item} isStreaming={item.id === streamingId} />)}
      <div ref={bottomRef} />
    </div>
  );
};

export default ContentDisplay;
