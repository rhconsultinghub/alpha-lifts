import { useState } from 'react';
import type { ViewModel } from '../state/viewModel';
import { ACCENT } from '../theme';

/**
 * First-run app tour — a brief, skippable sequence of cards explaining the main areas of the app,
 * with emphasis on where to build a plan (from scratch or a template). Shown after the onboarding
 * opt-out path (`vm.showTutorial`), and re-openable from Settings. Deliberately a card tour rather
 * than DOM-anchored coach-marks: it's robust to layout changes and reads cleanly on a phone. The
 * user can skip at any step; finishing or skipping marks it seen so it never forces itself again.
 */

const TEXT = '#f5f0ea';

interface TourStep {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    emoji: '👋',
    title: 'Welcome — here’s the quick tour',
    body: 'A few taps and you’ll know your way around. You can skip this anytime and revisit it later from Settings.'
  },
  {
    emoji: '🏋️',
    title: 'Program — your training home',
    body: 'This is your week. Tap a day to see its exercises and start a workout. To build or change a plan, open Settings (the ⚙ icon) → New Program — start from scratch or pick a ready-made template split (Push/Pull/Legs, Upper/Lower, Full Body, and more), then add or swap exercises however you like.'
  },
  {
    emoji: '📈',
    title: 'Progress — see it add up',
    body: 'Charts for every lift, estimated 1-rep maxes, personal records, a muscle-map of what you’re training, and a weekly consistency calendar. It all fills in as you log workouts.'
  },
  {
    emoji: '📚',
    title: 'Exercises — the full library',
    body: 'Browse or search 150+ exercises by name or muscle, each with a photo, how-to, and a tutorial video. You can also create your own custom exercises.'
  },
  {
    emoji: '🏅',
    title: 'Achievements — stay motivated',
    body: 'Earn badges and points for streaks, records, volume, and trying new things. There’s almost always one within reach.'
  },
  {
    emoji: '💬',
    title: 'Coach — your AI training partner',
    body: 'Ask about your lifts, form, recovery, or nutrition, and have the coach build or tweak your plan just by chatting. (A premium feature — everything else stays free.)'
  }
];

export function AppTutorial({ vm }: { vm: ViewModel }) {
  const [i, setI] = useState(0);
  if (!vm.showTutorial) return null;

  const step = STEPS[i];
  const isLast = i === STEPS.length - 1;
  const finish = () => vm.dismissTutorial();

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.72)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 380, background: '#17140f', border: '1px solid rgba(255,255,255,.1)', borderRadius: 22, padding: '26px 22px 20px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ font: "600 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.05em' }}>
            {i + 1} of {STEPS.length}
          </div>
          <button
            onClick={finish}
            style={{ background: 'none', border: 'none', color: 'rgba(245,240,234,.45)', font: "500 12px 'Inter'", padding: 0, cursor: 'pointer' }}
          >
            Skip tour
          </button>
        </div>

        <div key={i} style={{ animation: 'obFade .28s ease' }}>
          <style>{`@keyframes obFade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
          <div style={{ fontSize: 44, marginBottom: 14 }}>{step.emoji}</div>
          <div className="num" style={{ fontSize: 21, fontWeight: 700, color: TEXT, marginBottom: 10, lineHeight: 1.25 }}>{step.title}</div>
          <div style={{ font: "400 14px 'Inter'", color: 'rgba(245,240,234,.65)', lineHeight: 1.6 }}>{step.body}</div>
        </div>

        {/* dots */}
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', margin: '22px 0 18px' }}>
          {STEPS.map((_, idx) => (
            <div key={idx} style={{ width: idx === i ? 18 : 6, height: 6, borderRadius: 100, background: idx === i ? ACCENT : 'rgba(255,255,255,.18)', transition: 'width .2s' }} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {i > 0 && (
            <button
              onClick={() => setI(i - 1)}
              style={{ flex: '0 0 auto', background: 'none', border: '1px solid rgba(255,255,255,.16)', color: 'rgba(245,240,234,.7)', font: "600 14px 'Inter'", padding: '13px 18px', borderRadius: 12, cursor: 'pointer' }}
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setI(i + 1))}
            style={{ flex: 1, background: ACCENT, border: 'none', color: '#1a1206', font: "700 14px 'Inter'", padding: 13, borderRadius: 12, cursor: 'pointer' }}
          >
            {isLast ? 'Got it — let’s go' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
