/**
 * Shared modal scaffold: the dimmed backdrop + dark sheet that 11 modals used to hand-roll with
 * subtly drifting values (backdrop .55 vs .6, radius 22 vs 24, ad-hoc z-indexes). One place now
 * owns the structure, the click-through stop, and the dialog semantics.
 *
 * The app's z-index ladder, for reference (values chosen by the existing modals, now documented):
 *   15  bottom chrome (ResumePill)
 *   20  fullscreen detail pages (ExerciseDetail / QuickEdit / LibraryDetail — opaque pages, not sheets)
 *   30  standard sheets (Settings, Swap, MuscleDrill, WeekReview, WarmupDetail, EditWeek, ExerciseForm, MusclesWorked)
 *   31-33  sheets that must stack above another open sheet (Wizard 31, ExerciseHistory 32, ArchiveDetail 33)
 *   40  idle-workout dialog · 45 confirm dialogs · 60 tutorial · 70 storage banner
 *
 * `onClose` closes on backdrop tap; omit it for form sheets that must only close via their ✕
 * (accidental-dismiss protection — matches each modal's previous behaviour). Deliberately no
 * Escape handler: with stacked sheets a global keydown would close every layer at once, and the
 * hardware-back popstate integration in useApp already closes the topmost in order.
 */
export function Sheet({
  z = 30,
  dim = 0.55,
  radius = 24,
  maxHeight = '86%',
  padding,
  column = false,
  scrollY = false,
  center = false,
  width,
  onClose,
  children
}: {
  z?: number;
  /** Backdrop opacity — the legacy sheets used .55 or .6. */
  dim?: number;
  radius?: 22 | 24;
  maxHeight?: string;
  /** Padding on the sheet itself (content-owns-padding sheets omit this). */
  padding?: string;
  /** display:flex column on the sheet (header + scrolling body layouts). */
  column?: boolean;
  scrollY?: boolean;
  /** Centered card (MusclesWorked) instead of a bottom sheet. */
  center?: boolean;
  width?: number | string;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: `rgba(0,0,0,${dim})`,
        zIndex: z,
        display: 'flex',
        alignItems: center ? 'center' : 'flex-end',
        justifyContent: center ? 'center' : undefined
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#17140f',
          borderRadius: center ? radius : `${radius}px ${radius}px 0 0`,
          width: width ?? '100%',
          maxHeight,
          ...(padding ? { padding } : {}),
          ...(column ? { display: 'flex' as const, flexDirection: 'column' as const } : {}),
          ...(scrollY ? { overflowY: 'auto' as const } : {})
        }}
      >
        {children}
      </div>
    </div>
  );
}
