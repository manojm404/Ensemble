import React, { useState } from 'react';
import { UserPlus, Mail, Lock, User, Loader2, Sparkles } from 'lucide-react';

interface SignupProps {
  onNavigateToLogin: () => void;
}

export function Signup({ onNavigateToLogin }: SignupProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('http://127.0.0.1:8088/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, fullName })
      });
      const data = await res.json();
      
      if (data.status === 'success') {
        setIsSuccess(true);
        setTimeout(() => onNavigateToLogin(), 2000);
      } else {
        setError(data.message || 'Signup failed');
      }
    } catch (err) {
      setError('Could not connect to the Ensemble backend.');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#1a1a1a] border border-green-900/50 rounded-2xl p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-green-900/20 rounded-full flex items-center justify-center mb-6 mx-auto">
            <Sparkles className="text-green-500" size={32} />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tighter mb-2">Request Received!</h2>
          <p className="text-gray-400 text-sm">Welcome to the agency. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#1a1a1a] border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in fade-in zoom-in duration-300">
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-purple-600 rounded-xl flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(147,51,234,0.4)]">
            <UserPlus className="text-white" size={28} />
          </div>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">Agency Enrollment</h1>
          <p className="text-gray-500 text-sm font-medium">Join the Autonomous Intelligence Network</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Full Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Agent Name"
                className="w-full bg-[#252525] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Identity (Email)</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@ensemble.ai"
                className="w-full bg-[#252525] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/50 transition-all"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block mb-2 px-1">Security Key</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-[#252525] border border-gray-800 rounded-xl py-3 pl-10 pr-4 text-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-600/50 transition-all"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-xl text-red-400 text-xs font-medium text-center">
              {error}
            </div>
          )}

          <button 
            type="submit"
            disabled={isLoading}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-purple-800 py-3 rounded-xl text-white font-black uppercase text-sm tracking-widest flex items-center justify-center gap-2 transition-all shadow-lg active:scale-95 border-b-4 border-purple-800 active:border-b-0 mt-2"
          >
            {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
            {isLoading ? 'Processing...' : 'Request Enrollment'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className="text-gray-500 text-xs">
            Already verified?{' '}
            <button 
              onClick={onNavigateToLogin}
              className="text-purple-500 hover:text-purple-400 font-bold underline transition-colors"
            >
              Sign In
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
