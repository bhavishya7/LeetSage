import React, { useState } from 'react';
import type { UserSettings } from '../types';
import { saveSettings } from '../services/storage';

interface SettingsModalProps { currentSettings: UserSettings | null; onSave: (settings: UserSettings) => void; onClose: () => void; }

const SettingsModal: React.FC<SettingsModalProps> = ({ currentSettings, onSave, onClose }) => {
  const [apiKey, setApiKey] = useState(currentSettings?.apiConfig.apiKey ?? '');
  const [provider, setProvider] = useState<'openai' | 'anthropic'>(currentSettings?.apiConfig.provider === 'anthropic' ? 'anthropic' : 'openai');
  const [enableStuckTimer, setEnableStuckTimer] = useState(currentSettings?.enableStuckTimer ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!apiKey.trim()) { setError('API key is required'); return; }
    if (provider === 'openai' && !apiKey.startsWith('sk-')) { setError('OpenAI keys start with "sk-"'); return; }
    if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) { setError('Anthropic keys start with "sk-ant-"'); return; }
    setSaving(true);
    const newSettings: UserSettings = { apiConfig: { provider, apiKey: apiKey.trim() }, enableStuckTimer, stuckTimerDelay: 300000, enableChatMode: false, theme: 'auto' };
    await saveSettings(newSettings);
    onSave(newSettings);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">LLM Provider</label>
            <select value={provider} onChange={e => setProvider(e.target.value as 'openai' | 'anthropic')}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
              <option value="openai">OpenAI (GPT-4o mini) — Recommended</option>
              <option value="anthropic">Anthropic (Claude Haiku)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">API Key</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setError(''); }}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono" />
            {error && <p className="text-red-500 text-[11px] mt-1">{error}</p>}
            <p className="text-gray-400 text-[11px] mt-1">Your key is stored locally and never sent to our servers.</p>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium text-gray-700">Proactive suggestions</p><p className="text-[11px] text-gray-400">Suggest help after 5 min of inactivity</p></div>
            <button onClick={() => setEnableStuckTimer(v => !v)} className={`w-10 h-5 rounded-full transition-colors ${enableStuckTimer ? 'bg-blue-500' : 'bg-gray-300'}`} role="switch" aria-checked={enableStuckTimer}>
              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${enableStuckTimer ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t">
          <button onClick={onClose} className="flex-1 text-xs py-1.5 border border-gray-300 rounded hover:bg-gray-50 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 text-xs py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
