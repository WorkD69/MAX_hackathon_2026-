import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateCasePayloadOutput, CreateCaseSuccessOutput } from '@max-smart-city/contracts';
import { MutationIntent } from '../../../app/intent/mutation-intent.js';
import { isStaleResponse, ResidentHttpError, type CreateCaseOptions, type ResidentTransport } from '../resident-transport.js';
import './create-case-form.css';

const STALE_MESSAGE = 'Случай изменился с момента открытия. Данные обновлены.';
const SEMANTIC_ERROR = 'Не удалось создать обращение. Проверьте данные и повторите.';
const REQUIREMENT_LABELS = { NONE: 'Материалы не требуются', PHOTO: 'Нужна фотография', FILE: 'Нужен файл' } as const;

export interface CreateCaseFormProps {
  readonly transport: ResidentTransport;
  readonly onCreated: (caseId: string) => void;
  readonly onPrimaryCaseExists?: () => Promise<void>;
  readonly contextKey?: string;
}

export function CreateCaseForm({ transport, onCreated, onPrimaryCaseExists, contextKey = '' }: CreateCaseFormProps) {
  const [premisesId, setPremisesId] = useState('');
  const initialOptions = useQuery({
    queryKey: ['resident', 'create-case-options', contextKey, 'initial'],
    queryFn: () => transport.createCaseOptions(),
    retry: false, staleTime: 0, refetchOnMount: 'always',
  });
  const options = useQuery({
    queryKey: ['resident', 'create-case-options', contextKey, premisesId],
    queryFn: () => transport.createCaseOptions(premisesId),
    enabled: premisesId !== '',
    retry: false, staleTime: 0, refetchOnMount: 'always',
  });
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const intent = useRef(new MutationIntent());
  const fileInput = useRef<HTMLInputElement>(null);

  const currentOptions = !options.isFetching && options.data?.selected_premises_id === premisesId
    ? options.data : undefined;
  const categories = currentOptions?.categories ?? [];
  const premises = currentOptions?.premises ?? initialOptions.data?.premises ?? [];
  const selectedCategory = categories.find((category) => category.category_id === categoryId);
  const requirement = selectedCategory ? REQUIREMENT_LABELS[selectedCategory.result_requirement] : null;
  const canSubmit = Boolean(selectedCategory && premises.some((premise) => premise.premises_id === premisesId)
    && description.trim() && !options.isFetching);

  const create = useMutation<CreateCaseSuccessOutput, unknown, CreateCasePayloadOutput>({
    mutationFn: async (payload) => {
      const resolved = await intent.current.resolve({ operation: 'CreateCase', method: 'POST',
        path: '/api/v1/cases', context: contextKey, payload, files });
      return transport.createCase({
        payload, files, idempotencyKey: resolved.key,
      });
    },
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || create.isPending) return;
    setError(null);
    setStale(false);
    try {
      const created = await create.mutateAsync({
        premises_id: premisesId, category_id: categoryId, description: description.trim(),
      });
      intent.current.close();
      setCategoryId('');
      setPremisesId('');
      setDescription('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      onCreated(created.case_id);
    } catch (cause) {
      if (cause instanceof ResidentHttpError && cause.status === 409 && cause.code === 'DEMO_PRIMARY_CASE_EXISTS') {
        intent.current.close();
        if (onPrimaryCaseExists) await onPrimaryCaseExists();
        setStale(true);
        setError(STALE_MESSAGE);
      } else if (isStaleResponse(cause)) {
        intent.current.close();
        setStale(true);
        setError(STALE_MESSAGE);
        await options.refetch();
      } else {
        setError(SEMANTIC_ERROR);
      }
    }
  }

  if (initialOptions.isPending) return <section aria-label="Создание обращения"><h1>Создание обращения</h1><p role="status">Загрузка категорий и адресов…</p></section>;
  if (initialOptions.isError) return <section aria-label="Создание обращения">
    <h1>Создание обращения</h1>
    <p role="alert">Не удалось загрузить категории и адреса. Обновите список.</p>
  </section>;

  return <section className="resident-create-case" aria-label="Создание обращения">
    <h1>Создание обращения</h1>
    {stale && <p role="alert" className="resident-create-case__stale">{STALE_MESSAGE}</p>}
    {premises.length === 0 && <p role="alert">Сейчас нет доступных адресов для обращения.</p>}
    {options.isPending && premisesId && <p role="status">Загрузка категорий…</p>}
    {options.isError && <p role="alert">Не удалось загрузить категории. Выберите адрес ещё раз.</p>}
    {categories.length === 0 && premisesId && options.isSuccess && <p role="alert">Сейчас нет доступных категорий для обращения.</p>}
    <form onSubmit={(event) => { void submit(event); }}>
      <div className="resident-create-case__field">
        <label htmlFor="resident-category">Категория</label>
        <select id="resident-category" data-testid="category-select" value={categoryId}
          disabled={categories.length === 0}
          onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Выберите категорию</option>
          {categories.map((category) => <option key={category.category_id} value={category.category_id}>
            {category.name}
          </option>)}
        </select>
        {requirement && <p data-testid="category-requirement">{requirement}</p>}
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-premises">Адрес</label>
        <select id="resident-premises" data-testid="premise-select" value={premisesId}
          disabled={premises.length === 0}
          onChange={(event) => { setPremisesId(event.target.value); setCategoryId(''); }}>
          <option value="">Выберите адрес</option>
          {premises.map((premise) => <option key={premise.premises_id} value={premise.premises_id}>
            {premise.house_address} · {premise.premises_label}
          </option>)}
        </select>
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-description">Описание проблемы</label>
        <textarea id="resident-description" data-testid="description-input" rows={4} value={description}
          onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-files">Фотографии и файлы</label>
        <input id="resident-files" data-testid="files-input" type="file" multiple ref={fileInput} disabled={create.isPending}
          onChange={(event) => setFiles([...(event.target.files ?? [])])} />
        {files.length > 0 && <p data-testid="files-selected">Выбрано файлов: {files.length}</p>}
        <small>Загрузка файлов не завершает обращение — обращение создаётся после отправки формы.</small>
      </div>
      {error && <p role="alert" className="resident-create-case__error">{error}</p>}
      <button type="submit" data-testid="create-case-submit" disabled={!canSubmit || create.isPending}>
        {create.isPending ? 'Создание…' : 'Создать обращение'}
      </button>
      {create.isPending && <p role="status">Создание обращения…</p>}
    </form>
  </section>;
}

export type { CreateCaseOptions };
