interface SuccessStateProps {
  readonly message: string;
}

export function SuccessState({ message }: SuccessStateProps) {
  return <div role="status">{message}</div>;
}
