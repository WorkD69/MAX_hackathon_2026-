import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateCasePayloadOutput, CreateCaseSuccessOutput } from '@max-smart-city/contracts';
import { CreateCaseIdempotency, fingerprintCreateCase, type FingerprintedFile } from '../idempotency.js';
import { isStaleResponse, type CreateCaseOptions, type ResidentTransport } from '../resident-transport.js';
import './create-case-form.css';

const STALE_MESSAGE = 'Случай изменился с момента открытия. Данные обновлены.';
const SEMANTIC_ERROR = 'Не удалось создать обращение. Проверьте данные и повторите.';
const REQUIREMENT_LABELS = { NONE: 'Материалы не требуются', PHOTO: 'Нужна фотография', FILE: 'Нужен файл' } as const;

export interface CreateCaseFormProps {
  readonly transport: ResidentTransport;
  readonly onCreated: (caseId: string) => void;
}

async function toFingerprintedFile(file: File): Promise<FingerprintedFile> {
  return { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
}

export function CreateCaseForm({ transport, onCreated }: CreateCaseFormProps) {
  const options = useQuery({
    queryKey: ['resident', 'create-case-options'],
    queryFn: () => transport.createCaseOptions(),
    retry: false, staleTime: 0, refetchOnMount: 'always',
  });
  const [categoryId, setCategoryId] = useState('');
  const [premisesId, setPremisesId] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const idempotency = useRef(new CreateCaseIdempotency());

  const activeCategories = useMemo(
    () => (options.data?.categories ?? []).filter((category) => category.active),
    [options.data],
  );
  const activePremises = useMemo(
    () => (options.data?.premises ?? []).filter((premise) => premise.active),
    [options.data],
  );
  const selectedCategory = activeCategories.find((category) => category.categoryId === categoryId);
  const requirement = selectedCategory ? REQUIREMENT_LABELS[selectedCategory.resultRequirement] : null;
  const canSubmit = categoryId !== '' && premisesId !== '' && description.trim() !== '' && !options.isPending;

  const create = useMutation<CreateCaseSuccessOutput, unknown, CreateCasePayloadOutput>({
    mutationFn: async (payload) => {
      const fingerprint = await fingerprintCreateCase(payload, await Promise.all(files.map(toFingerprintedFile)));
      return transport.createCase({
        payload, files, idempotencyKey: idempotency.current.resolve(fingerprint),
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
      setCategoryId('');
      setPremisesId('');
      setDescription('');
      setFiles([]);
      onCreated(created.case_id);
    } catch (cause) {
      if (isStaleResponse(cause)) {
        setStale(true);
        setError(STALE_MESSAGE);
        await options.refetch();
      } else {
        setError(SEMANTIC_ERROR);
      }
    }
  }

  if (options.isPending) return <section aria-label="Создание обращения"><p role="status">Загрузка категорий и адресов…</p></section>;
  if (options.isError) return <section aria-label="Создание обращения">
    <p role="alert">Не удалось загрузить категории и адреса. Обновите список.</p>
  </section>;

  return <section className="resident-create-case" aria-label="Создание обращения">
    <h2>Создание обращения</h2>
    {stale && <p role="alert" className="resident-create-case__stale">{STALE_MESSAGE}</p>}
    {activeCategories.length === 0 && <p role="alert">Сейчас нет доступных категорий для обращения.</p>}
    <form onSubmit={(event) => { void submit(event); }}>
      <div className="resident-create-case__field">
        <label htmlFor="resident-category">Категория</label>
        <select id="resident-category" data-testid="category-select" value={categoryId}
          disabled={activeCategories.length === 0}
          onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Выберите категорию</option>
          {activeCategories.map((category) => <option key={category.categoryId} value={category.categoryId}>
            {category.name}
          </option>)}
        </select>
        {requirement && <p data-testid="category-requirement">{requirement}</p>}
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-premises">Адрес</label>
        <select id="resident-premises" data-testid="premise-select" value={premisesId}
          disabled={activePremises.length === 0}
          onChange={(event) => setPremisesId(event.target.value)}>
          <option value="">Выберите адрес</option>
          {activePremises.map((premise) => <option key={premise.premisesId} value={premise.premisesId}>
            {premise.label}
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
        <input id="resident-files" data-testid="files-input" type="file" multiple
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
