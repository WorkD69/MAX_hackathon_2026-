import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AttachmentMetadataOutput, DownloadCapabilityResponseOutput } from '@max-smart-city/contracts';
import { deliverDownload, nativeDownloadBridge, type NativeDownloadBridge } from '../../resident/result-view/download-capability.js';
import { MutationIntent, mutationError } from '../../../app/intent/mutation-intent.js';
import { fileSize, fileType } from './presentation.js';

export interface MaterialTransport {
  downloadCapability: (id: string, key: string) => Promise<DownloadCapabilityResponseOutput>;
}
export interface MaterialProps {
  transport?: MaterialTransport | undefined;
  contextKey?: string | undefined;
  downloadBridge?: NativeDownloadBridge | null | undefined;
  onStale?: (() => void | Promise<void>) | undefined;
}

export function MaterialRow({ attachment, transport, contextKey = '', downloadBridge, onStale }: MaterialProps & {
  attachment: AttachmentMetadataOutput;
}) {
  const [error, setError] = useState<string | null>(null);
  const active = useRef(false);
  const mintIntent = useRef(new MutationIntent());
  const capability = useMutation({ mutationFn: async () => {
    const resolved = await mintIntent.current.resolve({ operation: 'DownloadCapability', method: 'POST',
      path: `/api/v1/attachments/${attachment.attachment_id}/download-capability`, context: contextKey,
      targets: { attachment_id: attachment.attachment_id } });
    return transport!.downloadCapability(attachment.attachment_id, resolved.key);
  } });
  async function download() {
    if (active.current || !transport) return;
    active.current = true; setError(null);
    try {
      const granted = await capability.mutateAsync();
      mintIntent.current.close();
      await deliverDownload(granted, downloadBridge === undefined ? nativeDownloadBridge() : downloadBridge);
    } catch (cause) {
      if (mutationError(cause).status === 409 || mutationError(cause).code === 'IDEMPOTENCY_KEY_REUSE') {
        mintIntent.current.close(); await onStale?.();
      }
      setError('Не удалось получить ссылку на файл. Повторите позже.');
    } finally { active.current = false; }
  }
  return <li className="material-row resident-result__attachment" data-attachment-id={attachment.attachment_id}>
    <span className="resident-result__file-name" style={{ overflowWrap: 'anywhere' }}>{attachment.file_name}</span>
    <small>{fileType(attachment.mime_type)} · {fileSize(attachment.byte_size)}</small>
    {transport && <button type="button" data-testid={`download-${attachment.attachment_id}`}
      aria-label={`Скачать ${attachment.file_name}`} disabled={capability.isPending}
      onClick={() => { void download(); }}>{capability.isPending ? 'Получение ссылки…' : 'Скачать'}</button>}
    {error && <p role="alert">{error}</p>}
  </li>;
}

export function AttachmentList({ attachments, ...props }: MaterialProps & { attachments: readonly AttachmentMetadataOutput[] }) {
  return <ul className="case-attachments">{attachments.map(attachment =>
    <MaterialRow key={attachment.attachment_id} attachment={attachment} {...props} />)}</ul>;
}
