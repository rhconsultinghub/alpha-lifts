/**
 * Email verification — sending via Resend + token helpers.
 *
 * The whole verification feature is GATED on `RESEND_API_KEY` being set. When it's absent the app
 * behaves exactly as before (signup verifies instantly, no email), so a deploy without Resend
 * configured still works — verification only switches on once the key exists. This mirrors how the
 * coach/accounts degrade when their config is missing.
 *
 * Resend setup (owner, one-time):
 *   1. Create a free account at resend.com and add + verify a sending domain (or use their test
 *      sender for now).
 *   2. `npx wrangler secret put RESEND_API_KEY`  (from the Resend dashboard)
 *   3. Set `RESEND_FROM` in wrangler.toml to a verified sender, e.g.
 *      "Alpha Lifts <noreply@yourdomain.com>". Until a domain is verified, Resend only delivers to
 *      your own address via "onboarding@resend.dev".
 */

export interface EmailEnv {
  RESEND_API_KEY?: string;
  /** Verified sender, e.g. "Alpha Lifts <noreply@yourdomain.com>". */
  RESEND_FROM?: string;
}

/** Verification is active only when a Resend key is configured. */
export function verificationEnabled(env: EmailEnv): boolean {
  return !!env.RESEND_API_KEY;
}

function base64url(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

/** A fresh single-use verification token + its expiry (epoch ms). */
export function newVerifyToken(): { token: string; expires: number } {
  return { token: base64url(crypto.getRandomValues(new Uint8Array(32))), expires: Date.now() + TOKEN_TTL_MS };
}

function emailHtml(verifyUrl: string): string {
  // Inline styles only — email clients strip <style>/external CSS.
  return `<!doctype html><html><body style="margin:0;background:#0f0e0d;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
  <div style="max-width:480px;margin:0 auto;padding:40px 24px;color:#f5f0ea">
    <div style="font-size:22px;font-weight:800;letter-spacing:-.02em;margin-bottom:8px">Alpha Lifts</div>
    <div style="font-size:15px;line-height:1.6;color:#c9c3ba;margin-bottom:28px">
      Thanks for signing up. Confirm your email to activate your account and start training.
    </div>
    <a href="${verifyUrl}" style="display:inline-block;background:#f0752f;color:#1a1206;text-decoration:none;font-weight:700;font-size:15px;padding:13px 26px;border-radius:12px">Verify my email</a>
    <div style="font-size:12px;line-height:1.6;color:#8a857d;margin-top:28px">
      If the button doesn't work, paste this link into your browser:<br>
      <span style="color:#c9c3ba;word-break:break-all">${verifyUrl}</span>
    </div>
    <div style="font-size:12px;color:#6b665f;margin-top:24px">
      This link expires in 24 hours. If you didn't create an Alpha Lifts account, you can ignore this email.
    </div>
  </div></body></html>`;
}

/**
 * Send the verification email. Returns true on a successful hand-off to Resend, false on any
 * failure (missing key, network, Resend error). Callers decide how to handle a false — signup
 * still creates the (unverified) account so the user can trigger a resend.
 */
export async function sendVerificationEmail(env: EmailEnv, to: string, verifyUrl: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  const from = env.RESEND_FROM || 'Alpha Lifts <onboarding@resend.dev>';
  // Bound the request so a slow/unreachable Resend can never stall the signup response — the account
  // is created regardless and the user can resend if the mail didn't go out.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: 'Verify your email for Alpha Lifts',
        html: emailHtml(verifyUrl)
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      console.error('Resend send failed', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('Resend send error', err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
