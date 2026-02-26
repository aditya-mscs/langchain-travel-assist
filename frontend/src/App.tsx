import { FormEvent, useState } from 'react'
import { Loader2, LocateFixed } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Stop = {
  name: string
  category: string
  description: string
  latitude: number
  longitude: number
  address?: string | null
  expense_estimate?: string | null
  estimated_minutes?: number | null
}

type PlanResponse = {
  location: string
  date: string
  origin_latitude?: number | null
  origin_longitude?: number | null
  itinerary: string
  route_order: string[]
  estimated_total_minutes: number
  weather: { summary: string; min_temp_c: number | null; max_temp_c: number | null; max_wind_kph?: number | null }
  places: Stop[]
  events: { name: string; venue: string; start_time: string; price_note: string; url: string }[]
}

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

const INTEREST_TAGS = ['fun', 'art', 'club', 'food', 'history', 'music', 'shopping', 'nature'] as const

function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const radius = 6371
  const dLat = ((bLat - aLat) * Math.PI) / 180
  const dLon = ((bLon - aLon) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  return 2 * radius * Math.asin(Math.sqrt(x))
}

function getStopAttributes(stop: Stop, interestsValue: string) {
  const text = `${stop.name} ${stop.description}`.toLowerCase()
  const selectedInterests = interestsValue
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  const tags = new Set<string>()
  for (const interest of selectedInterests) {
    if (INTEREST_TAGS.includes(interest as (typeof INTEREST_TAGS)[number])) {
      tags.add(interest)
    }
  }

  if (/(museum|gallery|art)/.test(text)) tags.add('art')
  if (/(club|bar|night|dj)/.test(text)) tags.add('club')
  if (/(theater|broadway|music|show)/.test(text)) {
    tags.add('fun')
    tags.add('art')
  }
  if (/(restaurant|food|cafe|dining)/.test(text)) tags.add('food')
  if (/(park|garden|beach|trail)/.test(text)) tags.add('nature')

  const list = [...tags]
  return list.length ? list.slice(0, 3) : ['sightseeing']
}

function stopInterestScore(stop: Stop, interestsValue: string) {
  const text = `${stop.name} ${stop.description} ${stop.category}`.toLowerCase()
  const selectedInterests = interestsValue
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)

  let score = 0
  for (const interest of selectedInterests) {
    if (text.includes(interest)) {
      score += 3
      continue
    }
    for (const part of interest.split(' ')) {
      if (part.length > 2 && text.includes(part)) {
        score += 1
      }
    }
  }
  return score
}

export function App() {
  const [location, setLocation] = useState('New York')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [interests, setInterests] = useState('history, food, art, fun, clubs')
  const [loading, setLoading] = useState(false)
  const [locationLoading, setLocationLoading] = useState(false)
  const [locationError, setLocationError] = useState('')
  const [currentCoords, setCurrentCoords] = useState<{ lat: number; lon: number } | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<PlanResponse | null>(null)

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported in this browser.')
      return
    }

    setLocationLoading(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords
          setCurrentCoords({ lat: latitude, lon: longitude })
          const reverseGeocode = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
          )

          if (!reverseGeocode.ok) {
            throw new Error('Unable to resolve your location name.')
          }

          const data = await reverseGeocode.json()
          const address = data.address ?? {}
          const resolvedLocation =
            address.city ||
            address.town ||
            address.village ||
            address.county ||
            address.state ||
            data.display_name ||
            `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`

          setLocation(resolvedLocation)
        } catch (err) {
          setLocationError(err instanceof Error ? err.message : 'Could not detect location.')
        } finally {
          setLocationLoading(false)
        }
      },
      (geoError) => {
        setLocationLoading(false)
        setLocationError(geoError.message || 'Location permission denied.')
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }


  const sortedStops = result
    ? [...result.places].sort((a, b) => {
      const aScore = stopInterestScore(a, interests)
      const bScore = stopInterestScore(b, interests)
      if (aScore !== bScore) {
        return bScore - aScore
      }

      if (!currentCoords) {
        const aIdx = result.route_order.indexOf(a.name)
        const bIdx = result.route_order.indexOf(b.name)
        return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
      }
      const aDist = distanceKm(currentCoords.lat, currentCoords.lon, a.latitude, a.longitude)
      const bDist = distanceKm(currentCoords.lat, currentCoords.lon, b.latitude, b.longitude)
      return aDist - bDist
    })
    : []

  const distanceOrigin = currentCoords ?? (result?.origin_latitude != null && result?.origin_longitude != null
    ? { lat: result.origin_latitude, lon: result.origin_longitude }
    : null)

  const weatherSuggestion = result
    ? result.weather.max_temp_c !== null && result.weather.max_temp_c >= 30
      ? 'It is warm. Start outdoor spots early and carry water.'
      : result.weather.max_temp_c !== null && result.weather.max_temp_c <= 8
        ? 'It is chilly. Keep indoor stops between outdoor walks.'
        : (result.weather.max_wind_kph ?? 0) >= 25
          ? 'Wind is high. Prefer streets with indoor options and a jacket.'
          : 'Great balance weather. Mix walking + 1-2 indoor stops.'
    : ''

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 25000)

    try {
      const response = await fetch(`${API_BASE}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          location,
          date,
          interests: interests.split(',').map((item) => item.trim()).filter(Boolean)
        })
      })
      if (!response.ok) {
        let message = `API error ${response.status}`
        try {
          const payload = await response.json()
          if (payload?.detail && typeof payload.detail === 'string') {
            message = payload.detail
          }
        } catch {
          // keep default message
        }
        throw new Error(message)
      }
      const data = (await response.json()) as PlanResponse
      setResult(data)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. Please try again.')
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    } finally {
      window.clearTimeout(timeoutId)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-blue-100 to-purple-200 flex flex-col items-center py-10 px-4">
      <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-blue-500 to-purple-500 mb-8">Travel Assist</h1>
      <form onSubmit={onSubmit} className="bg-white/80 rounded-xl shadow-lg p-8 w-full max-w-md flex flex-col gap-6">
        <label className="flex flex-col gap-2 text-lg font-semibold">
          Location
          <div className="relative">
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-pink-400"
            />
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locationLoading}
              aria-label="Use current location"
              title="Use current location"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-pink-500 disabled:opacity-60"
            >
              {locationLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
            </button>
          </div>
          {locationError && <span className="text-sm text-red-500">{locationError}</span>}
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

      {loading && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching your day plan...
        </div>
      )}

      {error && <p className="mt-4 text-red-500 font-bold">{error}</p>}

      {result && (
        <div className="mt-8 w-full max-w-3xl space-y-4">
          <section className="bg-white/90 rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold mb-2">{result.location} • {result.date}</h2>
            <p><strong>Weather:</strong> {result.weather.summary}</p>
            <p><strong>Temperature:</strong> {result.weather.min_temp_c}°C to {result.weather.max_temp_c}°C</p>
            <p><strong>Wind:</strong> {result.weather.max_wind_kph ?? 'N/A'} km/h</p>
            <p className="mt-2 text-sm text-slate-700"><strong>Suggestion:</strong> {weatherSuggestion}</p>
          </section>

          <section className="bg-white/90 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Closest Options (Exact Coordinates)</h3>
            <div className="space-y-2 text-sm">
              {sortedStops.map((stop, index) => {
                const distance = distanceOrigin
                  ? distanceKm(distanceOrigin.lat, distanceOrigin.lon, stop.latitude, stop.longitude)
                  : null
                const destinationQuery = encodeURIComponent(`${stop.name}, ${stop.latitude}, ${stop.longitude}`)
                const mapsSearchLink = `https://www.google.com/maps/search/?api=1&query=${destinationQuery}`
                const mapsTransitLink = currentCoords
                  ? `https://www.google.com/maps/dir/?api=1&origin=${currentCoords.lat},${currentCoords.lon}&destination=${destinationQuery}&travelmode=transit`
                  : `https://www.google.com/maps/dir/?api=1&destination=${destinationQuery}&travelmode=transit`
                const attributes = getStopAttributes(stop, interests)
                return (
                  <div key={stop.name} className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="font-semibold">
                      #{index + 1}{' '}
                      <a href={mapsSearchLink} target="_blank" rel="noreferrer" className="text-pink-600 hover:underline">
                        {stop.name}
                      </a>{' '}
                      ({distance !== null ? `~${distance.toFixed(1)} km away` : 'distance unavailable'}{stop.estimated_minutes != null ? ` • ~${stop.estimated_minutes} mins to explore` : ''})
                    </p>
                    <p className="text-slate-600">
                      <strong>Attributes:</strong> {attributes.join(', ')}
                    </p>
                    <p className="text-slate-600"><strong>Addr:</strong> {stop.address ?? 'Not available'}</p>
                    {stop.expense_estimate && <p className="text-slate-600"><strong>Expense estimate:</strong> {stop.expense_estimate}</p>}
                    <p className="text-slate-600">{stop.description}</p>
                    <div className="mt-2 flex gap-2">
                      <a
                        href={mapsTransitLink}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Public transport
                      </a>
                      <button
                        type="button"
                        onClick={() => window.alert('Book Uber: yet to implement')}
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Book Uber
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="bg-white/90 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-3">Next-by-Hour Plan</h3>
            <div className="space-y-3">
              {sortedStops.map((stop, index) => {
                const hour = 10 + index
                const showFood = hour === 13 || hour === 19
                return (
                  <div key={`${stop.name}-${index}`} className="rounded-md border border-slate-200 bg-white p-3">
                    <p className="font-semibold">In next 1 hour: Visit {stop.name}</p>
                    <p className="text-sm text-slate-600">Popularity pick #{index + 1}{stop.estimated_minutes != null ? ` • Typical visit: ${stop.estimated_minutes} mins` : ' • Typical visit: not provided'}</p>
                    {showFood && (
                      <p className="text-sm text-pink-600 mt-1">
                        {hour === 13 ? 'Lunch idea:' : 'Dinner idea:'} Try a famous local food spot near {stop.name}.
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </section>

          <section className="bg-white/90 rounded-xl shadow-lg p-6">
            <h3 className="text-xl font-semibold mb-2">Paid Events</h3>
            <ul className="list-disc pl-5">
              {result.events.length === 0 && <li>No paid events found.</li>}
              {result.events.map((event) => (
                <li key={`${event.name}-${event.start_time}`} className="mb-2">
                  <a href={event.url} target="_blank" rel="noreferrer" className="text-pink-500 hover:underline font-bold">{event.name}</a> at {event.venue}{' '}
                  <span className="text-gray-500">({event.start_time} • {event.price_note})</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </div>
  )
}
