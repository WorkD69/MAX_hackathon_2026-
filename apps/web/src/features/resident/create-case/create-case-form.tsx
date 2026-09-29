import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateCasePayloadOutput, CreateCaseSuccessOutput } from '@max-smart-city/contracts';
import { MutationIntent } from '../../../app/intent/mutation-intent.js';
import { isStaleResponse, ResidentHttpError, type CreateCaseOptions, type ResidentTransport } from '../resident-transport.js';
import { fileSize } from '../../cases/read/presentation.js';
import { useDirtyForm } from '../../../app/dirty-form.js';
import './create-case-form.css';

const STALE_MESSAGE = 'Обращение изменилось с момента открытия. Данные обновлены.';
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
  const [addressTouched, setAddressTouched] = useState(false);
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
  const [invalidatedContext, setInvalidatedContext] = useState<string | null>(null);
  const intent = useRef(new MutationIntent());
  const fileInput = useRef<HTMLInputElement>(null);
  const activeCreate = useRef(false);
  const autoSelected = useRef(false);
  const { setDirty } = useDirtyForm();
  const dirty = Boolean(addressTouched || categoryId || description.trim() || files.length);

  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
  useEffect(() => {
    if (!initialOptions.isSuccess || initialOptions.isFetching || autoSelected.current) return;
    autoSelected.current = true;
    if (initialOptions.data.premises.length === 1) setPremisesId(initialOptions.data.premises[0]!.premises_id);
  }, [initialOptions.data, initialOptions.isFetching, initialOptions.isSuccess]);

  const optionsInvalidated = invalidatedContext === contextKey;
  const currentOptions = !optionsInvalidated && options.isSuccess && !options.isFetching
    && options.data.selected_premises_id === premisesId
    ? options.data : undefined;
  const categories = currentOptions?.categories ?? [];
  const premises = optionsInvalidated || options.isError || initialOptions.isError ? []
    : currentOptions?.premises ?? initialOptions.data?.premises ?? [];
  const selectedCategory = categories.find((category) => category.category_id === categoryId);
  const requirement = selectedCategory ? REQUIREMENT_LABELS[selectedCategory.result_requirement] : null;
  const canSubmit = Boolean(selectedCategory && premises.some((premise) => premise.premises_id === premisesId)
    && description.trim() && options.isSuccess && !options.isFetching
    && initialOptions.isSuccess && !initialOptions.isFetching && !optionsInvalidated);

  useEffect(() => {
    if (!premisesId || !options.isError || options.isFetching) return;
    setInvalidatedContext(contextKey);
    setCategoryId('');
    setPremisesId('');
  }, [contextKey, options.isError, options.isFetching, premisesId]);

  useEffect(() => {
    if (!initialOptions.isError || initialOptions.isFetching) return;
    setCategoryId('');
    setPremisesId('');
  }, [initialOptions.isError, initialOptions.isFetching]);

  useEffect(() => {
    if (!premisesId || !currentOptions) return;
    if (!currentOptions.premises.some((premise) => premise.premises_id === premisesId)) {
      setInvalidatedContext(contextKey);
      setPremisesId('');
      setAddressTouched(false);
      setCategoryId('');
    } else if (categoryId && !currentOptions.categories.some((category) => category.category_id === categoryId)) {
      setCategoryId('');
    }
  }, [categoryId, contextKey, currentOptions, premisesId]);

  useEffect(() => {
    if (!premisesId || !initialOptions.isSuccess || initialOptions.isFetching
      || initialOptions.dataUpdatedAt <= options.dataUpdatedAt) return;
    if (!initialOptions.data.premises.some((premise) => premise.premises_id === premisesId)) {
      setPremisesId('');
      setCategoryId('');
    }
  }, [initialOptions.data, initialOptions.dataUpdatedAt, initialOptions.isFetching,
    initialOptions.isSuccess, options.dataUpdatedAt, premisesId]);

  async function refreshOptions() {
    const refreshed = await initialOptions.refetch();
    if (refreshed.isSuccess) setInvalidatedContext((current) => current === contextKey ? null : current);
  }

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
    if (!canSubmit || activeCreate.current) return;
    activeCreate.current = true;
    setError(null);
    setStale(false);
    if (files.some(file => file.size > 10 * 1024 * 1024)) {
      setError('Размер каждого файла — не больше 10 МиБ.');
      fileInput.current?.focus();
      activeCreate.current = false;
      return;
    }
    try {
      const created = await create.mutateAsync({
        premises_id: premisesId, category_id: categoryId, description: description.trim(),
      });
      intent.current.close();
      setCategoryId('');
      setPremisesId('');
      setAddressTouched(false);
      setDescription('');
      setFiles([]);
      if (fileInput.current) fileInput.current.value = '';
      onCreated(created.case_id);
    } catch (cause) {
      if (cause instanceof ResidentHttpError && cause.status === 409 && cause.code === 'DEMO_PRIMARY_CASE_EXISTS') {
        intent.current.close();
        if (onPrimaryCaseExists) await onPrimaryCaseExists();
        setStale(!onPrimaryCaseExists);
        setError(onPrimaryCaseExists ? null : STALE_MESSAGE);
      } else if (isStaleResponse(cause)) {
        intent.current.close();
        setStale(true);
        setError(null);
        await options.refetch();
      } else {
        setError(files.some(file => file.size > 10 * 1024 * 1024)
          ? 'Размер каждого файла — не больше 10 МиБ.' : SEMANTIC_ERROR);
      }
    } finally {
      activeCreate.current = false;
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
    {optionsInvalidated && <p role="alert">Не удалось обновить категории и адреса.</p>}
    {optionsInvalidated && <button type="button" onClick={() => { void refreshOptions(); }}>Обновить список</button>}
    {!optionsInvalidated && premises.length === 0 && <p role="alert">Сейчас нет доступных адресов для обращения.</p>}
    {options.isPending && premisesId && <p role="status">Загрузка категорий…</p>}
    {options.isError && <p role="alert">Не удалось загрузить категории. Выберите адрес ещё раз.</p>}
    {categories.length === 0 && premisesId && options.isSuccess && <p role="alert">Сейчас нет доступных категорий для обращения.</p>}
    <form onSubmit={(event) => { void submit(event); }}>
      <div className="resident-create-case__field">
        <label htmlFor="resident-premises">Адрес</label>
        <select id="resident-premises" data-testid="premise-select" value={premisesId}
          disabled={premises.length === 0}
          onChange={(event) => { setAddressTouched(true); setPremisesId(event.target.value); setCategoryId(''); }}>
          <option value="">Выберите адрес</option>
          {premises.map((premise) => <option key={premise.premises_id} value={premise.premises_id}>
            {premise.house_address} · {premise.premises_label}
          </option>)}
        </select>
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-category">Категория</label>
        <select id="resident-category" data-testid="category-select" value={categoryId}
          disabled={!premisesId || categories.length === 0} aria-describedby="category-help"
          onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Выберите категорию</option>
          {categories.map((category) => <option key={category.category_id} value={category.category_id}>
            {category.name}
          </option>)}
        </select>
        <small id="category-help">{!premisesId ? 'Сначала выберите адрес' : 'Категории доступны для выбранного адреса'}</small>
        {requirement && <p data-testid="category-requirement">{requirement}</p>}
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-description">Описание проблемы</label>
        <textarea id="resident-description" data-testid="description-input" rows={4} value={description} required
          onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="resident-create-case__field">
        <label htmlFor="resident-files">Фото и файлы</label>
        <input id="resident-files" data-testid="files-input" type="file" multiple ref={fileInput} disabled={create.isPending}
          aria-invalid={Boolean(error && files.some(file => file.size > 10 * 1024 * 1024))} aria-describedby="resident-files-help"
          onChange={(event) => setFiles([...(event.target.files ?? [])])} />
        <label htmlFor="resident-files" className="file-picker">Добавить фото или файл</label>
        {files.length > 0 && <div data-testid="files-selected">{files.map((file, index) => <div className="material-row" key={`${file.name}-${index}`}>
          <span>{file.name}<small>{file.type || 'Тип не указан'} · {fileSize(file.size)}</small></span>
          <button type="button" className="button-secondary" onClick={() => { setFiles(current => current.filter((_, at) => at !== index)); if (fileInput.current) fileInput.current.value = ''; }}>Убрать</button>
        </div>)}</div>}
        <small id="resident-files-help">Каждый файл — до 10 МиБ. Обращение создаётся после отправки формы.</small>
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
