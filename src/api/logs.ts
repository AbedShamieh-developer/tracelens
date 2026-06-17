export const API_URL = 'https://1tfsvps2x4.execute-api.eu-central-1.amazonaws.com/dev/logs'

export async function fetchLogs(signal?: AbortSignal) {
  const res = await fetch(API_URL, { signal })

  if (!res.ok) {
    throw new Error('Failed to fetch logs')
  }

  return await res.json()
}
