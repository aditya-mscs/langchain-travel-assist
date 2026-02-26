from __future__ import annotations

import math
import os
from datetime import date
from typing import Any

import httpx


USER_AGENT = "langchain-travel-assist/1.0"
MAX_RESULT_DISTANCE_KM = 30.0

WEATHER_CODE_LABELS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
}

INTEREST_QUERY_HINTS = {
    "club": "night club",
    "clubs": "night club",
    "nightlife": "night club",
    "art": "art gallery museum",
    "food": "restaurant",
    "music": "live music",
    "history": "historical landmark",
    "shopping": "shopping mall",
    "nature": "park",
}

PRICE_LEVEL_LABELS = {
    0: "Free",
    1: "$ (Budget)",
    2: "$$ (Moderate)",
    3: "$$$ (Premium)",
    4: "$$$$ (Luxury)",
}


def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


async def geocode_location(location: str) -> tuple[float, float]:
    query = location.strip()
    if not query:
        raise ValueError("Location is required")

    normalized_space = " ".join(query.split())
    normalized_punct = " ".join(
        query.replace("/", " ").replace("-", " ").replace("(", " ").replace(")", " ").replace(",", " ").split()
    )
    title_case = normalized_space.title()

    candidates: list[str] = []
    for candidate in [query, normalized_space, normalized_punct, title_case]:
        if candidate and candidate not in candidates:
            candidates.append(candidate)

    # 1) Open-Meteo geocoder (primary)
    geo_url = "https://geocoding-api.open-meteo.com/v1/search"
    async with httpx.AsyncClient(timeout=15.0) as client:
        for candidate in candidates:
            response = await client.get(geo_url, params={"name": candidate, "count": 5})
            response.raise_for_status()
            results = response.json().get("results", [])
            if results:
                first = results[0]
                return float(first["latitude"]), float(first["longitude"])

        # 2) Nominatim fallback (works better for stations/landmarks)
        for candidate in candidates:
            response = await client.get(
                "https://nominatim.openstreetmap.org/search",
                params={"q": candidate, "format": "jsonv2", "limit": 1},
                headers={"User-Agent": USER_AGENT},
            )
            response.raise_for_status()
            rows = response.json()
            if rows:
                return float(rows[0]["lat"]), float(rows[0]["lon"])

    raise ValueError(f"Could not geocode location: {location}")


async def weather_for_day(lat: float, lon: float, when: date) -> dict[str, Any]:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,weathercode,windspeed_10m_max",
        "timezone": "auto",
        "start_date": when.isoformat(),
        "end_date": when.isoformat(),
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
    daily = response.json().get("daily", {})
    max_temp = daily.get("temperature_2m_max", [None])[0]
    min_temp = daily.get("temperature_2m_min", [None])[0]
    code = daily.get("weathercode", [None])[0]
    max_wind_kph = daily.get("windspeed_10m_max", [None])[0]
    summary = WEATHER_CODE_LABELS.get(code, f"Weather code {code}")
    return {
        "summary": summary,
        "max_temp_c": max_temp,
        "min_temp_c": min_temp,
        "max_wind_kph": max_wind_kph,
    }


async def nearby_places(lat: float, lon: float, interest: str, limit: int = 6, location_hint: str | None = None) -> list[dict[str, Any]]:
    normalized_interest = (interest or "").strip().lower()
    keyword_hint = INTEREST_QUERY_HINTS.get(normalized_interest, normalized_interest or "popular places")

    google_places_key = os.getenv("GOOGLE_PLACES_API_KEY")
    if google_places_key:
        url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
        params = {
            "key": google_places_key,
            "location": f"{lat},{lon}",
            "radius": 8000,
            "keyword": f"{keyword_hint} in {location_hint}" if location_hint else keyword_hint,
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()

        payload = response.json()
        results = payload.get("results", [])
        output: list[dict[str, Any]] = []
        for place in results[:limit]:
            geometry = place.get("geometry", {}).get("location", {})
            types = place.get("types", [])
            rating = place.get("rating")
            rating_count = place.get("user_ratings_total")
            price_level = place.get("price_level")
            category = types[0].replace("_", " ") if types else "place"
            description = place.get("vicinity", "Popular nearby place")
            if rating is not None:
                description = f"{description}. Rated {rating}/5 ({rating_count or 0} reviews)."

            if "lat" not in geometry or "lng" not in geometry:
                continue

            place_lat = float(geometry["lat"])
            place_lon = float(geometry["lng"])
            if _distance_km(lat, lon, place_lat, place_lon) > MAX_RESULT_DISTANCE_KM:
                continue

            output.append(
                {
                    "name": place.get("name", "Unknown Place"),
                    "category": category,
                    "description": description,
                    "latitude": place_lat,
                    "longitude": place_lon,
                    "address": place.get("vicinity"),
                    "expense_estimate": PRICE_LEVEL_LABELS.get(price_level),
                    "estimated_minutes": None,
                }
            )

        if output:
            return output

    # Interest-first fallback with location query (works without Google Places key)
    if location_hint:
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        nominatim_params = {
            "q": f"{keyword_hint} in {location_hint}",
            "format": "jsonv2",
            "limit": limit,
            "viewbox": f"{lon - 0.45},{lat + 0.45},{lon + 0.45},{lat - 0.45}",
            "bounded": 1,
        }
        headers = {"User-Agent": USER_AGENT}
        async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
            nominatim_response = await client.get(nominatim_url, params=nominatim_params)
            nominatim_response.raise_for_status()

        entries = nominatim_response.json()
        from_nominatim: list[dict[str, Any]] = []
        for entry in entries:
            entry_lat = float(entry["lat"])
            entry_lon = float(entry["lon"])
            if _distance_km(lat, lon, entry_lat, entry_lon) > MAX_RESULT_DISTANCE_KM:
                continue

            name = (entry.get("name") or entry.get("display_name") or "Unknown Place").split(",")[0]
            from_nominatim.append(
                {
                    "name": name,
                    "category": entry.get("type", "place").replace("_", " "),
                    "description": entry.get("display_name", f"Popular place related to {interest or 'sightseeing'}"),
                    "latitude": entry_lat,
                    "longitude": entry_lon,
                    "address": entry.get("display_name"),
                    "expense_estimate": None,
                    "estimated_minutes": None,
                }
            )

        if from_nominatim:
            return from_nominatim

    url = "https://en.wikipedia.org/w/api.php"
    params = {
        "action": "query",
        "list": "geosearch",
        "gscoord": f"{lat}|{lon}",
        "gsradius": 10000,
        "gslimit": limit * 2,
        "format": "json",
    }
    headers = {"User-Agent": USER_AGENT}
    async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
    pages = response.json().get("query", {}).get("geosearch", [])
    filtered: list[dict[str, Any]] = []
    keyword = normalized_interest
    for page in pages:
        title = page.get("title", "")
        if keyword and keyword not in title.lower():
            continue
        filtered.append(
            {
                "name": title,
                "category": "place",
                "description": f"Popular place related to {interest or 'sightseeing'}.",
                "latitude": float(page["lat"]),
                "longitude": float(page["lon"]),
                "address": None,
                "expense_estimate": None,
                "estimated_minutes": None,
            }
        )
        if len(filtered) >= limit:
            break

    if not filtered:
        for page in pages[:limit]:
            filtered.append(
                {
                    "name": page.get("title", "Unknown Place"),
                    "category": "place",
                    "description": "Popular nearby landmark.",
                    "latitude": float(page["lat"]),
                    "longitude": float(page["lon"]),
                    "address": None,
                    "expense_estimate": None,
                    "estimated_minutes": None,
                }
            )
    return filtered


async def paid_events(location: str, when: date) -> list[dict[str, Any]]:
    key = os.getenv("TICKETMASTER_API_KEY")
    if not key:
        return []

    url = "https://app.ticketmaster.com/discovery/v2/events.json"
    params = {
        "apikey": key,
        "city": location,
        "startDateTime": f"{when.isoformat()}T00:00:00Z",
        "endDateTime": f"{when.isoformat()}T23:59:59Z",
        "size": 5,
        "sort": "date,asc",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
    events = response.json().get("_embedded", {}).get("events", [])
    output = []
    for event in events:
        venue = event.get("_embedded", {}).get("venues", [{}])[0].get("name", "Unknown venue")
        local_date = event.get("dates", {}).get("start", {}).get("localDate")
        local_time = event.get("dates", {}).get("start", {}).get("localTime")
        price_ranges = event.get("priceRanges", [])
        price_note = "Paid event"
        if price_ranges:
            low = price_ranges[0].get("min")
            high = price_ranges[0].get("max")
            currency = price_ranges[0].get("currency", "")
            price_note = f"{currency} {low}-{high}"
        output.append(
            {
                "name": event.get("name", "Unknown event"),
                "start_time": f"{local_date or when.isoformat()} {local_time or 'TBD'}",
                "venue": venue,
                "url": event.get("url", ""),
                "price_note": price_note,
            }
        )
    return output
