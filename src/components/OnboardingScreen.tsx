import { useEffect, useRef, useState } from 'react';
import type { ViewModel } from '../state/viewModel';
import { SPLIT_PRESETS } from '../data/wizard';
import type { TrainingType } from '../data/types';
import {
  generateOnboardingPlan,
  type Diet,
  type Equipment,
  type Experience,
  type Goal,
  type OnboardingAnswers,
  type OnboardingPlan
} from '../state/onboarding';

/**
 * First-run onboarding, rebuilt as a guided, one-question-at-a-time flow that should feel like the
 * app is getting to know the user and building something for them. It collects a handful of answers
 * (name, units, experience, goal, days/week, equipment, eating goal), then calls the Worker's
 * /onboard endpoint to generate a tailored plan + a personal welcome (with a deterministic fallback
 * baked into generateOnboardingPlan, so this always completes even offline). The final program is
 * applied via vm.onboarding.finish, which reuses the same program builder the wizard uses.
 */

const ACCENT = '#f0752f';
const TEXT = '#f5f0ea';
const BG = '#0f0e0d';

type Step = 'intro' | 'basics' | 'experience' | 'goal' | 'days' | 'equipment' | 'diet' | 'generating' | 'reveal';

// The six answered steps, in order, for the progress bar.
const QUESTION_STEPS: Step[] = ['basics', 'experience', 'goal', 'days', 'equipment', 'diet'];

interface Option<T> {
  value: T;
  label: string;
  desc: string;
  emoji: string;
}

const EXPERIENCE_OPTS: Option<Experience>[] = [
  { value: 'beginner', label: 'New to this', desc: 'Just starting out, or back after a long break.', emoji: '🌱' },
  { value: 'intermediate', label: 'Some experience', desc: 'You’ve trained consistently for a while.', emoji: '💪' },
  { value: 'advanced', label: 'Experienced', desc: 'Years under the bar, you know your way around.', emoji: '🔥' }
];

const GOAL_OPTS: Option<Goal>[] = [
  { value: 'muscle', label: 'Build muscle', desc: 'Add size with a hypertrophy-focused plan.', emoji: '🏗️' },
  { value: 'strength', label: 'Get stronger', desc: 'Heavier lifts, lower reps, more power.', emoji: '🏋️' },
  { value: 'general', label: 'General fitness', desc: 'Feel good, stay healthy, look better.', emoji: '✨' },
  { value: 'endurance', label: 'Endurance', desc: 'Higher reps, more work capacity.', emoji: '🏃' }
];

const DAYS_OPTS: Option<number>[] = [
  { value: 3, label: '3 days', desc: 'Efficient — full-body or split with rest between.', emoji: '📅' },
  { value: 4, label: '4 days', desc: 'A balanced upper/lower rhythm.', emoji: '📅' },
  { value: 5, label: '5 days', desc: 'Higher frequency, more focused days.', emoji: '📅' },
  { value: 6, label: '6 days', desc: 'Maximum frequency for serious volume.', emoji: '📅' }
];

const EQUIPMENT_OPTS: Option<Equipment>[] = [
  { value: 'full_gym', label: 'Full gym', desc: 'Barbells, machines, dumbbells — the works.', emoji: '🏢' },
  { value: 'home_basic', label: 'Home setup', desc: 'Dumbbells, bands, maybe a bench or bar.', emoji: '🏠' },
  { value: 'minimal', label: 'Minimal', desc: 'Bodyweight and whatever’s on hand.', emoji: '🎒' }
];

const DIET_OPTS: Option<Diet>[] = [
  { value: 'build', label: 'Eating to build', desc: 'Fueling up to add muscle.', emoji: '🍗' },
  { value: 'lean', label: 'Leaning out', desc: 'Losing fat while keeping muscle.', emoji: '🥗' },
  { value: 'maintain', label: 'Maintaining', desc: 'Happy where I am, staying steady.', emoji: '⚖️' },
  { value: 'unsure', label: 'Not sure yet', desc: 'I could use some guidance here.', emoji: '🤔' }
];

const TRAINING_LABEL: Record<TrainingType, string> = {
  progressive_overload: 'Progressive Overload',
  strength: 'Strength',
  hit: 'High Intensity',
  endurance: 'Endurance',
  general: 'General Fitness'
};

export function OnboardingScreen({ vm }: { vm: ViewModel }) {
  const ob = vm.onboarding;
  const [step, setStep] = useState<Step>('intro');
  const [answers, setAnswers] = useState<Partial<OnboardingAnswers>>({ units: ob.units });
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);

  // Kick off generation exactly once when we enter the generating step.
  const generatingRef = useRef(false);
  useEffect(() => {
    if (step !== 'generating' || generatingRef.current) return;
    generatingRef.current = true;
    const full = answers as OnboardingAnswers;
    generateOnboardingPlan(full).then(p => {
      setPlan(p);
      setStep('reveal');
    });
  }, [step, answers]);

  function set<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K]) {
    setAnswers(a => ({ ...a, [key]: value }));
  }

  // Pick an option and advance to the next step. A tiny delay lets the selected highlight register
  // before the screen changes, so the choice feels acknowledged.
  function pickAndAdvance<K extends keyof OnboardingAnswers>(key: K, value: OnboardingAnswers[K], next: Step) {
    set(key, value);
    window.setTimeout(() => setStep(next), 160);
  }

  const questionIndex = QUESTION_STEPS.indexOf(step);
  const showProgress = questionIndex >= 0;

  return (
    <div style={{ position: 'absolute', inset: 0, background: BG, overflowY: 'auto', zIndex: 40, display: 'flex', flexDirection: 'column' }}>
      <style>{`@keyframes obFade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}`}</style>

      {showProgress && (
        <div style={{ padding: '20px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setStep(stepBack(step))}
            aria-label="Back"
            style={{ background: 'none', border: 'none', color: 'rgba(245,240,234,.5)', fontSize: 20, padding: 0, lineHeight: 1, flexShrink: 0 }}
          >
            ‹
          </button>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,.08)', borderRadius: 100, overflow: 'hidden' }}>
            <div style={{ width: `${((questionIndex + 1) / QUESTION_STEPS.length) * 100}%`, height: '100%', background: ACCENT, borderRadius: 100, transition: 'width .3s ease' }} />
          </div>
          <div style={{ font: "600 11px 'Inter'", color: 'rgba(245,240,234,.4)', flexShrink: 0 }}>
            {questionIndex + 1}/{QUESTION_STEPS.length}
          </div>
        </div>
      )}

      <div key={step} style={{ flex: 1, padding: '24px 20px 20px', display: 'flex', flexDirection: 'column', animation: 'obFade .28s ease' }}>
        {step === 'intro' && <Intro onStart={() => setStep('basics')} />}

        {step === 'basics' && (
          <BasicsStep
            name={answers.name ?? ''}
            units={answers.units ?? ob.units}
            onName={n => set('name', n)}
            onUnits={u => { set('units', u); ob.setUnits(u); }}
            onContinue={() => setStep('experience')}
          />
        )}

        {step === 'experience' && (
          <QuestionStep
            title="How much lifting experience do you have?"
            subtitle="This tunes how much we start you with."
            options={EXPERIENCE_OPTS}
            selected={answers.experience}
            onPick={v => pickAndAdvance('experience', v, 'goal')}
          />
        )}

        {step === 'goal' && (
          <QuestionStep
            title="What’s your main goal right now?"
            subtitle="We’ll shape the whole plan around this."
            options={GOAL_OPTS}
            selected={answers.goal}
            onPick={v => pickAndAdvance('goal', v, 'days')}
          />
        )}

        {step === 'days' && (
          <QuestionStep
            title="How many days a week can you train?"
            subtitle="Be honest — consistency beats ambition."
            options={DAYS_OPTS}
            selected={answers.days}
            onPick={v => pickAndAdvance('days', v, 'equipment')}
          />
        )}

        {step === 'equipment' && (
          <QuestionStep
            title="What equipment do you have?"
            subtitle="So your plan fits where you actually train."
            options={EQUIPMENT_OPTS}
            selected={answers.equipment}
            onPick={v => pickAndAdvance('equipment', v, 'diet')}
          />
        )}

        {step === 'diet' && (
          <QuestionStep
            title="How are you eating right now?"
            subtitle="We’ll add a little nutrition guidance to your plan."
            options={DIET_OPTS}
            selected={answers.diet}
            onPick={v => pickAndAdvance('diet', v, 'generating')}
          />
        )}

        {step === 'generating' && <GeneratingStep name={answers.name ?? ''} />}

        {step === 'reveal' && plan && (
          <RevealStep
            plan={plan}
            units={answers.units ?? ob.units}
            days={answers.days ?? 3}
            onEnter={() =>
              ob.finish({
                name: plan.name,
                trainingType: plan.trainingType,
                splitId: plan.splitId,
                welcome: plan.welcome,
                profile: {
                  experience: answers.experience ?? 'intermediate',
                  goal: answers.goal ?? 'general',
                  days: answers.days ?? 3,
                  equipment: answers.equipment ?? 'full_gym',
                  diet: answers.diet ?? 'maintain'
                }
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function stepBack(step: Step): Step {
  const order: Step[] = ['intro', 'basics', 'experience', 'goal', 'days', 'equipment', 'diet'];
  const i = order.indexOf(step);
  return i > 0 ? order[i - 1] : 'intro';
}

// --- steps ----------------------------------------------------------------------------------

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ fontSize: 52, marginBottom: 18 }}>🏋️</div>
      <div className="num" style={{ fontSize: 32, fontWeight: 800, color: TEXT, letterSpacing: '-.02em', marginBottom: 12 }}>
        Welcome to Alpha Lifts
      </div>
      <div style={{ font: "400 15px 'Inter'", color: 'rgba(245,240,234,.6)', lineHeight: 1.55, maxWidth: 320, margin: '0 auto 8px' }}>
        Answer a few quick questions and we’ll build a training plan made just for you — your goals,
        your schedule, your setup.
      </div>
      <div style={{ font: "400 13px 'Inter'", color: 'rgba(245,240,234,.35)', marginBottom: 34 }}>
        Takes about a minute.
      </div>
      <PrimaryButton onClick={onStart}>Let’s build your plan →</PrimaryButton>
    </div>
  );
}

function BasicsStep({
  name,
  units,
  onName,
  onUnits,
  onContinue
}: {
  name: string;
  units: 'kg' | 'lb';
  onName: (n: string) => void;
  onUnits: (u: 'kg' | 'lb') => void;
  onContinue: () => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <StepHeading title="First, the basics" subtitle="So your plan feels like yours." />

      <label style={labelStyle} htmlFor="ob-name">WHAT SHOULD WE CALL YOU?</label>
      <input
        id="ob-name"
        value={name}
        onChange={e => onName(e.target.value)}
        placeholder="Your name"
        autoCapitalize="words"
        style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: TEXT, font: "600 16px 'Inter'", padding: '13px 14px', borderRadius: 12, boxSizing: 'border-box', marginBottom: 24 }}
      />

      <label style={labelStyle}>PREFERRED UNITS</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <SelectPill active={units === 'kg'} onClick={() => onUnits('kg')} label="Kilograms (kg)" />
        <SelectPill active={units === 'lb'} onClick={() => onUnits('lb')} label="Pounds (lb)" />
      </div>

      <div style={{ flex: 1 }} />
      <PrimaryButton onClick={onContinue}>Continue →</PrimaryButton>
    </div>
  );
}

function QuestionStep<T extends string | number>({
  title,
  subtitle,
  options,
  selected,
  onPick
}: {
  title: string;
  subtitle: string;
  options: Option<T>[];
  selected: T | undefined;
  onPick: (v: T) => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <StepHeading title={title} subtitle={subtitle} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {options.map(o => {
          const active = selected === o.value;
          return (
            <button
              key={String(o.value)}
              onClick={() => onPick(o.value)}
              style={{
                textAlign: 'left',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '15px 16px',
                borderRadius: 16,
                background: active ? 'rgba(240,117,47,.14)' : 'rgba(255,255,255,.04)',
                border: `1.5px solid ${active ? ACCENT : 'rgba(255,255,255,.08)'}`,
                transition: 'background .15s, border-color .15s'
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{o.emoji}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', font: "700 15px 'Inter'", color: TEXT }}>{o.label}</span>
                <span style={{ display: 'block', font: "400 12.5px 'Inter'", color: 'rgba(245,240,234,.5)', marginTop: 2, lineHeight: 1.4 }}>{o.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function GeneratingStep({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0];
  const [msgIndex, setMsgIndex] = useState(0);
  const messages = [
    'Reading your answers…',
    'Choosing the right split for you…',
    'Balancing your weekly volume…',
    first ? `Putting it all together, ${first}…` : 'Putting it all together…'
  ];
  useEffect(() => {
    const id = window.setInterval(() => setMsgIndex(i => Math.min(i + 1, messages.length - 1)), 1400);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <div style={{ width: 54, height: 54, borderRadius: '50%', border: `3px solid rgba(255,255,255,.1)`, borderTopColor: ACCENT, animation: 'obSpin 0.9s linear infinite', marginBottom: 26 }} />
      <style>{`@keyframes obSpin{to{transform:rotate(360deg)}}`}</style>
      <div className="num" style={{ fontSize: 22, fontWeight: 700, color: TEXT, marginBottom: 10 }}>Building your plan</div>
      <div key={msgIndex} style={{ font: "400 14px 'Inter'", color: 'rgba(245,240,234,.55)', animation: 'obFade .4s ease', minHeight: 20 }}>
        {messages[msgIndex]}
      </div>
    </div>
  );
}

function RevealStep({
  plan,
  units,
  days,
  onEnter
}: {
  plan: OnboardingPlan;
  units: 'kg' | 'lb';
  days: number;
  onEnter: () => void;
}) {
  const splitLabel = SPLIT_PRESETS.find(p => p.id === plan.splitId)?.label ?? 'Custom plan';
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🎉</div>
        <div className="num" style={{ fontSize: 26, fontWeight: 800, color: TEXT }}>Your plan is ready</div>
      </div>

      <div style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 18, padding: '18px 18px', marginBottom: 18 }}>
        <div style={{ font: "700 17px 'Inter'", color: TEXT, marginBottom: 12 }}>{plan.name}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <SummaryChip label={splitLabel} />
          <SummaryChip label={`${days} days / week`} />
          <SummaryChip label={TRAINING_LABEL[plan.trainingType]} />
          <SummaryChip label={units.toUpperCase()} />
        </div>
      </div>

      <div style={{ font: "400 14.5px 'Inter'", color: 'rgba(245,240,234,.78)', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 20 }}>
        {plan.welcome}
      </div>

      <div style={{ flex: 1, minHeight: 12 }} />
      <PrimaryButton onClick={onEnter}>Enter Alpha Lifts →</PrimaryButton>
      <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.35)', textAlign: 'center', marginTop: 12 }}>
        You can change any of this later in Settings.
      </div>
    </div>
  );
}

// --- shared bits ----------------------------------------------------------------------------

const labelStyle: React.CSSProperties = {
  display: 'block',
  font: "600 11px 'Inter'",
  letterSpacing: '.05em',
  color: 'rgba(245,240,234,.45)',
  marginBottom: 9
};

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="num" style={{ fontSize: 23, fontWeight: 700, color: TEXT, lineHeight: 1.25, letterSpacing: '-.01em' }}>{title}</div>
      <div style={{ font: "400 13.5px 'Inter'", color: 'rgba(245,240,234,.5)', marginTop: 7, lineHeight: 1.45 }}>{subtitle}</div>
    </div>
  );
}

function PrimaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ width: '100%', background: ACCENT, border: 'none', color: '#1a1206', font: "700 15px 'Inter'", padding: 15, borderRadius: 14, cursor: 'pointer' }}
    >
      {children}
    </button>
  );
}

function SelectPill({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        font: "700 13px 'Inter'",
        padding: 13,
        borderRadius: 12,
        border: `1.5px solid ${active ? ACCENT : 'rgba(255,255,255,.1)'}`,
        background: active ? 'rgba(240,117,47,.14)' : 'rgba(255,255,255,.04)',
        color: active ? TEXT : 'rgba(245,240,234,.6)'
      }}
    >
      {label}
    </button>
  );
}

function SummaryChip({ label }: { label: string }) {
  return (
    <span style={{ font: "600 12px 'Inter'", color: 'rgba(245,240,234,.85)', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 100, padding: '6px 12px' }}>
      {label}
    </span>
  );
}
