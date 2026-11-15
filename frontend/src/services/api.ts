const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
export const API_BASE_URL = (
  configuredApiUrl || 'http://127.0.0.1:8000'
).replace(/\/+$/, '')

export async function fetchApiHealth(signal?: AbortSignal): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/health`, { signal })
  if (!response.ok) {
    throw new Error(`Backend health check failed with status ${response.status}`)
  }
}
