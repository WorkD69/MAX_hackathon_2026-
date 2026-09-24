export interface PlatformAdapter {
  readonly name: 'browser' | 'max' | 'test';
  readonly isMiniAppContext: boolean;
  getRawInitData(): string | null;
  subscribeForeground(listener: () => void): () => void;
}

export function createPlatformAdapter(): PlatformAdapter {
  return {
    name: 'browser',
    isMiniAppContext: false,
    getRawInitData: () => null,
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
