/**
 * One-time native shell initialization, called from main.tsx when isNative(). Web never runs
 * any of this.
 *
 *  - Hardware back button: drives the app's EXISTING one-entry history/popstate ladder
 *    (useApp.ts closeTopmost) via history.back(); only the empty-history case is native-specific,
 *    where we minimize instead of Capacitor's default exitApp — a tracker mid-anything should
 *    background, not die.
 *  - Notification taps: the rest-complete notification routes through the SAME #rest-exercise
 *    hash path the web service worker uses (useApp.ts consumes and strips it) — zero new state.
 *  - Status bar: solid app-background color with light icons, matching the dark theme.
 */
import { isNative } from './platform';

export async function initNativeShell(): Promise<void> {
  if (!isNative()) return;

  try {
    const { App } = await import('@capacitor/app');
    void App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.minimizeApp();
    });
  } catch { /* plugin unavailable */ }

  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    void LocalNotifications.addListener('localNotificationActionPerformed', action => {
      const type = (action.notification.extra as { type?: string } | undefined)?.type;
      if (type === 'rest-complete') {
        // Setting the hash fires the app's existing hashchange consumer (phase-24 path), which
        // lands on the exercise still owed work and strips the hash.
        window.location.hash = '#rest-exercise';
      }
      // 'daily-reminder' needs nothing: the tap already foregrounds the app on the home screen.
    });
  } catch { /* plugin unavailable */ }

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    // Style first: setBackgroundColor is Android-only and throws on iOS — ordering it second
    // means the style still lands there before the catch swallows the color call.
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#0d0c0b' });
  } catch { /* iOS: no setBackgroundColor; style already applied */ }
}
