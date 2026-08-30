import React, { useState } from 'react';
import type { UserSettings, GeminiModel } from '../types';
import { saveSettings } from '../services/storage';

interface SettingsModalProps { currentSettings: UserSettings | null; onSave: (settings: UserSettings) => void; onClose: () => void; }

const MODEL_OPTIONS: { value: GeminiModel; label: string }[] = [
  { value: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite — fastest, highest free limits' },
  { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash — smarter, lower free limits' },
];

const SettingsModal: React.FC<SettingsModalProps> = ({ currentSettings, onSave, onClose }) => {
  const [apiKey, setApiKey] = useState(currentSettings?.apiConfig.apiKey ?? '');
  const [model, setModel] = useState<GeminiModel>(currentSettings?.apiConfig.model ?? 'gemini-3.5-flash-lite');
  const [enableStuckTimer, setEnableStuckTimer] = useState(currentSettings?.enableStuckTimer ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    const key = apiKey.trim();
    if (!key) { setError('API key is required'); return; }
    // We don't hard-validate the key format — Google AI Studio keys usually
    // start with "AIza", but we let Gemini itself reject invalid keys so we
    // don't block legitimate variations. Just warn softly for obvious cases.
    setSaving(true);
    const newSettings: UserSettings = {
      apiConfig: { provider: 'gemini', apiKey: key, model },
      enableStuckTimer,
      stuckTimerDelay: currentSettings?.stuckTimerDelay ?? 300000,
      enableChatMode: currentSettings?.enableChatMode ?? false,
      theme: currentSettings?.theme ?? 'dark',
    };
    await saveSettings(newSettings);
    onSave(newSettings);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 rounded-xl shadow-xl w-full max-w-sm border border-neutral-200 dark:border-neutral-700">
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 dark:border-neutral-700">
          <h2 className="font-semibold text-sm">Settings</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 text-lg leading-none">×</button>
        </div>
        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Gemini Model</label>
            <select value={model} onChange={e => setModel(e.target.value as GeminiModel)}
              className="w-full text-xs border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400">
              {MODEL_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Gemini API Key</label>
            <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); setError(''); }}
              placeholder="Paste your Gemini API key"
              className="w-full text-xs border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 font-mono" />
            {error && <p className="text-red-500 text-[11px] mt-1">{error}</p>}
            <p className="text-neutral-400 text-[11px] mt-1">
              Get a free key from Google AI Studio (aistudio.google.com → Get API key). Stored locally, sent only to Google. No billing required.
            </p>
          </div>
          <div className="flex items-center justify-between">
            <div><p className="text-xs font-medium">Proactive suggestions</p><p className="text-[11px] text-neutral-400">Suggest help after 5 min of inactivity</p></div>
            <button onClick={() => setEnableStuckTimer(v => !v)} className={`w-10 h-5 rounded-full transition-colors ${enableStuckTimer ? 'bg-blue-500' : 'bg-neutral-300 dark:bg-neutral-600'}`} role="switch" aria-checked={enableStuckTimer}>
              <span className={`block w-4 h-4 bg-white rounded-full shadow transition-transform mx-0.5 ${enableStuckTimer ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-neutral-200 dark:border-neutral-700">
          <button onClick={onClose} className="flex-1 text-xs py-1.5 border border-neutral-300 dark:border-neutral-600 rounded hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="flex-1 text-xs py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
