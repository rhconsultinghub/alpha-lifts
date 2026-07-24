import { useEffect, useRef, useState } from 'react';
import type { ViewModel } from '../state/viewModel';

const ACCENT = 'oklch(0.65 0.19 35)';

export function CoachScreen({ vm }: { vm: ViewModel }) {
  const c = vm.coach;
  const endRef = useRef<HTMLDivElement>(null);

  // Probe entitlement whenever the tab opens, so a non-subscriber sees the locked screen upfront
  // rather than discovering it on their first send. Runs once per mount.
  useEffect(() => {
    if (c.configured) c.refreshEntitlement();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pin to the newest message on every change, including while the typing indicator is up —
  // otherwise a long reply pushes itself out of view as it arrives.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [c.messages.length, c.pending]);

  if (!c.configured) {
    return (
      <div style={{ padding: '24px 20px 100px' }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Coach</div>
        <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 16, padding: 18, marginTop: 20 }}>
          <div style={{ font: "600 14px 'Inter'", marginBottom: 8 }}>Coach isn’t set up yet</div>
          <div style={{ font: "400 13px 'Inter'", color: 'rgba(245,240,234,.55)', lineHeight: 1.5 }}>
            This build has no <code>VITE_COACH_API_URL</code> configured, so there’s no backend to
            talk to. See <code>worker/README.md</code> for the setup steps.
          </div>
        </div>
      </div>
    );
  }

  if (c.locked) {
    return <CoachLockedScreen id={c.deviceId} />;
  }

  return (
    <div style={{ padding: '24px 20px 100px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>Coach</div>
        {c.hasMessages && (
          <button
            onClick={c.clear}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(245,240,234,.55)', font: "500 11px 'Inter'", padding: '6px 12px', borderRadius: 100 }}
          >
            Clear
          </button>
        )}
      </div>
      <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 20 }}>
        Ask about your program, your lifts, or training in general.
      </div>

      {c.isEmpty && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>
            TRY ASKING
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {c.suggestions.map(s => (
              <button
                key={s}
                onClick={() => c.useSuggestion(s)}
                style={{ textAlign: 'left', background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 14, padding: '12px 14px', color: '#f5f0ea', font: "400 13px 'Inter'" }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {c.messages.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.isUser ? 'flex-end' : 'flex-start', gap: 8 }}>
            <div
              style={{
                maxWidth: '85%',
                padding: '11px 14px',
                borderRadius: 16,
                // User turns get the accent; the coach gets a neutral card. An error reuses the
                // coach's position but a red-tinted surface, so a failure never reads as advice.
                background: m.isUser ? ACCENT : m.isError ? 'rgba(220,80,60,.12)' : 'rgba(255,255,255,.06)',
                color: m.isUser ? '#0d0c0b' : m.isError ? 'oklch(0.72 0.16 25)' : '#f5f0ea',
                font: "400 14px 'Inter'",
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap'
              }}
            >
              {m.text}
            </div>
            {m.proposals.map((p, i) => (
              <ProposalCard key={i} p={p} />
            ))}
          </div>
        ))}

        {c.pending && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '11px 14px', borderRadius: 16, background: 'rgba(255,255,255,.06)', color: 'rgba(245,240,234,.45)', font: "400 14px 'Inter'" }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20, position: 'sticky', bottom: 0 }}>
        <input
          value={c.input}
          onChange={e => c.setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && c.canSend) c.send(); }}
          placeholder="Ask about your training…"
          style={{ flex: 1, minWidth: 0, background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "400 14px 'Inter'", padding: '12px 14px', borderRadius: 14 }}
        />
        <button
          onClick={c.send}
          disabled={!c.canSend}
          style={{
            background: c.canSend ? ACCENT : 'rgba(255,255,255,.06)',
            color: c.canSend ? '#0d0c0b' : 'rgba(245,240,234,.3)',
            border: 'none', borderRadius: 14, padding: '0 18px', font: "600 14px 'Inter'"
          }}
        >
          Send
        </button>
      </div>

      <CoachIdFooter id={c.deviceId} />
    </div>
  );
}

// Shows the device's Coach ID so it can be shared to be added to the access allowlist. Purely
// informational (and only useful once the allowlist is enforced) — kept small and muted.
function CoachIdFooter({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard?.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, font: "400 11px 'Inter'", color: 'rgba(245,240,234,.35)' }}>
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        Coach ID: {id}
      </span>
      <button
        onClick={copy}
        style={{ flexShrink: 0, background: 'none', border: '1px solid rgba(255,255,255,.12)', color: 'rgba(245,240,234,.55)', font: "500 10px 'Inter'", padding: '3px 9px', borderRadius: 100 }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

// Displayed subscription price. Single source of truth for the copy — checkout wiring (Stripe on
// web, IAP in the store builds) is a later phase; keep this in sync with the real price/plan then.
const PREMIUM_PRICE = '$5';
const PREMIUM_PERIOD = 'month';

// Shown when the Worker reports this device isn't entitled to the coach. This is the premium
// upsell / "you need to subscribe" screen. The Subscribe button shows the price but is inert for
// now — there's no checkout yet, so the actionable path in this private phase is sharing the Coach
// ID to be approved on the allowlist. When payments land, wire the button's onClick to checkout
// and drop the "Getting access" block. The rest of the app stays fully usable — only this is gated.
function CoachLockedScreen({ id }: { id: string }) {
  const FEATURES = [
    'Ask about your lifts, form, and recovery',
    'Get your stats and progress explained',
    'Add, swap, or remove exercises just by asking',
    'Build a whole training plan from a chat'
  ];
  return (
    <div style={{ padding: '24px 20px 100px', display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div className="num" style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Coach</div>

      <div style={{ marginTop: 24, background: 'rgba(255,255,255,.04)', border: `1px solid ${ACCENT}`, borderRadius: 20, padding: '22px 20px' }}>
        <div style={{ fontSize: 30, marginBottom: 10 }}>🔒</div>
        <div style={{ font: "700 20px 'Inter'", color: '#f5f0ea', marginBottom: 8 }}>The AI Coach is a Premium feature</div>
        <div style={{ font: "400 14px 'Inter'", color: 'rgba(245,240,234,.6)', lineHeight: 1.5 }}>
          Everything else in Alpha Lifts stays free — your programs, workouts, history, and progress.
          Premium unlocks the AI coach:
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginTop: 16 }}>
          {FEATURES.map(f => (
            <div key={f} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ color: ACCENT, font: "600 14px 'Inter'", lineHeight: 1.4 }}>✓</span>
              <span style={{ font: "400 13px 'Inter'", color: '#f5f0ea', lineHeight: 1.4 }}>{f}</span>
            </div>
          ))}
        </div>

        {/* Price + Subscribe. Inert until checkout exists (disabled), but shows the plan so the
            offer is clear. Becomes the live checkout entry point in the payments phase. */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ font: "700 24px 'Inter'", color: '#f5f0ea' }}>
            {PREMIUM_PRICE}<span style={{ font: "500 14px 'Inter'", color: 'rgba(245,240,234,.55)' }}> / {PREMIUM_PERIOD}</span>
          </div>
          <button
            disabled
            style={{
              width: '100%', marginTop: 4, background: ACCENT, opacity: 0.5, color: '#0d0c0b',
              border: 'none', borderRadius: 14, padding: '13px 0', font: "700 15px 'Inter'"
            }}
          >
            Subscribe
          </button>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}>Coming soon</div>
        </div>

        <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 18 }}>
          <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea', marginBottom: 6 }}>Get access now</div>
          <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.5)', lineHeight: 1.5, marginBottom: 12 }}>
            Subscriptions aren’t open yet — the coach is in private testing. Share the Coach ID below
            to be added to the access list.
          </div>
          <CoachIdFooter id={id} />
        </div>
      </div>
    </div>
  );
}

type ProposalVM = ViewModel['coach']['messages'][number]['proposals'][number];

/**
 * A confirm-and-apply card under a coach turn. Three states: pending (Apply / Dismiss), applied
 * (✓ Applied), dismissed (greyed, "Dismissed"). An unresolvable proposal (`applicable === false`)
 * shows its error and only a Dismiss button — there's nothing to apply.
 */
function ProposalCard({ p }: { p: ProposalVM }) {
  const done = p.status !== 'pending';
  return (
    <div
      style={{
        maxWidth: '85%',
        alignSelf: 'flex-start',
        border: `1px solid ${p.status === 'applied' ? 'rgba(120,200,120,.35)' : 'rgba(255,255,255,.12)'}`,
        background: p.error ? 'rgba(220,80,60,.08)' : 'rgba(255,255,255,.03)',
        borderRadius: 14,
        padding: '12px 14px',
        opacity: p.status === 'dismissed' ? 0.5 : 1
      }}
    >
      <div style={{ font: "500 13px 'Inter'", color: p.error ? 'oklch(0.72 0.16 25)' : '#f5f0ea', lineHeight: 1.45 }}>
        {p.error ? `Couldn’t do that: ${p.error}` : p.summary}
      </div>

      {p.status === 'applied' && (
        <div style={{ marginTop: 8, font: "600 12px 'Inter'", color: 'oklch(0.72 0.16 145)' }}>✓ Applied</div>
      )}
      {p.status === 'dismissed' && (
        <div style={{ marginTop: 8, font: "500 12px 'Inter'", color: 'rgba(245,240,234,.5)' }}>Dismissed</div>
      )}

      {!done && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {p.applicable && (
            <button
              onClick={p.apply}
              style={{ background: ACCENT, color: '#0d0c0b', border: 'none', borderRadius: 100, padding: '7px 16px', font: "600 12px 'Inter'" }}
            >
              Apply
            </button>
          )}
          <button
            onClick={p.dismiss}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.14)', color: 'rgba(245,240,234,.6)', borderRadius: 100, padding: '7px 16px', font: "500 12px 'Inter'" }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
