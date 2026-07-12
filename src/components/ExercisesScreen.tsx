import type { ViewModel } from '../state/viewModel';
import { ExercisePhoto } from './ExercisePhoto';

export function ExercisesScreen({ vm }: { vm: ViewModel }) {
  return (
    <div style={{ padding: '24px 20px 100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div className="num" style={{ fontSize: 30, fontWeight: 700 }}>Exercises</div>
        <button onClick={vm.openAddExerciseForm} style={{ background: 'oklch(0.65 0.19 35)', border: 'none', color: '#0d0c0b', width: 36, height: 36, borderRadius: '50%', fontSize: 18, fontWeight: 700, lineHeight: 1 }}>+</button>
      </div>
      <div style={{ font: "400 12px 'Inter'", color: 'rgba(245,240,234,.45)', marginBottom: 16 }}>Every exercise in your library, grouped by primary muscle.</div>

      <input
        value={vm.exerciseSearchQuery}
        onChange={e => vm.setExerciseSearchQuery(e.target.value)}
        placeholder="Search by name or muscle (e.g. 'row' or 'chest')"
        style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', color: '#f5f0ea', font: "400 13px 'Inter'", padding: '11px 14px', borderRadius: 12, marginBottom: 22 }}
      />

      {vm.exerciseSearchQuery && vm.exerciseLibraryGroups.length === 0 && (
        <div style={{ font: "400 13px 'Inter'", color: 'rgba(245,240,234,.45)', textAlign: 'center', padding: '30px 0' }}>
          No exercises match “{vm.exerciseSearchQuery}”.
        </div>
      )}

      {vm.exerciseLibraryGroups.map(g => (
        <div key={g.muscle} style={{ marginBottom: 22 }}>
          <div style={{ font: "500 11px 'Inter'", color: 'rgba(245,240,234,.4)', letterSpacing: '.04em', marginBottom: 10 }}>{g.muscleUpper}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.items.map(ex => (
              <button key={ex.id} onClick={ex.openDetail} style={{ textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,.04)', border: 'none', borderRadius: 16, padding: '12px 14px', color: '#f5f0ea' }}>
                <ExercisePhoto id={ex.id} pattern={ex.pattern} size={52} radius={12} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ font: "600 14px 'Inter'" }}>{ex.name}</div>
                    {ex.isCustom && (
                      <span style={{ font: "600 9px 'Inter'", padding: '2px 7px', borderRadius: 100, background: 'oklch(0.72 0.15 35 / 0.15)', color: 'oklch(0.72 0.15 35)' }}>Custom</span>
                    )}
                  </div>
                  <div style={{ font: "400 11px 'Inter'", color: 'rgba(245,240,234,.45)', marginTop: 2 }}>{ex.equipSummary}</div>
                </div>
                <div style={{ color: 'rgba(245,240,234,.3)', fontSize: 14 }}>›</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
