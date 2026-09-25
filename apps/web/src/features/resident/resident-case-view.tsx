import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../platform/platform-context.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { statusLabel } from '../cases/read/presentation.js';
import { ResidentCommentFeed, type ClarificationTarget } from './comments/comment-feed.js';
import { ResidentFeedback } from './feedback/feedback-forms.js';
import { ResidentResultView } from './result-view/result-view.js';
import type { NativeDownloadBridge } from './result-view/download-capability.js';
import type { ResidentTransport } from './resident-transport.js';
import './resident-case-view.css';

export interface ResidentCaseViewProps {
  readonly caseId: string;
  readonly readTransport: CaseReadTransport;
  readonly residentTransport: ResidentTransport;
  readonly contextKey: string;
  readonly clarificationTargets?: readonly ClarificationTarget[];
  readonly downloadBridge?: NativeDownloadBridge | null;
}

export function ResidentCaseView({ caseId, readTransport, residentTransport, contextKey,
  clarificationTargets, downloadBridge }: ResidentCaseViewProps) {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const queryKey = ['case-read', 'snapshot', contextKey, caseId, 'RESIDENT'] as const;
  const snapshot = useQuery({
    queryKey,
    queryFn: () => readTransport.snapshot(caseId, 'RESIDENT'),
    retry: false, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false,
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['case-read', 'list'], refetchType: 'none' });
    await queryClient.invalidateQueries({ queryKey, refetchType: 'none' });
    await snapshot.refetch();
  }, [queryClient, queryKey, snapshot.refetch]);

  useEffect(() => platform.subscribeForeground(() => { void refresh(); }), [platform, refresh]);

  return <article className="resident-case" aria-label="Обращение">
    <header className="resident-case__header">
      <h1>Обращение {snapshot.data?.case.display_number ?? ''}</h1>
      <button type="button" data-testid="resident-refresh" onClick={() => { void refresh(); }}>Обновить</button>
    </header>
    {snapshot.isPending && <p role="status">Загрузка обращения…</p>}
    {snapshot.isError && <p role="alert">Не удалось загрузить обращение. Обновите данные.</p>}
    {snapshot.data && <ResidentCaseContent snapshot={snapshot.data} residentTransport={residentTransport}
      contextKey={contextKey} refresh={refresh}
      {...(clarificationTargets === undefined ? {} : { clarificationTargets })}
      {...(downloadBridge === undefined ? {} : { downloadBridge })} />}
  </article>;
}

interface ResidentCaseContentProps {
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly residentTransport: ResidentTransport;
  readonly contextKey: string;
  readonly clarificationTargets?: readonly ClarificationTarget[];
  readonly downloadBridge?: NativeDownloadBridge | null;
  readonly refresh: () => Promise<void>;
}

function ResidentCaseContent({ snapshot, residentTransport, contextKey, clarificationTargets,
  downloadBridge, refresh }: ResidentCaseContentProps) {
  return <>
    <section className="resident-case__summary" aria-label="Сводка обращения">
      <p><strong>Статус:</strong> <span data-testid="resident-case-status">{statusLabel(snapshot.case.state)}</span></p>
      <p><strong>Следующий шаг:</strong> {snapshot.case.responsibility.text}</p>
      <p><strong>Описание:</strong> {snapshot.case.description}</p>
    </section>
    <ResidentResultView transport={residentTransport} snapshot={snapshot}
      {...(downloadBridge === undefined ? {} : { downloadBridge })} />
    <ResidentFeedback transport={residentTransport} snapshot={snapshot} onMutated={refresh} />
    <ResidentCommentFeed transport={residentTransport} snapshot={snapshot} onMutated={refresh}
      {...(clarificationTargets === undefined ? {} : { clarificationTargets })} />
    <span hidden data-context-key={contextKey} />
  </>;
}
