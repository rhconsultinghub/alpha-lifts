import { Fragment, type CSSProperties } from 'react';
import type { ViewModel } from '../state/viewModel';

const SECTION_LABEL: CSSProperties = { font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em' };
const CARD: CSSProperties = { background: 'rgba(255,255,255,.03)', borderRadius: 14, padding: 14, marginBottom: 26 };

export function ProgressScreen({ vm }: { vm: ViewModel }) {
  const bw = vm.bodyWeight as any;
  const vc = vm.volumeChart as any;
  const heat = vm.weeklyHeatmap as any;
  const ep = vm.exerciseProgress as any;
  const cl = vm.compareLifts as any;
  const cons = vm.consistency as any;
  const donut = vm.volumeDonut as any;
  const dur = vm.durationTrend as any;

  return (
    <>
      <div style={{ padding: '24px 20px 0' }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 700, marginBottom: 4 }}>Progress</div>
        <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 22 }}>Analytics on your training over time.</div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>BODY WEIGHT</div>
          {bw.hasData && <div style={{ font: "600 11px 'Inter'", color: 'oklch(0.72 0.17 35)' }}>{bw.latestText}</div>}
        </div>
        <div style={CARD}>
          <div style={{ display: 'flex', gap: 8, marginBottom: bw.hasData ? 10 : 0 }}>
            <input
              type="number" value={bw.inputValue} onChange={e => bw.setInput(e.target.value)}
              placeholder={`Log weight (${bw.unitsLabel.toLowerCase()})`}
              style={{ flex: 1, background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 10, padding: '10px 12px', color: '#f5f0ea', font: "600 13px 'Inter'" }}
            />
            <button onClick={bw.log} style={{ font: "700 12px 'Inter'", padding: '0 16px', borderRadius: 10, border: 'none', background: 'oklch(0.65 0.19 35)', color: '#0d0c0b' }}>Log</button>
          </div>
          {bw.hasData ? (
            <>
              <svg viewBox="0 0 280 110" style={{ width: '100%', height: 90, display: 'block' }}>
                <polyline points={bw.linePoints} fill="none" stroke="oklch(0.65 0.19 35)" strokeWidth={2} />
                {bw.points.map((pt: any, i: number) => <circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill="oklch(0.65 0.19 35)" />)}
              </svg>
              <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 4 }}>{bw.deltaText}</div>
            </>
          ) : (
            <div style={{ padding: '10px 0 2px', textAlign: 'center', font: "400 12px 'Inter'", color: 'rgba(245,240,234,.4)' }}>Log your weight to start a trend.</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>VOLUME TREND</div>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.45)' }}>avg {vc.avgText}</div>
        </div>
        <div style={CARD}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10, height: 100 }}>
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: `${vc.avgLinePct}%`, borderTop: '1px dashed rgba(245,240,234,.3)' }} />
            {vc.bars.map((v: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 6, position: 'relative' }}>
                <div style={{ font: "600 9px 'Inter'", color: v.deltaColor }}>{v.deltaText}</div>
                <div style={{ width: '100%', maxWidth: 28, borderRadius: '6px 6px 2px 2px', background: 'oklch(0.65 0.19 35)', height: `${v.pct}%` }} />
                <div style={{ font: "500 9px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{v.day}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={SECTION_LABEL}>WEEKLY MUSCLE-VOLUME HEATMAP</div>
        <div style={{ ...CARD, overflowX: 'auto', marginTop: 8 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `70px repeat(${heat.cols.length},1fr)`, gap: 4, minWidth: 280 }}>
            <div />
            {heat.cols.map((c: any, i: number) => (
              <div key={i} style={{ font: "500 8px 'Inter'", color: 'rgba(245,240,234,.35)', textAlign: 'center' }}>{c.label}</div>
            ))}
            {heat.rows.map((row: any, ri: number) => (
              <Fragment key={ri}>
                <div style={{ font: "500 9px 'Inter'", color: 'rgba(245,240,234,.6)', display: 'flex', alignItems: 'center' }}>{row.muscle}</div>
                {row.cells.map((cell: any, ci: number) => (
                  <div key={ri + '-' + ci} style={{ aspectRatio: '1', borderRadius: 4, background: cell.bg }} />
                ))}
              </Fragment>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 10, font: "500 9px 'Inter'", color: 'rgba(245,240,234,.4)' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'oklch(0.55 0.12 230 / 0.6)', marginRight: 4 }} />Under</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'oklch(0.62 0.14 145 / 0.6)', marginRight: 4 }} />On target</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'oklch(0.62 0.18 35 / 0.6)', marginRight: 4 }} />Over</span>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>EXERCISE PROGRESS</div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={vm.setProgressMetricWeight} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: 'none', background: vm.progressMetricWeightBg, color: vm.progressMetricWeightColor }}>Weight</button>
            <button onClick={vm.setProgressMetricE1rm} style={{ font: "600 10px 'Inter'", padding: '4px 9px', borderRadius: 100, border: 'none', background: vm.progressMetricE1rmBg, color: vm.progressMetricE1rmColor }}>Est. 1RM</button>
          </div>
        </div>
        <button onClick={vm.toggleProgressPicker} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', marginBottom: vm.progressPickerOpen ? 8 : 12 }}>
          <span style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>{ep.selectedName}</span>
          <span style={{ color: 'rgba(245,240,234,.5)', fontSize: 12, transform: vm.progressPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </button>
        {vm.progressPickerOpen && (
          <div style={{ maxHeight: 260, overflowY: 'auto', background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: 10, marginBottom: 12 }}>
            {ep.pickerGroups.map((g: any) => (
              <div key={g.muscle} style={{ marginBottom: 10 }}>
                <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.35)', letterSpacing: '.04em', marginBottom: 6 }}>{g.muscle.toUpperCase()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.items.map((it: any) => (
                    <button key={it.id} onClick={it.select} style={{ font: "600 11px 'Inter'", padding: '6px 10px', borderRadius: 100, border: 'none', background: it.isSelected ? 'oklch(0.65 0.19 35)' : it.hasHistory ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)', color: it.isSelected ? '#0d0c0b' : it.hasHistory ? 'rgba(245,240,234,.85)' : 'rgba(245,240,234,.45)' }}>{it.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div style={{ font: "600 14px 'Inter'" }}>{ep.selectedName}</div>
            <div style={{ font: "600 12px 'Inter'", color: 'oklch(0.72 0.17 35)' }}>{ep.deltaText}</div>
          </div>
          {ep.hasData && (
            <>
              <svg viewBox="0 0 280 110" style={{ width: '100%', height: 110, display: 'block' }}>
                <polyline points={ep.linePoints} fill="none" stroke="oklch(0.65 0.19 35)" strokeWidth={2} />
                {ep.points.map((pt: any, i: number) => <circle key={i} cx={pt.x} cy={pt.y} r={3.5} fill="oklch(0.65 0.19 35)" />)}
              </svg>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {ep.points.map((pt: any, i: number) => <div key={i} style={{ flex: 1, textAlign: 'center', font: "500 9px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{pt.date}</div>)}
              </div>
            </>
          )}
          {ep.empty && (
            <div style={{ padding: '20px 0', textAlign: 'center', font: "400 12px 'Inter'", color: 'rgba(245,240,234,.4)' }}>No sessions logged yet — complete a workout with this exercise to start a trend.</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>COMPARE LIFTS</div>
          <div style={{ font: "400 10px 'Inter'", color: 'rgba(245,240,234,.35)' }}>% change since first log · up to 3</div>
        </div>
        <button onClick={vm.toggleCompareLiftPicker} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, padding: '10px 14px', marginBottom: vm.compareLiftPickerOpen ? 8 : 10 }}>
          <span style={{ font: "600 13px 'Inter'", color: '#f5f0ea' }}>{cl.selectedCount ? cl.selectedCount + ' selected' : 'Select lifts to compare'}</span>
          <span style={{ color: 'rgba(245,240,234,.5)', fontSize: 12, transform: vm.compareLiftPickerOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
        </button>
        {cl.limitHit && (
          <div style={{ font: "500 11px 'Inter'", color: 'oklch(0.72 0.17 35)', marginBottom: 10 }}>Already comparing 3 lifts — deselect one first to add another.</div>
        )}
        {vm.compareLiftPickerOpen && (
          <div style={{ maxHeight: 260, overflowY: 'auto', background: 'rgba(255,255,255,.03)', borderRadius: 12, padding: 10, marginBottom: 12 }}>
            {cl.pickerGroups.map((g: any) => (
              <div key={g.muscle} style={{ marginBottom: 10 }}>
                <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.35)', letterSpacing: '.04em', marginBottom: 6 }}>{g.muscle.toUpperCase()}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {g.items.map((it: any) => (
                    <button key={it.id} onClick={it.toggle} style={{ font: "600 11px 'Inter'", padding: '6px 10px', borderRadius: 100, border: 'none', background: it.isSelected ? it.color : it.hasHistory ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.04)', color: it.isSelected ? '#0d0c0b' : it.hasHistory ? 'rgba(245,240,234,.85)' : 'rgba(245,240,234,.45)' }}>{it.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div style={CARD}>
          {cl.hasData ? (
            <>
              <svg viewBox="0 0 280 110" style={{ width: '100%', height: 110, display: 'block' }}>
                <line x1={10} y1={55} x2={270} y2={55} stroke="rgba(245,240,234,.2)" strokeDasharray="3,3" />
                {cl.lines.map((ln: any, i: number) => <polyline key={i} points={ln.linePoints} fill="none" stroke={ln.color} strokeWidth={2} />)}
              </svg>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                {cl.lines.map((ln: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, font: "600 11px 'Inter'" }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: ln.color }} />{ln.name}
                    <span style={{ color: ln.color }}>{ln.deltaText}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '20px 0', textAlign: 'center', font: "400 12px 'Inter'", color: 'rgba(245,240,234,.4)' }}>Log at least 2 sessions on 1+ exercises to compare trends.</div>
          )}
          {cl.pendingNames.length > 0 && (
            <div style={{ marginTop: 8, font: "400 11px 'Inter'", color: 'rgba(245,240,234,.4)' }}>Not enough data yet: {cl.pendingNames.join(', ')}</div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>CONSISTENCY</div>
          <div style={{ font: "600 11px 'Inter'", color: 'oklch(0.72 0.17 35)' }}>{cons.streak}-day streak</div>
        </div>
        <div style={CARD}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 6 }}>
            {cons.weekdayLabels.map((l: string, i: number) => (
              <div key={i} style={{ textAlign: 'center', font: "600 8px 'Inter'", color: 'rgba(245,240,234,.3)' }}>{l}</div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 10 }}>
            {cons.cells.map((c: any, i: number) => (
              <div key={i} style={{ aspectRatio: '1', borderRadius: 5, background: c.bg, opacity: c.status === 'future' ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', font: "600 8px 'Inter'", color: 'rgba(245,240,234,.5)' }}>{c.dayNum}</div>
            ))}
          </div>
          <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.45)' }}>
            {cons.completedCount} completed in the last 5 weeks
          </div>
        </div>

        <div style={SECTION_LABEL}>VOLUME DISTRIBUTION</div>
        <div style={{ background: '#17140f', borderRadius: 14, padding: 16, marginTop: 8, marginBottom: 26, display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ flex: 'none', width: 112, height: 112, borderRadius: '50%', background: donut.gradientCss, position: 'relative' }}>
            <div style={{ position: 'absolute', inset: 22, borderRadius: '50%', background: '#17140f' }} />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
            {donut.segments.map((sg: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, font: "500 11px 'Inter'", color: 'rgba(245,240,234,.7)' }}>
                <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: sg.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>{sg.muscle}</span>
                <span style={{ fontWeight: 700, color: '#f5f0ea' }}>{sg.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={SECTION_LABEL}>SESSION DURATION & REST</div>
          <div style={{ font: "500 10px 'Inter'", color: 'rgba(245,240,234,.45)' }}>{dur.avgDurText} · {dur.avgRestText}</div>
        </div>
        <div style={CARD}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 10, height: 90, marginBottom: 8 }}>
            {dur.bars.map((b: any, i: number) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
                <div style={{ font: "600 8px 'Inter'", color: 'rgba(245,240,234,.4)' }}>{b.durText}</div>
                <div style={{ width: '100%', maxWidth: 24, borderRadius: '6px 6px 2px 2px', background: 'oklch(0.7 0.13 230)', height: `${b.durPct}%` }} />
                <div style={{ font: "500 9px 'Inter'", color: 'rgba(245,240,234,.35)' }}>{b.day}</div>
              </div>
            ))}
          </div>
          <div style={{ font: "500 9px 'Inter'", color: 'rgba(245,240,234,.35)', marginBottom: 4 }}>Avg rest between sets, per session (seconds)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 56, font: "500 8px 'Inter'", color: 'rgba(245,240,234,.35)' }}>
              <span>{dur.restMaxLabel}</span>
              <span>{dur.restMinLabel}</span>
            </div>
            <svg viewBox="0 0 280 80" style={{ width: '100%', height: 56, display: 'block' }}>
              <polyline points={dur.restPoints} fill="none" stroke="oklch(0.72 0.17 35)" strokeWidth={2} />
            </svg>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4, marginLeft: 24 }}>
            {dur.restDayLabels.map((d: string, i: number) => (
              <div key={i} style={{ flex: 1, textAlign: 'center', font: "500 9px 'Inter'", color: 'rgba(245,240,234,.35)' }}>{d}</div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px 100px' }}>
        <div style={SECTION_LABEL}>SESSION ARCHIVE</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
          {vm.sessionArchive.map(r => (
            <button key={r.id} onClick={r.open} style={{ textAlign: 'left', background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 14, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#f5f0ea' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ font: "600 14px 'Inter'" }}>{r.day}</div>
                  <span style={{ font: "600 9px 'Inter'", padding: '2px 7px', borderRadius: 100, background: r.statusBg, color: r.statusColor }}>{r.statusText}</span>
                </div>
                <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{r.date} · {r.weekLabel}</div>
              </div>
              {r.showVolume && (
                <div style={{ textAlign: 'right' }}>
                  <div className="num" style={{ fontSize: 13, fontWeight: 700, color: 'oklch(0.72 0.17 35)' }}>{r.volume}</div>
                  <div style={{ font: "400 10px 'Inter'", color: 'rgba(245,240,234,.4)' }}>volume</div>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
