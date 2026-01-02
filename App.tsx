import React, { useState, useEffect } from 'react';
import PPTWorkbench from './components/PPTWorkbench';
import { setApiKey, testApiKey } from './services/geminiService';
import { Key, ArrowRight, ShieldCheck, Zap, Loader2, CheckCircle2, XCircle } from 'lucide-react';

function App() {
  const [hasKey, setHasKey] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

  useEffect(() => {
    // Check local storage on load
    // SECURITY: We only check LocalStorage (browser side).
    // We removed process.env check to ensure this codebase is safe to share on GitHub
    // without risking accidental exposure of dev keys.
    const stored = localStorage.getItem('gemini_api_key');
    if (stored) {
      setApiKey(stored);
      setHasKey(true);
    } 
  }, []);

  const handleTestConnection = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    setTestStatus('testing');
    try {
        await testApiKey(inputValue.trim());
        setTestStatus('success');
        // Reset to idle after a few seconds so user can test again if they change input
        setTimeout(() => setTestStatus('idle'), 3000);
    } catch (error) {
        setTestStatus('error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim().length > 10) {
      const key = inputValue.trim();
      setApiKey(key);
      localStorage.setItem('gemini_api_key', key);
      setHasKey(true);
    } else {
        alert("请输入有效的 Google API Key");
    }
  };

  const handleReset = () => {
      localStorage.removeItem('gemini_api_key');
      setHasKey(false);
      setApiKey('');
      setInputValue('');
      setTestStatus('idle');
  };

  // 1. Landing Screen (Enter API Key)
  if (!hasKey) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-sans text-slate-900">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 p-10 text-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                <div className="w-16 h-16 bg-white/20 rounded-2xl mx-auto flex items-center justify-center backdrop-blur-sm mb-6 shadow-lg border border-white/10 relative z-10">
                    <span className="text-3xl font-bold text-white">P</span>
                </div>
                <h1 className="text-2xl font-bold text-white mb-2 relative z-10">智能 PPT 工作台</h1>
                <p className="text-blue-100 text-sm font-medium tracking-wide relative z-10">AI Presentation Master</p>
            </div>
            
            {/* Form Content */}
            <div className="p-8">
                <div className="mb-8 text-center">
                    <h2 className="text-lg font-bold text-slate-800 mb-2">配置 Gemini API</h2>
                    <p className="text-slate-500 text-xs leading-relaxed">
                        本应用基于 Google Gemini 3 Pro 构建。
                        <br/>请输入您的 API Key 以连接 Google 服务器。
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                    <div className="space-y-2">
                        <div className="relative group">
                            <Key className="absolute left-3 top-3.5 w-5 h-5 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input 
                                type="password" 
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm shadow-sm"
                                placeholder="粘贴您的 API Key (AIza...)"
                                value={inputValue}
                                onChange={(e) => {
                                    setInputValue(e.target.value);
                                    setTestStatus('idle'); // Reset test status on input change
                                }}
                            />
                        </div>
                    </div>
                    
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleTestConnection}
                            disabled={!inputValue || testStatus === 'testing'}
                            className={`flex-1 font-bold py-3.5 rounded-xl transition-all flex items-center justify-center space-x-2 border shadow-sm active:scale-[0.98] ${
                                testStatus === 'success' 
                                    ? 'bg-green-50 border-green-200 text-green-700' 
                                    : testStatus === 'error' 
                                        ? 'bg-red-50 border-red-200 text-red-700' 
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {testStatus === 'testing' ? <Loader2 className="w-4 h-4 animate-spin" /> : 
                             testStatus === 'success' ? <CheckCircle2 className="w-4 h-4" /> :
                             testStatus === 'error' ? <XCircle className="w-4 h-4" /> :
                             <Zap className="w-4 h-4" />}
                            <span>{testStatus === 'success' ? '已连接' : testStatus === 'error' ? '失败' : '测试连接'}</span>
                        </button>
                        
                        <button 
                            type="submit"
                            disabled={!inputValue}
                            className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg active:scale-[0.98]"
                        >
                            <span>进入工作台</span>
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </div>
                </form>

                <div className="mt-8">
                    <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                        <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                        <p className="text-[10px] text-blue-800 leading-relaxed text-justify">
                            <strong>安全承诺：</strong> 您的 API Key 仅存储在本地浏览器 (LocalStorage) 中，直接用于请求 Google API，绝不会上传至任何第三方服务器。
                        </p>
                    </div>
                </div>
                
                <div className="mt-6 text-center">
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center text-xs text-slate-400 hover:text-blue-600 font-medium hover:underline transition-colors"
                    >
                        还没有 Key？去 Google AI Studio 获取 &rarr;
                    </a>
                </div>
            </div>
        </div>
        <div className="mt-8 text-slate-400 text-xs">
            Powered by Google Gemini 3 Pro
        </div>
      </div>
    );
  }

  // 2. Main Application
  return (
    <div className="antialiased text-slate-900 bg-slate-50 min-h-screen">
      <PPTWorkbench onReset={handleReset} />
    </div>
  );
}

export default App;