import { useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ResidentCaseSnapshotSchema, type ResidentCaseSnapshotOutput } from '@max-smart-city/contracts';
import { usePlatform } from '../../platform/platform-context.js';
import type { CaseReadTransport } from '../cases/read/read-transport.js';
import { statusLabel, caseReference, stageLabel, displayName, responsibilityLabel } from '../cases/read/presentation.js';
import { ResidentCommentFeed } from './comments/comment-feed.js';
import { ResidentFeedback } from './feedback/feedback-forms.js';
import { ResidentResultView } from './result-view/result-view.js';
import type { NativeDownloadBridge } from './result-view/download-capability.js';
import type { ResidentTransport } from './resident-transport.js';
import './resident-case-view.css';
import { CaseActivity } from '../cases/read/activity.js';

export interface ResidentCaseViewProps {
  readonly caseId: string;
  readonly readTransport: CaseReadTransport;
  readonly residentTransport: ResidentTransport;
  readonly contextKey: string;
  readonly downloadBridge?: NativeDownloadBridge | null;
}

export function ResidentCaseView({ caseId, readTransport, residentTransport, contextKey,
  downloadBridge }: ResidentCaseViewProps) {
  const platform = usePlatform();
  const queryClient = useQueryClient();
  const queryKey = ['case-read', 'snapshot', contextKey, caseId, 'RESIDENT'] as const;
  const snapshot = useQuery({
    queryKey,
    queryFn: async () => ResidentCaseSnapshotSchema.parse(await readTransport.snapshot(caseId, 'RESIDENT')),
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
      <h1>Обращение {caseReference(snapshot.data?.case.display_number ?? '')}</h1>
      <button type="button" data-testid="resident-refresh" onClick={() => { void refresh(); }}>Обновить</button>
    </header>
    {snapshot.isPending && <p role="status">Загрузка обращения…</p>}
    {snapshot.isError && <p role="alert">Не удалось загрузить обращение. Обновите данные.</p>}
    {snapshot.data && <ResidentCaseContent snapshot={snapshot.data} residentTransport={residentTransport}
      contextKey={contextKey} refresh={refresh}
      {...(downloadBridge === undefined ? {} : { downloadBridge })} />}
  </article>;
}

interface ResidentCaseContentProps {
  readonly snapshot: ResidentCaseSnapshotOutput;
  readonly residentTransport: ResidentTransport;
  readonly contextKey: string;
  readonly downloadBridge?: NativeDownloadBridge | null;
  readonly refresh: () => Promise<void>;
}

function ResidentCaseContent({ snapshot, residentTransport, contextKey,
  downloadBridge, refresh }: ResidentCaseContentProps) {
  return <>
    <section className="resident-case__summary" aria-label="Сводка обращения">
      <p><span className="status-badge" data-testid="resident-case-status">{statusLabel(snapshot.case.state)}</span></p>
      <p className="next-action"><strong>Следующий шаг:</strong> {responsibilityLabel(snapshot.case.responsibility)}</p>
      <p><strong>Адрес:</strong> {snapshot.case.location.house}, {snapshot.case.location.premises}</p>
      <p><strong>Этап работ:</strong> {stageLabel(snapshot.case.current_iteration.number)}</p>
      {snapshot.case.current_executor && <p><strong>Текущий исполнитель:</strong> {displayName(snapshot.case.current_executor.name)}</p>}
      {snapshot.case.assignment?.decision === 'PENDING' && <p>Задание направлено {displayName(snapshot.case.assignment.contractor.name)}. Ожидается принятие.</p>}
      <p><strong>Описание:</strong> {snapshot.case.description}</p>
    </section>
    <ResidentResultView showHistory={false} transport={residentTransport} snapshot={snapshot} contextKey={contextKey} onStale={refresh}
      {...(downloadBridge === undefined ? {} : { downloadBridge })} />
    <ResidentFeedback key={snapshot.case.current_iteration.iteration_id} transport={residentTransport} snapshot={snapshot} onMutated={refresh} contextKey={contextKey} />
    <ResidentCommentFeed key={snapshot.case.current_iteration.iteration_id} composerOnly transport={residentTransport} snapshot={snapshot} onMutated={refresh} contextKey={contextKey} />
    <CaseActivity activity={snapshot.case.activity.filter(item => item.domain.result?.result_id !== snapshot.case.current_result?.result_id || !item.domain.result)}
      transport={residentTransport} contextKey={contextKey} downloadBridge={downloadBridge} onStale={refresh} />
    <span hidden data-context-key={contextKey} />
  </>;
}
