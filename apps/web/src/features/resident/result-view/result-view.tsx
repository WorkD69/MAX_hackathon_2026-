import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AttachmentMetadataOutput, DownloadCapabilityResponseOutput, ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { deliverDownload, nativeDownloadBridge, type NativeDownloadBridge } from './download-capability.js';
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
  const capability = useMutation<DownloadCapabilityResponseOutput, unknown, void>({
    mutationFn: () => transport.downloadCapability(attachment.attachment_id),
  });

  async function download() {
    setError(null);
    try {
      const granted = await capability.mutateAsync();
      deliverDownload(granted, bridge);
    } catch {
      setError(DOWNLOAD_ERROR);
    }
  }

  return <li className="resident-result__attachment" data-attachment-id={attachment.attachment_id}>
    <span className="resident-result__file-name">{attachment.file_name}</span>
    <span>{attachment.mime_type}</span>
    <span>{attachment.byte_size} байт</span>
    <button type="button" data-testid={`download-${attachment.attachment_id}`}
      onClick={() => { void download(); }} disabled={capability.isPending}>
      {capability.isPending ? 'Получение ссылки…' : 'Скачать'}
    </button>
    {error && <p role="alert">{error}</p>}
  </li>;
}

export function ResidentResultView({ transport, snapshot, downloadBridge }: ResidentResultViewProps) {
  const result = snapshot.case.current_result;
  const requirement = REQUIREMENT_LABELS[snapshot.case.category.result_requirement];
  const bridge = downloadBridge === undefined ? nativeDownloadBridge() : downloadBridge;

  return <section className="resident-result" aria-label="Результат по обращению">
    <h2>Результат</h2>
    <p data-testid="result-requirement">{requirement}</p>
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
  </section>;
}
