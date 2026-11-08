interface ApiError {
  message?: string;
}

export async function adminRequest<T>(
  path: string,
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE" = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}${path}`, {
    method,
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let result: (T & ApiError) | undefined;
  if (text) {
    try {
      result = JSON.parse(text) as T & ApiError;
    } catch {
      throw new Error(`A API retornou uma resposta inválida (HTTP ${response.status}).`);
    }
  }
  if (!result) {
    throw new Error(`A API retornou uma resposta vazia (HTTP ${response.status}).`);
  }
  if (!response.ok) {
    throw new Error(result.message ?? "Não foi possível concluir a solicitação.");
  }
  return result;
}

export async function adminDownload(
  path: string,
  token: string,
  body: unknown,
): Promise<Blob> {
  const response = await fetch(`${import.meta.env.VITE_API_URL ?? "/api/v1"}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    let message = "Não foi possível gerar o relatório.";
    if (text) {
      try {
        const result = JSON.parse(text) as ApiError;
        message = result.message ?? message;
      } catch {
        message = `A API retornou uma resposta inválida (HTTP ${response.status}).`;
      }
    }
    throw new Error(message);
  }
  return response.blob();
}
