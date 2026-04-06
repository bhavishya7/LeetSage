import React, { useState, useRef, useEffect } from 'react';
import type { ChatMessage, ProblemContext } from '../types';
import { streamLLMRequest } from '../services/llm-service';
import { filterResponse } from '../services/solution-filter';

interface ChatModeProps { problemContext: ProblemContext | null; apiKey: string; onClose: () => void; }

const ChatMode: React.FC<ChatModeProps> = ({ problemContext, apiKey, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !problemContext || isLoading) return;
    const userMsg: ChatMessage = { id: `${Date.now()}-user`, role: 'user', content: input.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]); setInput(''); setIsLoading(true);
    const assistantId = `${Date.now()}-assistant`;
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', timestamp: Date.now() }]);
    try {
      let fullContent = '';
      for await (const chunk of streamLLMRequest({ problemContext, actionType: 'EXPLAIN_CONCEPT', systemPrompt: '', userMessage: userMsg.content, apiKey })) {
        fullContent += chunk;
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: fullContent } : m));
      }
      const { filteredContent } = filterResponse(fullContent, 'EXPLAIN_CONCEPT');
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: filteredContent } : m));
    } catch {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: '⚠️ Error generating response. Please try again.' } : m));
    } finally { setIsLoading(false); }
  };

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gray-50">
        <span className="text-xs font-medium text-gray-700">💬 Chat Mode</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">✕ Close</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {messages.length === 0 && <p className="text-xs text-gray-400 text-center mt-4">Ask any question about this problem.</p>}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-xs ${msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`}>
              {msg.content || <span className="animate-pulse">...</span>}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="px-3 py-2 border-t flex gap-2">
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="Ask a question..." className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400" disabled={isLoading} />
        <button onClick={handleSend} disabled={!input.trim() || isLoading}
          className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-40 transition-colors">Send</button>
      </div>
    </div>
  );
};

export default ChatMode;
