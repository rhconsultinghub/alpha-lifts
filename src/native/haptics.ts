/**
 * Haptics, platform-branched. Web keeps the exact navigator.vibrate behaviour that shipped
 * before the native shell (spec-restricted to visible documents, absent entirely on iOS
 * browsers); native routes through @capacitor/haptics, which works on both platforms.
 */
import { isNative } from './platform';

/** Light tap feedback (drag pickup, small confirmations). */
export function hapticTap(): void {
  if (isNative()) {
    void import('@capacitor/haptics').then(({ Haptics, ImpactStyle }) =>
      Haptics.impact({ style: ImpactStyle.Light })
    ).catch(() => {});
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(15);
  }
}

/** Strong attention pattern (foreground rest-end). Native approximates the web's
 *  [vibrate,pause,...] pattern with sequenced vibrate calls. */
export function hapticPattern(pattern: number[]): void {
  if (isNative()) {
    void import('@capacitor/haptics').then(async ({ Haptics }) => {
      for (let i = 0; i < pattern.length; i++) {
        if (i % 2 === 0) await Haptics.vibrate({ duration: pattern[i] });
        else await new Promise(r => setTimeout(r, pattern[i]));
      }
    }).catch(() => {});
    return;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

/** Whether any haptic channel exists — native always has one; web depends on the browser. */
export function hapticsSupported(): boolean {
  return isNative() || (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function');
}
