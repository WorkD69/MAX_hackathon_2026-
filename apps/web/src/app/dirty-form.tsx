import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface DirtyFormContextValue {
  setDirty: (value: boolean) => void;
  guard: (action: () => void) => boolean;
}

const DirtyFormContext = createContext<DirtyFormContextValue>({ setDirty: () => {}, guard: action => { action(); return true; } });

export function DirtyFormProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  const guard = useCallback((action: () => void) => {
    if (!dirty) { action(); return true; }
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending(() => action);
    return false;
  }, [dirty]);
  useEffect(() => { if (pending) cancelButton.current?.focus(); }, [pending]);
  const cancel = () => { setPending(null); origin.current?.focus(); };
  return <DirtyFormContext.Provider value={{ setDirty, guard }}>
    {children}
    {pending && <div className="app-dialog-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="dirty-title" className="app-dialog"
      onKeyDown={event => { if (event.key === 'Escape') cancel(); }}>
      <h2 id="dirty-title">Введённые данные не сохранены</h2>
      <p>Перейти всё равно?</p>
      <div className="app-dialog__actions">
        <button type="button" ref={cancelButton} onClick={cancel}>Продолжить заполнение</button>
        <button type="button" onClick={() => { const action = pending; setPending(null); setDirty(false); action(); }}>Перейти</button>
      </div>
    </section></div>}
  </DirtyFormContext.Provider>;
}

export function useDirtyForm() { return useContext(DirtyFormContext); }
