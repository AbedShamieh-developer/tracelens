const LOGS_API_BASE = 'https://hmf3qmru35.execute-api.eu-central-1.amazonaws.com/prod/logs'
const CLIENTS_API_URL = 'https://hmf3qmru35.execute-api.eu-central-1.amazonaws.com/prod/clients'

export async function fetchLogs(client?: string, signal?: AbortSignal) {
  const url = new URL(LOGS_API_BASE)

  if (client) {
    url.searchParams.set('client', client)
  }

  const res = await fetch(url, { signal })

  if (!res.ok) {
    throw new Error('Failed to fetch logs')
  }

  return await res.json()
}

function extractClientNames(payload: unknown): string[] {
  if (Array.isArray(payload)) {
    return payload.flatMap((item) => {
      if (typeof item === 'string') {
        return item.trim() ? [item.trim()] : []
      }

      if (item && typeof item === 'object') {
        const record = item as Record<string, unknown>
        const value =
          (typeof record.client === 'string' && record.client.trim()) ||
          (typeof record.name === 'string' && record.name.trim()) ||
          (typeof record.id === 'string' && record.id.trim())

        return value ? [value] : []
      }

      return []
    })
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const record = payload as Record<string, unknown>
  const candidates = [record.clients, record.items, record.data, record.results, record.options]

  for (const candidate of candidates) {
    const names = extractClientNames(candidate)
    if (names.length > 0) {
      return names
    }
  }

  return []
}

export async function fetchClients(signal?: AbortSignal) {
  const res = await fetch(CLIENTS_API_URL, { signal })

  if (!res.ok) {
    throw new Error('Failed to fetch clients')
  }

  const payload = await res.json()
  const clients = extractClientNames(payload)

  if (clients.length > 0) {
    return clients
  }

  throw new Error('No clients were returned by the API')
}
