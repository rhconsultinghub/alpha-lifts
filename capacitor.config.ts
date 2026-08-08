import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // PERMANENT once the first bundle is uploaded to Play — an app's id can never change.
  // Owner sign-off required before the first Play upload (plan risk #5).
  appId: 'com.alphalifts.app',
  appName: 'Alpha Lifts',
  // Built by `npm run build:native` (vite --mode native → base '/', Worker URL from .env.native).
  webDir: 'dist',
  android: {
    // Target SDK 35 apps are edge-to-edge by default; let Capacitor pad the WebView so the
    // existing --safe-b CSS resolves against real insets. Fallback ladder if spacing misbehaves:
    // 'force', then StatusBar.setOverlaysWebView(false). See plan risk #2.
    adjustMarginsForEdgeToEdge: 'auto'
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0d0c0b',
      launchAutoHide: true,
      launchShowDuration: 800
    },
    LocalNotifications: {
      // Status-bar glyph: white barbell on transparency (same art + alpha-only rule as the web
      // badge-96.png), installed into android res drawables as ic_stat_notify.
      smallIcon: 'ic_stat_notify',
      iconColor: '#f0752f'
    }
  }
};

export default config;
