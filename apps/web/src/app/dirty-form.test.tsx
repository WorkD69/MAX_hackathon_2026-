import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { renderReactTree } from './test-render.js';
import { DirtyFormProvider, useDirtyForm } from './dirty-form.js';

test('dirty form requires an in-app decision before role or navigation action', () => {
  const navigate = vi.fn();
  function Controls() {
    const { setDirty, guard } = useDirtyForm();
    return <><button onClick={() => setDirty(true)}>Изменить форму</button>
      <button onClick={() => guard(navigate)}>Сменить роль</button></>;
  }
  const view = renderReactTree(<DirtyFormProvider><Controls /></DirtyFormProvider>);
  try {
    const click = (text: string) => act(() => { [...view.container.querySelectorAll('button')]
      .find(button => button.textContent === text)!.click(); });
    click('Изменить форму');
    click('Сменить роль');
    expect(navigate).not.toHaveBeenCalled();
    expect(view.container.querySelector('[role="dialog"]')?.textContent).toContain('Введённые данные не сохранены');
    click('Продолжить заполнение');
    expect(navigate).not.toHaveBeenCalled();
    click('Сменить роль');
    click('Перейти');
    expect(navigate).toHaveBeenCalledTimes(1);
  } finally { view.unmount(); }
});
