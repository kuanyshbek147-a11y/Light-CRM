export async function httpJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    throw new Error(`http_error_${response.status}`);
  }
  return (await response.json()) as T;
}
