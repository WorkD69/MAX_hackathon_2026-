import { act } from 'react';
import { vi } from 'vitest';

/**
 * Awaits an async UI outcome deterministically.
 *
 * `vi.waitFor` polls outside React's batching, so a plain call makes the
 * subsequent state updates unwrapped and triggers act() warnings. Wrapping the
 * poll keeps every update inside act().
 */
export async function waitForUi(assertion: () => void): Promise<void> {
  await act(async () => {
    await vi.waitFor(assertion);
  });
}

/**
 * Sets a controlled field value.
 *
 * React 19 keeps its own value tracker, so assigning `element.value` directly is
 * ignored. The native setter must be used for onChange to fire.
 */
export function setNativeValue(
  element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
): void {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')?.set;
  setter?.call(element, value);
  const type = element instanceof HTMLSelectElement ? 'change' : 'input';
  element.dispatchEvent(new Event(type, { bubbles: true }));
}

/** Fills the three required CreateCase fields with the fixture option ids. */
export async function fillCreateCaseForm(container: HTMLElement, description = 'Не греет стояк'): Promise<void> {
  const category = container.querySelector<HTMLSelectElement>('[data-testid="category-select"]');
  const premise = container.querySelector<HTMLSelectElement>('[data-testid="premise-select"]');
  const text = container.querySelector<HTMLTextAreaElement>('[data-testid="description-input"]');
  if (!category || !premise || !text) throw new Error('create case form is not rendered yet');
  await act(async () => {
    setNativeValue(category, category.options[1]?.value ?? '');
    setNativeValue(premise, premise.options[1]?.value ?? '');
    setNativeValue(text, description);
  });
}
