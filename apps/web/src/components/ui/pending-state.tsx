interface PendingStateProps {
  readonly label?: string;
}

export function PendingState({ label }: PendingStateProps) {
  return <div role="status" aria-live="polite">{label ?? 'Загрузка…'}</div>;
}
