import { useEffect, useRef } from 'react';
import type { ViewModel } from '../state/viewModel';

const ACCENT = 'oklch(0.65 0.19 35)';

export function CoachScreen({ vm }: { vm: ViewModel }) {
  const c = vm.coach;
  const endRef = useRef<HTMLDivElement>(null);

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
          <div key={m.id} style={{ display: 'flex', justifyContent: m.isUser ? 'flex-end' : 'flex-start' }}>
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
    </div>
  );
}
