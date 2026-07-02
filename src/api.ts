export interface LogFile {
  key: string
  lastModified?: string
  size?: number
  url: string
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const DEFAULT_API_BASE_URL = 'https://hmf3qmru35.execute-api.eu-central-1.amazonaws.com/prod'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim() || DEFAULT_API_BASE_URL
const EXPECTED_COGNITO_ISSUER = 'https://cognito-idp.eu-central-1.amazonaws.com/eu-central-1_umR2kpRl8'

type TokenProvider = () => Promise<string | null | undefined>

function buildUrl(path: string) {
  return new URL(path.replace(/^\//, ''), `${API_BASE_URL.replace(/\/$/, '')}/`).toString()
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')

  if (parts.length !== 3) {
    return null
  }

  try {
    const normalized = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (normalized.length % 4)) % 4)
    const decoded = atob(normalized + padding)
    const payload = JSON.parse(decoded) as unknown

    if (!payload || typeof payload !== 'object') {
      return null
    }

    return payload as Record<string, unknown>
  } catch {
    return null
  }
}

async function readErrorBody(response: Response) {
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const payload = (await response.json()) as unknown
      if (payload && typeof payload === 'object') {
        const record = payload as Record<string, unknown>
        return (
          (typeof record.message === 'string' && record.message.trim()) ||
          (typeof record.error === 'string' && record.error.trim()) ||
          (typeof record.errorMessage === 'string' && record.errorMessage.trim()) ||
          JSON.stringify(payload)
        )
      }

      return JSON.stringify(payload)
    }

    const text = await response.text()
    return text.trim() || response.statusText || 'Unknown error'
  } catch {
    return response.statusText || 'Unknown error'
  }
}

async function authorizedJsonRequest<T>(path: string, getToken: TokenProvider, signal?: AbortSignal): Promise<T> {
  const token = await getToken()

  if (!token) {
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }

  const payload = decodeJwtPayload(token)
  const issuer = typeof payload?.iss === 'string' ? payload.iss : undefined

  if (issuer !== EXPECTED_COGNITO_ISSUER) {
    throw new ApiError(
      `Your browser is signed into a different Cognito user pool. The token issuer must be ${EXPECTED_COGNITO_ISSUER}, but got ${issuer ?? 'missing issuer'}.`,
      401,
    )
  }

  const url = buildUrl(path)

  let response: Response

  try {
    response = await fetch(url, {
      method: 'GET',
      signal,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error'
    throw new ApiError(`Unable to reach ${url}. ${reason}. If clients load but logs do not, check API Gateway CORS, the /logs route, and the backend URL.`, 0)
  }

  if (response.status === 401) {
    throw new ApiError('Your session has expired. Please sign in again.', 401)
  }

  if (!response.ok) {
    const detail = await readErrorBody(response)
    throw new ApiError(`Request failed with status ${response.status}: ${detail}`, response.status)
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return (await response.json()) as T
  }

  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ApiError('API returned a non-JSON response', 502)
  }
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    const candidates = [record.clients, record.logs, record.items, record.data, record.results, record.files]

    for (const candidate of candidates) {
      const nested = extractArray(candidate)
      if (nested.length > 0) {
        return nested
      }
    }
  }

  return []
}

function extractString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim()
  }

  return undefined
}

export async function fetchClients(getToken: TokenProvider, signal?: AbortSignal): Promise<string[]> {
  const payload = await authorizedJsonRequest<unknown>('/clients', getToken, signal)
  const rawItems = extractArray(payload)

  return rawItems.flatMap((item) => {
    if (typeof item === 'string') {
      return item.trim() ? [item.trim()] : []
    }

    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const name =
      extractString(record.client) ||
      extractString(record.name) ||
      extractString(record.id) ||
      extractString(record.tenant) ||
      extractString(record.tenantId)

    return name ? [name] : []
  })
}

export async function fetchLogs(client: string, getToken: TokenProvider, signal?: AbortSignal): Promise<LogFile[]> {
  const params = new URLSearchParams({ client })
  const payload = await authorizedJsonRequest<unknown>(`/logs?${params.toString()}`, getToken, signal)
  const rawItems = extractArray(payload)

  return rawItems.flatMap((item) => {
    if (typeof item === 'string') {
      const key = item.trim()
      return key ? [{ key, url: key }] : []
    }

    if (!item || typeof item !== 'object') {
      return []
    }

    const record = item as Record<string, unknown>
    const nested = record.data && typeof record.data === 'object' ? (record.data as Record<string, unknown>) : undefined
    const key =
      extractString(record.key) ||
      extractString(record.name) ||
      extractString(record.fileName) ||
      extractString(record.filename) ||
      (nested ? extractString(nested.key) || extractString(nested.name) || extractString(nested.fileName) || extractString(nested.filename) : undefined) ||
      extractString(record.url) ||
      extractString(record.presignedUrl) ||
      extractString(record.presigned_url) ||
      extractString(record.downloadUrl) ||
      extractString(record.download_url) ||
      extractString(record.signedUrl) ||
      extractString(record.signed_url) ||
      (nested
        ? extractString(nested.url) ||
          extractString(nested.presignedUrl) ||
          extractString(nested.presigned_url) ||
          extractString(nested.downloadUrl) ||
          extractString(nested.download_url) ||
          extractString(nested.signedUrl) ||
          extractString(nested.signed_url)
        : undefined)

    const url =
      extractString(record.url) ||
      extractString(record.presignedUrl) ||
      extractString(record.presigned_url) ||
      extractString(record.downloadUrl) ||
      extractString(record.download_url) ||
      extractString(record.signedUrl) ||
      extractString(record.signed_url) ||
      (nested
        ? extractString(nested.url) ||
          extractString(nested.presignedUrl) ||
          extractString(nested.presigned_url) ||
          extractString(nested.downloadUrl) ||
          extractString(nested.download_url) ||
          extractString(nested.signedUrl) ||
          extractString(nested.signed_url)
        : undefined)

    if (!key && !url) {
      return []
    }

    return [
      {
        key: key ?? url ?? 'log-file',
        lastModified:
          extractString(record.lastModified) ||
          extractString(record.LastModified) ||
          extractString(record.last_modified) ||
          (nested
            ? extractString(nested.lastModified) ||
              extractString(nested.LastModified) ||
              extractString(nested.last_modified)
            : undefined),
        size:
          typeof record.size === 'number'
            ? record.size
            : typeof record.Size === 'number'
              ? record.Size
              : typeof record.size_bytes === 'number'
                ? record.size_bytes
                : nested && typeof nested.size === 'number'
                  ? nested.size
                  : nested && typeof nested.Size === 'number'
                    ? nested.Size
                    : nested && typeof nested.size_bytes === 'number'
                      ? nested.size_bytes
                      : undefined,
        url: url ?? key ?? '',
      },
    ]
  })
}
