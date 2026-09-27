import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AttachmentMetadataOutput, DownloadCapabilityResponseOutput, ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { deliverDownload, nativeDownloadBridge, type NativeDownloadBridge } from './download-capability.js';
import { newIdempotencyKey } from '../idempotency.js';
import { ResidentHttpError } from '../resident-transport.js';
import type { ResidentTransport } from '../resident-transport.js';
import './result-view.css';

const DOWNLOAD_ERROR = 'Не удалось получить ссылку на файл. Повторите позже.';
const REQUIREMENT_LABELS = {
  NONE: 'Результат без материалов', PHOTO: 'Требуется фотография', FILE: 'Требуется файл',
} as const;

export interface ResidentResultViewProps {
  readonly transport: ResidentTransport;
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly downloadBridge?: NativeDownloadBridge | null;
}

function MaterialRow({ transport, attachment, bridge }: {
  readonly transport: ResidentTransport;
  readonly attachment: AttachmentMetadataOutput;
  readonly bridge: NativeDownloadBridge | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const mintIntentKey = useRef<string | null>(null);
  const capability = useMutation<DownloadCapabilityResponseOutput, unknown, void>({
    mutationFn: () => {
      mintIntentKey.current ??= newIdempotencyKey();
      return transport.downloadCapability(attachment.attachment_id, mintIntentKey.current);
    },
  });

  async function download() {
    setError(null);
    try {
      const granted = await capability.mutateAsync();
      mintIntentKey.current = null;
      await deliverDownload(granted, bridge);
    } catch (cause) {
      if (cause instanceof ResidentHttpError && cause.status >= 400 && cause.status < 500) {
        mintIntentKey.current = null;
      }
      setError(DOWNLOAD_ERROR);
    }
  }

  return <li className="resident-result__attachment" data-attachment-id={attachment.attachment_id}>
    <span className="resident-result__file-name" style={{ overflowWrap: 'anywhere' }}>{attachment.file_name}</span>
    <span>{attachment.mime_type}</span>
    <span>{attachment.byte_size} байт</span>
    <button type="button" data-testid={`download-${attachment.attachment_id}`}
      aria-label={`Скачать ${attachment.file_name}`}
      onClick={() => { void download(); }} disabled={capability.isPending}>
      {capability.isPending ? 'Получение ссылки…' : 'Скачать'}
    </button>
    {error && <p role="alert">{error}</p>}
  </li>;
}

export function ResidentResultView({ transport, snapshot, downloadBridge }: ResidentResultViewProps) {
  const result = snapshot.case.current_result;
  const initialAttachments = snapshot.case.initial_attachments;
  const displayed = new Set([
    ...initialAttachments.map((attachment) => attachment.attachment_id),
    ...(result?.attachments.map((attachment) => attachment.attachment_id) ?? []),
  ]);
  const activityAttachments = snapshot.case.activity.flatMap((item) => item.attachments)
    .filter((attachment) => {
      if (displayed.has(attachment.attachment_id)) return false;
      displayed.add(attachment.attachment_id);
      return true;
    });
  const requirement = REQUIREMENT_LABELS[snapshot.case.category.result_requirement];
  const bridge = downloadBridge === undefined ? nativeDownloadBridge() : downloadBridge;

  return <section className="resident-result" aria-label="Результат по обращению">
    <h2>Результат</h2>
    <p data-testid="result-requirement">{requirement}</p>
    {initialAttachments.length > 0 && <section aria-label="Исходные вложения" className="resident-result__materials">
      <h3>Исходные вложения</h3>
      <ul className="resident-result__attachment-list">
        {initialAttachments.map((attachment) => <MaterialRow key={attachment.attachment_id}
          transport={transport} attachment={attachment} bridge={bridge} />)}
      </ul>
    </section>}
    {!result ? <p data-testid="result-absent">Результат пока не поступил.</p> : <>
      <p data-testid="result-description">{result.description}</p>
      <p><time dateTime={result.submitted_at} data-testid="result-submitted-at">{result.submitted_at}</time></p>
      <section aria-label="Материалы результата" className="resident-result__materials">
        <h3>Материалы</h3>
        {result.attachments.length === 0 ? <p>Материалы не приложены.</p>
          : <ul className="resident-result__attachment-list">
            {result.attachments.map((attachment) => <MaterialRow key={attachment.attachment_id}
              transport={transport} attachment={attachment} bridge={bridge} />)}
          </ul>}
      </section>
    </>}
    {activityAttachments.length > 0 && <section aria-label="Вложения истории" className="resident-result__materials">
      <h3>Вложения истории</h3>
      <ul className="resident-result__attachment-list">
        {activityAttachments.map((attachment) => <MaterialRow key={attachment.attachment_id}
          transport={transport} attachment={attachment} bridge={bridge} />)}
      </ul>
    </section>}
  </section>;
}
