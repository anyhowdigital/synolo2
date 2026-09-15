export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="break-words text-sm text-destructive" data-testid={id}>{message}</p>;
}
