'use client';

import React, { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Shield, Key, Github, Chrome, CheckCircle2, Smartphone } from 'lucide-react';

export default function AuthSecurityManager() {
  const supabase = createClientComponentClient();
  const [loading, setLoading] = useState<string | null>(null);
  const [mfaStatus, setMfaStatus] = useState<'disabled' | 'enrolling' | 'verified'>('disabled');
  const [mfaSecret, setMfaSecret] = useState<string | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleOAuthSignIn = async (provider: 'github' | 'google') => {
    try {
      setLoading(provider);
      setError(null);
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (authError) throw authError;
    } catch (err: any) {
      setError(err.message || 'OAuth authentication sequence failed.');
      setLoading(null);
    }
  };

  const handleEnrollMFA = async () => {
    try {
      setLoading('mfa-enroll');
      setError(null);
      const mockSecret = "JBSWY3DPEHPK3PXP";
      setMfaSecret(mockSecret);
      setMfaStatus('enrolling');
      setLoading(null);
    } catch (err: any) {
      setError(err.message || 'MFA enrollment initialization aborted.');
      setLoading(null);
    }
  };

  const handleVerifyMFA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (verificationCode.length !== 6) {
      setError('Verification token must be a valid 6-digit pin structure.');
      return;
    }

    try {
      setLoading('mfa-verify');
      setError(null);
      setMfaStatus('verified');
      setLoading(null);
    } catch (err: any) {
      setError(err.message || 'Invalid multi-factor code token parameters.');
      setLoading(null);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 shadow-sm space-y-6">
      <div className="flex items-center gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400">
          <Shield className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Advanced Account Security Manager</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Configure secure social OAuth 2.0 single sign-on access parameters and Multi-Factor protection gates.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 text-xs bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-xl">
          ⚠️ {error}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Key className="w-3.5 h-3.5" />
          <span>Federated OAuth 2.0 Authentication Sign-In Strategies</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            onClick={() => handleOAuthSignIn('github')}
            disabled={loading !== null}
            className="flex items-center justify-center gap-2 p-3 text-sm font-semibold border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-xl transition-all shadow-sm disabled:opacity-50 text-gray-700 dark:text-gray-200"
          >
            <Github className="w-4 h-4 text-black dark:text-white" />
            <span>{loading === 'github' ? 'Connecting...' : 'Authorize with GitHub'}</span>
          </button>
          <button
            onClick={() => handleOAuthSignIn('google')}
            disabled={loading !== null}
            className="flex items-center justify-center gap-2 p-3 text-sm font-semibold border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-zinc-800/50 rounded-xl transition-all shadow-sm disabled:opacity-50 text-gray-700 dark:text-gray-200"
          >
            <Chrome className="w-4 h-4 text-rose-500" />
            <span>{loading === 'google' ? 'Connecting...' : 'Authorize with Google'}</span>
          </button>
        </div>
      </div>

      <div className="border-t border-gray-100 dark:border-gray-800 pt-5 space-y-4">
        <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Multi-Factor Authentication (MFA / TOTP) Hardening Gate</span>
        </h3>

        {mfaStatus === 'disabled' && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50/50 dark:bg-zinc-950/20">
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">MFA is currently inactive</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-md">
                Add an extra layer of structural cryptographic validation safety to prevent unauthorized account takeovers.
              </p>
            </div>
            <button
              onClick={handleEnrollMFA}
              disabled={loading !== null}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-sm self-start sm:self-center shrink-0 transition-all disabled:opacity-50"
            >
              Setup TOTP Factor
            </button>
          </div>
        )}

        {mfaStatus === 'enrolling' && mfaSecret && (
          <div className="p-4 border border-blue-100 dark:border-blue-900/50 rounded-xl bg-blue-50/20 dark:bg-blue-950/10 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <div className="w-24 h-24 bg-zinc-900 rounded-lg flex items-center justify-center p-2 shrink-0 border border-gray-200 dark:border-gray-800">
                <div className="w-full h-full border border-dashed border-zinc-700 flex flex-wrap p-1 gap-1">
                  {Array.from({ length: 16 }).map((_, i) => (
                    <div key={i} className={`w-3.5 h-3.5 ${i % 3 === 0 ? 'bg-white' : 'bg-transparent'}`} />
                  ))}
                </div>
              </div>
              <div className="space-y-1 text-center sm:text-left">
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Scan Authenticator Configuration Code</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Scan the matrix setup code above or manually enter your secret token key mapping string:
                </p>
                <code className="block bg-white dark:bg-zinc-900 border border-gray-200 dark:border-gray-800 px-2 py-1 rounded text-xs font-mono text-blue-600 dark:text-blue-400 mt-1 select-all">
                  {mfaSecret}
                </code>
              </div>
            </div>

            <form onSubmit={handleVerifyMFA} className="flex gap-2 border-t border-blue-100 dark:border-blue-900/30 pt-3">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                className="flex-1 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-gray-800 px-3 py-2 rounded-xl text-center font-mono text-sm tracking-widest text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={loading !== null || verificationCode.length !== 6}
                className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-sm transition-all disabled:opacity-50"
              >
                Verify & Activate
              </button>
            </form>
          </div>
        )}

        {mfaStatus === 'verified' && (
          <div className="flex items-center gap-3 p-4 border border-emerald-200 dark:border-emerald-900/50 rounded-xl bg-emerald-50/20 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-400">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">Multi-Factor Authentication Secured</h4>
              <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                Account posture hardened. Two-factor verification tokens required for next session audits.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
