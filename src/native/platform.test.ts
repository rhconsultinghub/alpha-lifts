import { describe, it, expect, afterEach } from 'vitest';
import { isNative, platform } from './platform';

type MutableWindow = { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } };
const win = globalThis as unknown as { window?: MutableWindow };

afterEach(() => {
  delete win.window;
});

describe('platform detection', () => {
  it('reads as web with no window at all (node test env)', () => {
    expect(isNative()).toBe(false);
    expect(platform()).toBe('web');
  });

  it('reads as web with a window but no Capacitor global', () => {
    win.window = {};
    expect(isNative()).toBe(false);
    expect(platform()).toBe('web');
  });

  it('reads as native when the Capacitor runtime is injected', () => {
    win.window = { Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } };
    expect(isNative()).toBe(true);
    expect(platform()).toBe('android');
  });

  it('treats a Capacitor global reporting non-native (capacitor-in-browser) as web', () => {
    win.window = { Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } };
    expect(isNative()).toBe(false);
    expect(platform()).toBe('web');
  });
});
