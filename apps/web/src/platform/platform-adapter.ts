export interface PlatformAdapter {
  readonly name: 'browser' | 'max' | 'test';
  readonly isMiniAppContext: boolean;
  getRawInitData(): string | null;
  subscribeForeground(listener: () => void): () => void;
}

export function createPlatformAdapter(): PlatformAdapter {
  const rawInitData = () => {
    const bridge = (window as Window & { WebApp?: { initData?: unknown } }).WebApp;
    if (typeof bridge?.initData === 'string' && bridge.initData.length > 0) return bridge.initData;
    return new URLSearchParams(window.location.hash.slice(1)).get('WebAppData') || null;
  };
  return {
    get name() { return rawInitData() ? 'max' : 'browser'; },
    get isMiniAppContext() { return rawInitData() !== null; },
    getRawInitData: rawInitData,
    subscribeForeground(listener) {
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') listener();
      };
      window.addEventListener('focus', listener);
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
        window.removeEventListener('focus', listener);
        document.removeEventListener('visibilitychange', onVisibilityChange);
      };
    },
  };
}
