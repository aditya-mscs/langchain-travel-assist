import { FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'

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
  const [interests, setInterests] = useState('history, food, art, fun, clubs')
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
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-blue-100 to-purple-200 flex flex-col items-center py-10">
      <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-blue-500 to-purple-500 mb-8">LangChain Travel Assist</h1>
      <form onSubmit={onSubmit} className="bg-white/80 rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col gap-6">
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Location
          <input value={location} onChange={(e) => setLocation(e.target.value)} required className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-pink-400" />
        </label>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </label>
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Interests (comma-separated)
          <input value={interests} onChange={(e) => setInterests(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400" />
        </label>
        <Button type="submit" disabled={loading} className="bg-gradient-to-r from-pink-500 via-blue-500 to-purple-500 text-white font-bold py-2 px-4 rounded-md hover:scale-105 transition-transform">
          {loading ? 'Planning...' : 'Build my day plan'}
        </Button>
      </form>

      {error && <p className="mt-4 text-red-500 font-bold">{error}</p>}

      {result && (
        <section className="bg-white/90 rounded-xl shadow-lg p-8 mt-8 w-full max-w-md">
          <h2 className="text-2xl font-bold mb-2">{result.location} • {result.date}</h2>
          <p className="mb-2"><strong>Weather:</strong> {result.weather.summary} ({result.weather.min_temp_c}°C to {result.weather.max_temp_c}°C)</p>
          <p className="mb-2"><strong>Estimated day length:</strong> {result.estimated_total_minutes} mins</p>
          <p className="mb-2"><strong>Fastest order:</strong> {result.route_order.join(' → ')}</p>
          <h3 className="text-xl font-semibold mt-4 mb-2">Itinerary</h3>
          <pre className="bg-gray-100 rounded-md p-4 text-sm mb-4">{result.itinerary}</pre>
          <h3 className="text-xl font-semibold mb-2">Paid Events</h3>
          <ul className="list-disc pl-5">
            {result.events.length === 0 && <li>No paid events found.</li>}
            {result.events.map((event) => (
              <li key={`${event.name}-${event.start_time}`} className="mb-2">
                <a href={event.url} target="_blank" rel="noreferrer" className="text-pink-500 hover:underline font-bold">{event.name}</a> at {event.venue} <span className="text-gray-500">({event.price_note})</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
