interface ErrorStateProps {
  readonly message?: string;
  readonly onRetry?: () => void;
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div role="alert">
      <p>{message ?? 'Произошла ошибка'}</p>
      {onRetry ? <button type="button" onClick={onRetry}>Повторить</button> : null}
    </div>
  );
}
