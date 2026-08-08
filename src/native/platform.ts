/**
 * Platform detection for the Capacitor native shell. This directory (src/native/) is the ONLY
 * place in the codebase that ever touches Capacitor — everything else calls these modules, and
 * on web they delegate to exactly the code that ran before the native shell existed.
 *
 * Detection reads the global the Capacitor runtime injects into its WebView rather than
 * importing @capacitor/core, so web bundles carry no Capacitor code at all; the plugin modules
 * are loaded via dynamic import() inside isNative() branches only.
 */

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

function cap(): CapacitorGlobal | undefined {
  return typeof window !== 'undefined'
    ? (window as { Capacitor?: CapacitorGlobal }).Capacitor
    : undefined;
}

export function isNative(): boolean {
  return !!cap()?.isNativePlatform?.();
}

export function platform(): 'android' | 'ios' | 'web' {
  const p = cap()?.getPlatform?.();
  return p === 'android' || p === 'ios' ? p : 'web';
}
