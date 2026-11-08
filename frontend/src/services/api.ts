const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

interface ApiError {
  message?: string;
}

/** Submit a JSON API request and raise an explicit error on failed responses. */
export async function apiRequest<T>(
  path: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();
  let result: (T & ApiError) | undefined;
  if (responseText) {
    try {
      result = JSON.parse(responseText) as T & ApiError;
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

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  const responseText = await response.text();
  let result: (T & ApiError) | undefined;
  if (responseText) {
    try {
      result = JSON.parse(responseText) as T & ApiError;
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

/** Transfer one document through the authenticated, time-limited R2 upload flow. */
export async function uploadFile(
  file: File,
  uploadType: "studentPhoto" | "signedFormPdf",
) {
  const { uploadUrl, key } = await apiRequest<{ uploadUrl: string; key: string }>(
    "/uploads/presign",
    { fileName: file.name, contentType: file.type, uploadType },
  );
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new Error("Não foi possível enviar o arquivo ao armazenamento. Verifique a conexão e o CORS do R2.");
  }
  const result = await apiRequest<{ key: string }>("/uploads/confirm", {
    key,
    uploadType,
    contentType: file.type,
  });
  return result.key;
}
