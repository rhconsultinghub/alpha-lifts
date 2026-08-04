import { useRef, useState } from 'react';
import type { ViewModel } from '../../state/viewModel';
import { useAuth } from '../../state/AuthContext';
import { parsePlanFile } from '../../data/planIO';

/** Friendly one-liner for the account's subscription. Kept trivial on purpose — real billing
 *  (and a Manage/Upgrade button) is a later phase; today accounts are 'free'/'none' by default,
 *  and 'active' is set on the user row when a subscription exists. */
function subscriptionLabel(plan: string, subStatus: string): string {
  if (subStatus === 'active') return plan === 'pro' ? 'Pro — subscription active' : 'Subscription active';
  if (subStatus === 'past_due') return 'Subscription past due';
  if (subStatus === 'canceled') return 'Subscription canceled';
  return 'Free plan';
}

export function SettingsModal({ vm }: { vm: ViewModel }) {
  const st = vm.settings;
  const auth = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const planFileRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState('');
  const [planError, setPlanError] = useState('');
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  if (!st.open) return null;

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setImportError('');
      st.stageBackupImport(parsed);
    } catch {
      setImportError('Could not read that file — make sure it’s an Alpha Lifts backup JSON file.');
    }
  };

  const handlePlanFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const plan = parsePlanFile(JSON.parse(await file.text()));
      setPlanError('');
      st.stagePlanImport(plan);
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not read that plan file.');
    }
  };

  const handleAiParse = async () => {
    const text = aiText.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setPlanError('');
    try {
      const plan = await st.parsePlanText(text);
      st.stagePlanImport(plan);
      setAiText('');
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Could not read that plan.');
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', zIndex: 30, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#17140f', borderRadius: '24px 24px 0 0', width: '100%', maxHeight: '86%', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        <div style={{ padding: '18px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="num" style={{ fontSize: 17, fontWeight: 700 }}>Settings</div>
          <button onClick={st.close} style={{ background: 'rgba(255,255,255,.08)', border: 'none', color: '#f5f0ea', width: 28, height: 28, borderRadius: '50%', fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: '16px 20px 24px' }}>
          {auth.configured && auth.account && (
            <>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>ACCOUNT</div>
              <div style={{ background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '14px', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {auth.account.email}
                    </div>
                    <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 3 }}>
                      {subscriptionLabel(auth.account.plan, auth.account.subStatus)}
                    </div>
                  </div>
                  <button
                    onClick={auth.logout}
                    style={{ flexShrink: 0, font: "600 12px 'Inter'", padding: '9px 16px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)' }}
                  >
                    Sign out
                  </button>
                </div>
                <div style={{ font: "400 10.5px 'Inter'", color: 'rgba(245,240,234,.35)', marginTop: 10, lineHeight: 1.5 }}>
                  Your training is synced to this account across devices.
                </div>
              </div>
            </>
          )}
          <button
            onClick={() => { st.close(); vm.openTutorial(); }}
            style={{ width: '100%', textAlign: 'left', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '13px 14px', color: '#f5f0ea', font: "600 13px 'Inter'", marginBottom: 24, display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <span style={{ fontSize: 17 }}>🧭</span>
            <span style={{ flex: 1 }}>Replay app tutorial</span>
            <span style={{ color: 'rgba(245,240,234,.4)', fontSize: 16 }}>›</span>
          </button>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>YOUR NAME</div>
          <input
            value={st.userName}
            onChange={e => st.setUserName(e.target.value)}
            placeholder="What should we call you?"
            autoCapitalize="words"
            style={{ width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: '13px 14px', color: '#f5f0ea', font: "600 13px 'Inter'", marginBottom: 6 }}
          />
          <div style={{ font: "400 10.5px/1.5 'Inter'", color: 'rgba(245,240,234,.35)', marginBottom: 24 }}>
            Used to greet you around the app and so your AI coach knows who it’s talking to. Leave it blank to keep things impersonal.
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>UNITS</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={st.setKg} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: st.unitsKgBg, color: st.unitsKgColor }}>Kilograms (kg)</button>
            <button onClick={st.setLb} style={{ flex: 1, font: "700 13px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: st.unitsLbBg, color: st.unitsLbColor }}>Pounds (lb)</button>
          </div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>PROGRAMS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
            {st.programsList.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <input
                    value={p.name}
                    onChange={e => p.rename(e.target.value)}
                    style={{ width: '100%', background: 'none', border: 'none', color: '#f5f0ea', font: "600 13px 'Inter'", padding: 0 }}
                  />
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{p.count} days</div>
                </div>
                {p.isActive && (
                  <span style={{ font: "600 11px 'Inter'", padding: '6px 12px', borderRadius: 100, background: 'oklch(0.7 0.15 145 / 0.15)', color: 'oklch(0.75 0.15 145)' }}>Active</span>
                )}
                {p.showSwitch && (
                  <button onClick={p.switchTo} style={{ font: "600 11px 'Inter'", padding: '8px 14px', borderRadius: 100, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)' }}>Switch</button>
                )}
                {p.showDelete && (
                  <button onClick={p.remove} style={{ font: "600 11px 'Inter'", padding: '8px 10px', borderRadius: 100, border: 'none', background: 'none', color: p.deleteColor }}>{p.deleteLabel}</button>
                )}
              </div>
            ))}
            <button onClick={st.newProgram} style={{ width: '100%', background: 'none', border: '1px dashed rgba(255,255,255,.25)', color: 'rgba(245,240,234,.6)', font: "600 12px 'Inter'", padding: 12, borderRadius: 14 }}>+ Duplicate as New Program</button>
            <button onClick={st.openWizard} style={{ width: '100%', background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', color: 'oklch(0.78 0.15 35)', font: "600 12px 'Inter'", padding: 12, borderRadius: 14 }}>+ Create New Program from Scratch</button>
          </div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>TRAINING PLAN</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 10 }}>Applies to your current program, {vm.programName}.</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
            {st.trainingTypes.map(tt => (
              <button key={tt.key} onClick={tt.select} style={{ textAlign: 'left', background: tt.rowBg, border: `1px solid ${tt.rowBorder}`, borderRadius: 14, padding: '12px 14px', display: 'flex', gap: 10 }}>
                <span style={{ color: tt.dotColor, fontSize: 14, lineHeight: 1.4 }}>{tt.dot}</span>
                <span>
                  <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>{tt.label}</div>
                  <div style={{ font: "400 11px/1.4 'Inter'", color: 'rgba(245,240,234,.5)', marginTop: 2 }}>{tt.desc}</div>
                </span>
              </button>
            ))}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>FEEL</div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Rest Pacing</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.restPacingDesc}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {st.restPacingOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Coach Voice</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.coachVoiceDesc}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {st.coachVoiceOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Warm-Up Style</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.warmupStyleDesc}</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            {st.warmupStyleOptions.map(o => (
              <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
            ))}
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>DELOAD WEEKS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>Auto Deloads</div>
              <div style={{ font: "400 11px/1.45 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{st.deload.desc}</div>
            </div>
            <button onClick={st.deload.toggle} style={{ flex: 'none', font: "600 12px 'Inter'", padding: '8px 14px', borderRadius: 10, border: 'none', background: st.deload.enabled ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)', color: st.deload.enabled ? '#0d0c0b' : 'rgba(245,240,234,.7)' }}>{st.deload.enabled ? 'On' : 'Off'}</button>
          </div>
          {st.deload.enabled && (
            <>
              {st.deload.statusText && (
                <div style={{ font: "400 11px/1.45 'Inter'", color: 'oklch(0.78 0.13 230)', background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.3)', borderRadius: 10, padding: '8px 10px', marginBottom: 10 }}>
                  {st.deload.statusText}
                </div>
              )}
              <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Max Weeks Without One</div>
              <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.deload.cadenceDesc}</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {st.deload.cadenceOptions.map(o => (
                  <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 11px 'Inter'", padding: 9, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
                ))}
              </div>
              <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Deload Intensity</div>
              <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>{st.deload.intensityDesc}</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {st.deload.intensityOptions.map(o => (
                  <button key={o.label} onClick={o.select} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: o.bg, color: o.color }}>{o.label}</button>
                ))}
              </div>
              <button
                onClick={st.deload.isActive ? st.deload.end : st.deload.start}
                style={{ width: '100%', font: "600 12px 'Inter'", padding: 11, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.75)', marginBottom: 24 }}
              >{st.deload.isActive ? 'End deload week now' : 'Start a deload week now'}</button>
            </>
          )}
          {!st.deload.enabled && <div style={{ marginBottom: 24 }} />}

          <div style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.75)', marginBottom: 4 }}>Rest Alerts</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>Sound and Vibrate only work while Alpha Lifts is the app you're actively looking at — that's a browser restriction, not a setting. Notify is the one that can still reach you if you've switched to another app during your rest period. Sound plays through media volume, so it ignores your phone's silent/vibrate switch.</div>
          {!st.vibrationSupported && (
            <div style={{ font: "400 11px/1.45 'Inter'", color: 'oklch(0.78 0.13 230)', background: 'oklch(0.7 0.13 230 / 0.1)', border: '1px solid oklch(0.7 0.13 230 / 0.3)', borderRadius: 10, padding: '8px 10px', marginBottom: 8 }}>
              This browser doesn't expose vibration to web apps, so Vibrate can't do anything here. Turn on Notify and leave the app in the background during rest — your phone's own notification settings will buzz it.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button onClick={st.toggleRestAlertSound} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: st.restAlertSound ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)', color: st.restAlertSound ? '#0d0c0b' : 'rgba(245,240,234,.7)' }}>{st.restAlertSound ? '🔊 Sound On' : '🔇 Sound Off'}</button>
            <button
              onClick={st.vibrationSupported ? st.toggleRestAlertVibrate : undefined}
              disabled={!st.vibrationSupported}
              style={{
                flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none',
                background: !st.vibrationSupported ? 'rgba(255,255,255,.03)' : st.restAlertVibrate ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)',
                color: !st.vibrationSupported ? 'rgba(245,240,234,.3)' : st.restAlertVibrate ? '#0d0c0b' : 'rgba(245,240,234,.7)'
              }}
            >{!st.vibrationSupported ? 'Vibrate N/A' : st.restAlertVibrate ? '📳 Vibrate On' : 'Vibrate Off'}</button>
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
            <button onClick={st.toggleRestAlertNotify} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: st.restAlertNotify ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.06)', color: st.restAlertNotify ? '#0d0c0b' : 'rgba(245,240,234,.7)' }}>{st.restAlertNotify ? '🔔 Notify On' : '🔕 Notify Off'}</button>
          </div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>REMINDERS</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,.04)', borderRadius: 14, padding: '12px 14px', marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>Workout Reminders</div>
              <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>Nudge me on training days I haven't logged yet.</div>
            </div>
            <button onClick={st.toggleReminders} style={{ font: "700 11px 'Inter'", padding: '8px 14px', borderRadius: 100, border: 'none', background: st.remindersEnabled ? 'oklch(0.65 0.19 35)' : 'rgba(255,255,255,.08)', color: st.remindersEnabled ? '#0d0c0b' : 'rgba(245,240,234,.6)' }}>{st.remindersEnabled ? 'On' : 'Off'}</button>
          </div>
          {st.remindersEnabled && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <span style={{ font: "500 12px 'Inter'", color: 'rgba(245,240,234,.6)' }}>Remind me at</span>
              <input type="time" value={st.reminderTime} onChange={e => st.setReminderTime(e.target.value)} style={{ background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#f5f0ea', font: "600 12px 'Inter'" }} />
            </div>
          )}
          {st.remindersEnabled && st.reminderPermissionDenied && (
            <div style={{ font: "500 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 6 }}>Notifications are blocked for this site in your browser — enable them in your browser settings for reminders to show.</div>
          )}
          <div style={{ font: "400 10px/1.4 'Inter'", color: 'rgba(245,240,234,.35)', marginBottom: 24 }}>This app has no backend, so reminders can only fire while Alpha Lifts is open in a tab — they won't arrive if the app has been fully closed all day.</div>

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>BACKUP</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 10 }}>All your data lives only on this device. Export a backup periodically, or before switching phones/browsers.</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button onClick={st.exportBackup} style={{ flex: 1, font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.08)', color: '#f5f0ea' }}>⬇ Export Backup</button>
            <button onClick={() => fileInputRef.current?.click()} style={{ flex: 1, font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.85)' }}>⬆ Import Backup</button>
            <input ref={fileInputRef} type="file" accept="application/json" onChange={handleFileChosen} style={{ display: 'none' }} />
          </div>
          {importError && (
            <div style={{ font: "500 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 6 }}>{importError}</div>
          )}
          {st.pendingBackupImport && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 14, borderRadius: 14, background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.8 0.15 35)' }}>Import this backup?</div>
                <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.75)', marginTop: 2 }}>This replaces everything currently in the app — programs, history, and settings — with the contents of this backup file.</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={st.confirmBackupImport} style={{ flex: 1, font: "700 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>Replace My Data</button>
                  <button onClick={st.cancelBackupImport} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.7)' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '24px 0 10px' }}>WORKOUT PLAN</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 10 }}>Export your current plan to share it or move it to another account, or import one. Importing switches to the new plan and saves your current one.</div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <button onClick={st.exportPlan} style={{ flex: 1, font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: 'rgba(255,255,255,.08)', color: '#f5f0ea' }}>⬇ Export Plan</button>
            <button onClick={() => planFileRef.current?.click()} style={{ flex: 1, font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.85)' }}>⬆ Import Plan</button>
            <input ref={planFileRef} type="file" accept="application/json" onChange={handlePlanFileChosen} style={{ display: 'none' }} />
          </div>

          {st.aiParseAvailable && (
            <div style={{ marginTop: 12 }}>
              <div style={{ font: "600 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 6 }}>✨ Paste a plan (Pro)</div>
              <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 8 }}>Paste a plan from anywhere — notes, a spreadsheet, a coach — and AI turns it into a plan you can import.</div>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                placeholder={'e.g.\nMonday – Push: Bench 4x8, Overhead Press 3x10...\nWednesday – Pull: Deadlift 3x5, Rows 4x10...'}
                rows={4}
                style={{ width: '100%', resize: 'vertical', font: "400 12px/1.5 'Inter'", color: '#f5f0ea', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 10, padding: 10, marginBottom: 8 }}
              />
              <button onClick={handleAiParse} disabled={aiBusy || !aiText.trim()} style={{ width: '100%', font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: 'none', background: aiBusy || !aiText.trim() ? 'rgba(255,255,255,.08)' : 'oklch(0.65 0.19 35)', color: aiBusy || !aiText.trim() ? 'rgba(245,240,234,.4)' : '#0d0c0b' }}>{aiBusy ? 'Reading your plan…' : 'Turn into a plan'}</button>
            </div>
          )}
          {planError && (
            <div style={{ font: "500 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginTop: 8 }}>{planError}</div>
          )}
          {st.pendingPlanImport && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 14, borderRadius: 14, background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.8 0.15 35)' }}>Import “{st.planImportName}”?</div>
                <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.75)', marginTop: 2 }}>This adds it as a new plan and switches to it. Your current plan is saved and stays available.</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={st.confirmPlanImport} style={{ flex: 1, font: "700 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>Import Plan</button>
                  <button onClick={st.cancelPlanImport} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.7)' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}

          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', margin: '24px 0 10px' }}>RESET</div>
          <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)', marginBottom: 10 }}>Erases everything on this device and starts over from onboarding — export a backup first if you want to keep anything.</div>
          <button onClick={st.requestResetApp} style={{ width: '100%', font: "700 12px 'Inter'", padding: 12, borderRadius: 12, border: '1px solid oklch(0.65 0.19 35 / 0.4)', background: 'none', color: 'oklch(0.72 0.17 35)' }}>Reset App</button>
          {st.confirmResetApp && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: 14, borderRadius: 14, background: 'oklch(0.65 0.19 35 / 0.12)', border: '1px solid oklch(0.65 0.19 35 / 0.4)', marginTop: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.8 0.15 35)' }}>Erase everything?</div>
                <div style={{ font: "400 12px/1.4 'Inter'", color: 'rgba(245,240,234,.75)', marginTop: 2 }}>This can't be undone. All programs, history, and settings on this device will be gone.</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={st.resetApp} style={{ flex: 1, font: "700 12px 'Inter'", padding: 10, borderRadius: 10, border: 'none', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>Erase Everything</button>
                  <button onClick={st.cancelResetApp} style={{ flex: 1, font: "600 12px 'Inter'", padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,.2)', background: 'none', color: 'rgba(245,240,234,.7)' }}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
