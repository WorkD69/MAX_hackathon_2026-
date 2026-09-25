import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ZodError } from 'zod';
import { ErrorState } from '../../components/ui/error-state.js';
import { useSession } from '../session/session-provider.js';
import {
  configurationApi, type Category, type Contractor, type House, type Organization, type User,
} from './configuration-api.js';
import './configuration.css';

type Api = ReturnType<typeof configurationApi>;
type Action<T> = UseMutationResult<void, Error, T>;
const ROLES = ['RESIDENT', 'UK_EMPLOYEE', 'UK_ADMIN', 'CONTRACTOR_EMPLOYEE'] as const;
const REQUIREMENTS = [
  { value: 'NONE', label: 'Ничего дополнительно' },
  { value: 'PHOTO', label: 'Фото' },
  { value: 'FILE', label: 'Файл' },
] as const;
const value = (form: FormData, name: string) => String(form.get(name) ?? '').trim();
const checked = (form: FormData, name: string) => form.has(name);

function useSave<T>(save: (input: T) => Promise<void>): Action<T> {
  const client = useQueryClient();
  return useMutation({
    mutationFn: save,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}

function Feedback<T>({ action }: { readonly action: Action<T> }) {
  return <div className="config-feedback" aria-live="polite">
    {action.isPending ? <span role="status">Сохраняем…</span> : null}
    {action.isSuccess ? <span role="status">Сохранено. Данные обновлены с сервера.</span> : null}
    {action.isError ? <div role="alert">
      {action.error instanceof ZodError ? 'Проверьте обязательные поля и значения.' : action.error.message}
      {action.variables !== undefined ? <button type="button" onClick={() => action.mutate(action.variables)}>Повторить</button> : null}
    </div> : null}
  </div>;
}

function Submit({ pending, label = 'Сохранить' }: { readonly pending: boolean; readonly label?: string }) {
  return <button type="submit" disabled={pending}>{label}</button>;
}

function submit(event: React.FormEvent<HTMLFormElement>, run: (form: FormData) => void) {
  event.preventDefault();
  run(new FormData(event.currentTarget));
}

function OrganizationForm({ organization, api }: { readonly organization: Organization; readonly api: Api }) {
  const action = useSave(api.organizationUpdate);
  return <section className="config-card" aria-labelledby="config-organization">
    <h2 id="config-organization">Организация</h2>
    <p className="config-note">Текущее название на сервере: {organization.name}</p>
    <form data-testid="organization-form" onSubmit={(event) => submit(event, (form) => action.mutate({ name: value(form, 'name') }))}>
      <label>Название <input name="name" defaultValue={organization.name} required /></label>
      <Submit pending={action.isPending} />
    </form>
    <Feedback action={action} />
  </section>;
}

function HouseForm({ house, api }: { readonly house?: House; readonly api: Api }) {
  const action = useSave(async (input: { address: string; display_label: string | null; active: boolean }) => {
    if (house) await api.houseUpdate(house.house_id, input);
    else await api.houseCreate(input);
  });
  return <form className="config-form" data-testid={house ? 'house-edit-form' : 'house-create-form'} onSubmit={(event) => submit(event, (form) => action.mutate({
    address: value(form, 'address'), display_label: value(form, 'display_label') || null, active: checked(form, 'active'),
  }))}>
    <label>Адрес <input name="address" defaultValue={house?.address ?? ''} required /></label>
    <label>Метка <input name="display_label" defaultValue={house?.display_label ?? ''} /></label>
    <label className="config-check"><input type="checkbox" name="active" defaultChecked={house?.active ?? true} /> Активен</label>
    <Submit pending={action.isPending} label={house ? 'Обновить дом' : 'Добавить дом'} />
    <Feedback action={action} />
  </form>;
}

function Houses({ houses, api }: { readonly houses: House[]; readonly api: Api }) {
  return <section className="config-card" aria-labelledby="config-houses">
    <h2 id="config-houses">Дома</h2>
    <p className="config-note">Деактивация дома влияет на новые действия; существующие случаи и их история сохраняются.</p>
    <HouseForm api={api} />
    <ul className="config-list">{houses.map((house) => <li key={house.house_id}>
      <h3>{house.address}</h3><HouseForm key={`${house.house_id}:${house.address}:${house.active}`} house={house} api={api} />
    </li>)}</ul>
  </section>;
}

function ContractorOptions({ contractors }: { readonly contractors: Contractor[] }) {
  return <>{contractors.filter((item) => item.contractor.active && item.organization_contractor.active).map((item) =>
    <option key={item.contractor.contractor_id} value={item.contractor.contractor_id}>{item.contractor.display_name}</option>)}</>;
}

function CategoryForm({ category, contractors, api }: { readonly category?: Category; readonly contractors: Contractor[]; readonly api: Api }) {
  const action = useSave(async (input: {
    name: string; description: string | null; default_contractor_id: string | null;
    requires_premises_access: boolean; result_requirement: 'NONE' | 'PHOTO' | 'FILE'; active: boolean;
  }) => {
    if (category) await api.categoryUpdate(category.category_id, input);
    else await api.categoryCreate(input);
  });
  return <form className="config-form" data-testid={category ? 'category-edit-form' : 'category-create-form'} onSubmit={(event) => submit(event, (form) => action.mutate({
    name: value(form, 'name'), description: value(form, 'description') || null,
    default_contractor_id: value(form, 'default_contractor_id') || null,
    requires_premises_access: checked(form, 'requires_premises_access'),
    result_requirement: value(form, 'result_requirement') as 'NONE' | 'PHOTO' | 'FILE',
    active: checked(form, 'active'),
  }))}>
    <label>Категория <input name="name" defaultValue={category?.name ?? ''} required /></label>
    <label>Описание <input name="description" defaultValue={category?.description ?? ''} /></label>
    <label>Подрядчик по умолчанию <select name="default_contractor_id" defaultValue={category?.default_contractor_id ?? ''}>
      <option value="">Без подстановки</option><ContractorOptions contractors={contractors} />
    </select></label>
    <label>Материал результата <select name="result_requirement" defaultValue={category?.result_requirement ?? 'NONE'}>
      {REQUIREMENTS.map((option) => <option data-requirement-option key={option.value} value={option.value}>{option.label}</option>)}
    </select></label>
    <label className="config-check"><input type="checkbox" name="requires_premises_access" defaultChecked={category?.requires_premises_access ?? false} /> Нужен доступ в помещение</label>
    <label className="config-check"><input type="checkbox" name="active" defaultChecked={category?.active ?? true} /> Активна</label>
    <Submit pending={action.isPending} label={category ? 'Обновить категорию' : 'Добавить категорию'} />
    <Feedback action={action} />
  </form>;
}

function Categories({ categories, contractors, api }: { readonly categories: Category[]; readonly contractors: Contractor[]; readonly api: Api }) {
  return <section className="config-card" aria-labelledby="config-categories">
    <h2 id="config-categories">Категории и маршрутизация</h2>
    <p className="config-note">Изменения действуют для новых случаев и будущих действий по правилам процесса. Деактивированную категорию нельзя выбрать для нового случая; существующие случаи продолжают жизненный цикл. Существующие случаи и история не переписываются.</p>
    <CategoryForm api={api} contractors={contractors} />
    <ul className="config-list">{categories.map((category) => <li key={category.category_id}>
      <h3>{category.name}</h3><CategoryForm key={`${category.category_id}:${JSON.stringify(category)}`} category={category} contractors={contractors} api={api} />
    </li>)}</ul>
  </section>;
}

function ContractorCard({ item, users, api }: { readonly item: Contractor; readonly users: User[]; readonly api: Api }) {
  const binding = useSave((active: boolean) => api.contractorBinding(item.contractor.contractor_id, active));
  const employee = useSave((input: { userId: string; active: boolean }) => api.contractorEmployee(item.contractor.contractor_id, input.userId, input.active));
  return <li><h3>{item.contractor.display_name}</h3>
    <p>Связь с УК: {item.organization_contractor.active ? 'активна' : 'неактивна'}</p>
    <button type="button" disabled={binding.isPending} onClick={() => binding.mutate(!item.organization_contractor.active)}>
      {item.organization_contractor.active ? 'Деактивировать связь' : 'Активировать связь'}
    </button>
    <Feedback action={binding} />
    <form className="config-form" onSubmit={(event) => submit(event, (form) => employee.mutate({ userId: value(form, 'user_id'), active: checked(form, 'active') }))}>
      <label>Заранее созданный сотрудник <select name="user_id" required>
        <option value="">Выберите пользователя</option>
        {users.filter((user) => user.app_user.active).map((user) => <option key={user.app_user.app_user_id} value={user.app_user.app_user_id}>{user.app_user.display_name}</option>)}
      </select></label>
      <label className="config-check"><input type="checkbox" name="active" defaultChecked /> Допущен к заданиям</label>
      <Submit pending={employee.isPending} label="Сохранить сотрудника" />
      <Feedback action={employee} />
    </form>
  </li>;
}

function Contractors({ contractors, users, api }: { readonly contractors: Contractor[]; readonly users: User[]; readonly api: Api }) {
  const create = useSave(api.contractorCreate);
  return <section className="config-card" aria-labelledby="config-contractors">
    <h2 id="config-contractors">Подрядчики</h2>
    <p className="config-note">Деактивация связи ограничивает будущий выбор подрядчика. Исторические назначения и результаты остаются в прежних случаях.</p>
    <form className="config-form" data-testid="contractor-create-form" onSubmit={(event) => submit(event, (form) => create.mutate({ display_name: value(form, 'display_name') }))}>
      <label>Название <input name="display_name" required /></label>
      <Submit pending={create.isPending} label="Добавить подрядчика" /><Feedback action={create} />
    </form>
    <ul className="config-list">{contractors.map((item) => <ContractorCard key={item.contractor.contractor_id} item={item} users={users} api={api} />)}</ul>
  </section>;
}

function UserForm({ user, houses, contractors, api }: { readonly user: User; readonly houses: House[]; readonly contractors: Contractor[]; readonly api: Api }) {
  const binding = user.role_bindings.find((item) => item.active) ?? user.role_bindings[0];
  const action = useSave((input: { role: typeof ROLES[number]; contractor_id: string | null; house_ids: string[]; active: boolean }) => api.userRoleBinding(user.app_user.app_user_id, input));
  return <form className="config-form" data-testid="user-role-form" onSubmit={(event) => submit(event, (form) => {
    const role = value(form, 'role') as typeof ROLES[number];
    action.mutate({ role, contractor_id: role === 'CONTRACTOR_EMPLOYEE' ? value(form, 'contractor_id') || null : null,
      house_ids: role === 'UK_EMPLOYEE' || role === 'UK_ADMIN' ? form.getAll('house_ids').map(String) : [],
      active: checked(form, 'active') });
  })}>
    <label>Роль <select name="role" defaultValue={binding?.role ?? 'RESIDENT'}>
      {ROLES.map((role) => <option data-role-option key={role} value={role}>{role}</option>)}
    </select></label>
    <label>Подрядчик для роли сотрудника <select name="contractor_id" defaultValue={binding?.contractor_id ?? ''}>
      <option value="">Не выбран</option><ContractorOptions contractors={contractors} />
    </select></label>
    <fieldset><legend>Доступные дома для роли УК</legend>
      {houses.filter((house) => house.active).map((house) => <label className="config-check" key={house.house_id}>
        <input type="checkbox" name="house_ids" value={house.house_id} defaultChecked={user.uk_house_access.some((access) => access.house_id === house.house_id && access.active)} /> {house.address}
      </label>)}
    </fieldset>
    <label className="config-check"><input type="checkbox" name="active" defaultChecked={binding?.active ?? true} /> Привязка активна</label>
    <Submit pending={action.isPending} label="Сохранить роль и привязки" /><Feedback action={action} />
  </form>;
}

function Users({ users, houses, contractors, api }: { readonly users: User[]; readonly houses: House[]; readonly contractors: Contractor[]; readonly api: Api }) {
  return <section className="config-card" aria-labelledby="config-users">
    <h2 id="config-users">Пользователи и роли</h2>
    <p className="config-note">Доступны только заранее созданные пользователи и связи в своей организации.</p>
    <ul className="config-list">{users.map((user) => <li key={user.app_user.app_user_id}>
      <h3>{user.app_user.display_name}</h3><UserForm key={`${user.app_user.app_user_id}:${JSON.stringify(user)}`} user={user} houses={houses} contractors={contractors} api={api} />
    </li>)}</ul>
  </section>;
}

function AdminContent({ api }: { readonly api: Api }) {
  const organization = useQuery({ queryKey: ['configuration', 'organization'], queryFn: api.organization, retry: false });
  const houses = useQuery({ queryKey: ['configuration', 'houses'], queryFn: api.houses, retry: false });
  const categories = useQuery({ queryKey: ['configuration', 'categories'], queryFn: api.categories, retry: false });
  const contractors = useQuery({ queryKey: ['configuration', 'contractors'], queryFn: api.contractors, retry: false });
  const users = useQuery({ queryKey: ['configuration', 'users'], queryFn: api.users, retry: false });
  const queries = [organization, houses, categories, contractors, users];
  if (queries.some((query) => query.isPending)) return <p role="status">Загружаем настройки…</p>;
  if (queries.some((query) => query.isError)) {
    const error = queries.find((query) => query.error)?.error;
    return <ErrorState message={error instanceof Error ? error.message : 'Не удалось загрузить настройки.'} onRetry={() => { queries.forEach((query) => { void query.refetch(); }); }} />;
  }
  if (!organization.data || !houses.data || !categories.data || !contractors.data || !users.data) return <ErrorState message="Не удалось загрузить настройки." />;
  return <div className="config-layout">
    <OrganizationForm organization={organization.data} api={api} />
    <Houses houses={houses.data} api={api} />
    <Categories categories={categories.data} contractors={contractors.data} api={api} />
    <Contractors contractors={contractors.data} users={users.data} api={api} />
    <Users users={users.data} houses={houses.data} contractors={contractors.data} api={api} />
  </div>;
}

export function ConfigurationPage() {
  const { status, session, authorizedFetch } = useSession();
  if (status !== 'ready') return <p role="status">Проверяем сессию…</p>;
  if (session?.effective_actor.role !== 'UK_ADMIN') return <ErrorState message="Недоступно: настройки организации открывает только администратор УК." />;
  return <div className="config-page">
    <h1>Настройка организации</h1>
    <p className="config-note">Сервер проверяет права и принадлежность данных при каждом запросе. Изменения конфигурации не переписывают историю случаев.</p>
    <AdminContent api={configurationApi(authorizedFetch)} />
  </div>;
}
