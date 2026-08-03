import { useState } from 'react';
import { login, resendVerification, signup, type Account } from '../state/auth';

/**
 * Sign-in / sign-up screen, shown by <AuthGate> when accounts are configured and no one is signed
 * in. One form that toggles between the two modes (they take the same fields) rather than two
 * separate screens. Styling follows the app's inline-style, dark-theme idiom used everywhere else.
 */

const ACCENT = '#f0752f';
const TEXT = '#f5f0ea';

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,.06)',
  border: '1px solid rgba(255,255,255,.12)',
  color: TEXT,
  font: "400 15px 'Inter'",
  padding: '13px 14px',
  borderRadius: 12,
  boxSizing: 'border-box'
};

const labelStyle: React.CSSProperties = {
  font: "500 11px 'Inter'",
  letterSpacing: '.04em',
  color: 'rgba(245,240,234,.5)',
  marginBottom: 7,
  display: 'block'
};

export function LoginScreen({ onSuccess }: { onSuccess: (token: string, account: Account) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // When set, the account exists but its email needs confirming — show the check-your-email panel.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const isSignup = mode === 'signup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    const res = isSignup ? await signup(email, password) : await login(email, password);
    setBusy(false);
    if (res.kind === 'session') {
      onSuccess(res.token, res.account);
    } else if (res.kind === 'verify' || res.kind === 'unverified') {
      setPendingEmail(res.email);
    } else {
      setError(res.error);
    }
  }

  function toggleMode() {
    setMode(isSignup ? 'login' : 'signup');
    setError(null);
  }

  if (pendingEmail) {
    return <CheckEmail email={pendingEmail} onBack={() => { setPendingEmail(null); setMode('login'); }} />;
  }

  return (
    <div className="app-shell">
      <div
        className="scr"
        style={{
          background: '#0f0e0d',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '0 24px',
          minHeight: '100%'
        }}
      >
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 34 }}>
            <img
              src={`${import.meta.env.BASE_URL}icon-192.png`}
              alt="Alpha Lifts"
              width={84}
              height={84}
              style={{ display: 'block', margin: '0 auto 16px', borderRadius: 20, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}
            />
            <div className="num" style={{ fontSize: 34, fontWeight: 800, color: TEXT, letterSpacing: '-.02em' }}>
              Alpha Lifts
            </div>
            <div style={{ font: "400 13px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 8 }}>
              {isSignup
                ? 'Create an account to sync your training across devices.'
                : 'Sign in to pick up your training on any device.'}
            </div>
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle} htmlFor="auth-email">EMAIL</label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle} htmlFor="auth-password">PASSWORD</label>
              <input
                id="auth-password"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isSignup ? 'At least 8 characters' : 'Your password'}
                style={inputStyle}
              />
            </div>

            {error && (
              <div
                role="alert"
                style={{ font: "400 12.5px 'Inter'", color: '#ff8a6b', margin: '4px 2px 14px', lineHeight: 1.4 }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: '100%',
                background: busy ? 'rgba(240,117,47,.5)' : ACCENT,
                border: 'none',
                color: '#1a1206',
                font: "700 15px 'Inter'",
                padding: '14px',
                borderRadius: 12,
                marginTop: error ? 0 : 12,
                cursor: busy ? 'default' : 'pointer'
              }}
            >
              {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: 22, font: "400 13px 'Inter'", color: 'rgba(245,240,234,.5)' }}>
            {isSignup ? 'Already have an account?' : 'New here?'}{' '}
            <button
              onClick={toggleMode}
              style={{ background: 'none', border: 'none', color: ACCENT, font: "600 13px 'Inter'", cursor: 'pointer', padding: 0 }}
            >
              {isSignup ? 'Sign in' : 'Create an account'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Shown after a signup (or a login attempt on an unconfirmed account) when email verification is
 *  on. Explains the next step and offers a resend. */
function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const [resent, setResent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function resend() {
    if (busy) return;
    setBusy(true);
    await resendVerification(email);
    setBusy(false);
    setResent(true);
  }

  return (
    <div className="app-shell">
      <div
        className="scr"
        style={{ background: '#0f0e0d', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 24px', minHeight: '100%' }}
      >
        <div style={{ width: '100%', maxWidth: 380, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 46, marginBottom: 16 }}>📧</div>
          <div className="num" style={{ fontSize: 26, fontWeight: 800, color: TEXT, letterSpacing: '-.02em', marginBottom: 12 }}>
            Check your email
          </div>
          <div style={{ font: "400 14px 'Inter'", color: 'rgba(245,240,234,.6)', lineHeight: 1.6, marginBottom: 8 }}>
            We sent a verification link to <span style={{ color: TEXT, fontWeight: 600 }}>{email}</span>. Click it to
            confirm your account, then come back and sign in.
          </div>
          <div style={{ font: "400 12.5px 'Inter'", color: 'rgba(245,240,234,.4)', lineHeight: 1.5, marginBottom: 28 }}>
            Can’t find it? Check your spam folder.
          </div>

          <button
            onClick={resend}
            disabled={busy || resent}
            style={{
              width: '100%',
              background: resent ? 'rgba(255,255,255,.06)' : ACCENT,
              border: 'none',
              color: resent ? 'rgba(245,240,234,.6)' : '#1a1206',
              font: "700 15px 'Inter'",
              padding: 14,
              borderRadius: 12,
              cursor: busy || resent ? 'default' : 'pointer'
            }}
          >
            {resent ? 'Email sent ✓' : busy ? 'Sending…' : 'Resend verification email'}
          </button>

          <button
            onClick={onBack}
            style={{ background: 'none', border: 'none', color: ACCENT, font: "600 13px 'Inter'", cursor: 'pointer', padding: 8, marginTop: 18 }}
          >
            Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
}
