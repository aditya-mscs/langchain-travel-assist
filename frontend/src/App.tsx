import { FormEvent, useState } from 'react'

type PlanResponse = {
  location: string
  date: string
  itinerary: string
  route_order: string[]
  estimated_total_minutes: number
  weather: { summary: string; min_temp_c: number | null; max_temp_c: number | null }
  events: { name: string; venue: string; start_time: string; price_note: string; url: string }[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

export function App() {
  const [location, setLocation] = useState('Paris')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [interests, setInterests] = useState('history, food, art')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PlanResponse | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`${API_BASE}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location,
          date,
          interests: interests.split(',').map((item) => item.trim()).filter(Boolean)
        })
      })
      if (!response.ok) {
        throw new Error(`API error ${response.status}`)
      }
      const data = (await response.json()) as PlanResponse
      setResult(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1>LangChain Travel Assist</h1>
      <form onSubmit={onSubmit} className="panel">
        <label>
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} required />
        </label>
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </label>
        <label>
          Interests (comma-separated)
          <input value={interests} onChange={(e) => setInterests(e.target.value)} />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Planning...' : 'Build my day plan'}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <section className="panel">
          <h2>{result.location} • {result.date}</h2>
          <p><strong>Weather:</strong> {result.weather.summary} ({result.weather.min_temp_c}°C to {result.weather.max_temp_c}°C)</p>
          <p><strong>Estimated day length:</strong> {result.estimated_total_minutes} mins</p>
          <p><strong>Fastest order:</strong> {result.route_order.join(' → ')}</p>
          <h3>Itinerary</h3>
          <pre>{result.itinerary}</pre>
          <h3>Paid Events</h3>
          <ul>
            {result.events.length === 0 && <li>No paid events found.</li>}
            {result.events.map((event) => (
              <li key={`${event.name}-${event.start_time}`}>
                <a href={event.url} target="_blank" rel="noreferrer">{event.name}</a> at {event.venue} ({event.price_note})
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
