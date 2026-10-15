export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assertFound<T>(value: T | undefined | null): T {
  if (!value) throw new ApiError(404, "NOT_FOUND", "Resource not found");
  return value;
}
