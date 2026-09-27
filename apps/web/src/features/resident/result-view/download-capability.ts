import type { DownloadCapabilityResponseOutput } from '@max-smart-city/contracts';

export interface NativeDownloadBridge {
  downloadFile(downloadUrl: string, fileName: string): void;
}

export interface BlobUrlApi {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
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
  fetchBytes: typeof fetch = fetch,
  blobUrls: BlobUrlApi = URL,
): Promise<void> {
  if (bridge) {
    bridge.downloadFile(capability.download_url, capability.file_name);
    return Promise.resolve();
  }
  return (async () => {
    const response = await fetchBytes(capability.download_url, {
      credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
    });
    if (!response.ok) throw new Error('Capability download failed');
    const blobUrl = blobUrls.createObjectURL(await response.blob());
    const anchor = scope.createElement('a');
    try {
      anchor.href = blobUrl;
      anchor.download = capability.file_name;
      scope.body.append(anchor);
      anchor.click();
    } finally {
      anchor.remove();
      // Let the browser start consuming the blob before releasing its object URL.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      blobUrls.revokeObjectURL(blobUrl);
    }
  })();
}
