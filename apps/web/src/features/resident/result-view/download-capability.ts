import type { DownloadCapabilityResponseOutput } from '@max-smart-city/contracts';

export interface NativeDownloadBridge {
  downloadFile(downloadUrl: string, fileName: string): void;
}

interface MaxWebApp {
  downloadFile?(downloadUrl: string, fileName: string): void;
}

/** Native MAX hands the opaque capability URL to the client bridge; it is never rendered. */
export function nativeDownloadBridge(scope: unknown = globalThis): NativeDownloadBridge | null {
  const webApp = (scope as { WebApp?: MaxWebApp } | undefined)?.WebApp;
  if (webApp && typeof webApp.downloadFile === 'function') {
    return { downloadFile: (downloadUrl, fileName) => { webApp.downloadFile!(downloadUrl, fileName); } };
  }
  return null;
}

export function deliverDownload(
  capability: DownloadCapabilityResponseOutput,
  bridge: NativeDownloadBridge | null,
  scope: Document = document,
): void {
  if (bridge) {
    bridge.downloadFile(capability.download_url, capability.file_name);
    return;
  }
  const anchor = scope.createElement('a');
  anchor.href = capability.download_url;
  anchor.download = capability.file_name;
  anchor.rel = 'noopener';
  scope.body.append(anchor);
  anchor.click();
  anchor.remove();
}
