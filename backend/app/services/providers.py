from __future__ import annotations

import os
from datetime import date
from typing import Any

import httpx


USER_AGENT = "langchain-travel-assist/1.0"


async def geocode_location(location: str) -> tuple[float, float]:
    url = "https://geocoding-api.open-meteo.com/v1/search"
    params = {"name": location, "count": 1}
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(url, params=params)
        response.raise_for_status()
    results = response.json().get("results", [])
    if not results:
        raise ValueError(f"Could not geocode location: {location}")
    first = results[0]
    return float(first["latitude"]), float(first["longitude"])


async def weather_for_day(lat: float, lon: float, when: date) -> dict[str, Any]:
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": "temperature_2m_max,temperature_2m_min,weathercode",
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
    return {
        "summary": f"Forecast weather code {code}",
        "max_temp_c": max_temp,
        "min_temp_c": min_temp,
    }


async def nearby_places(lat: float, lon: float, interest: str, limit: int = 6) -> list[dict[str, Any]]:
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
    keyword = interest.lower().strip()
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
                "estimated_minutes": 60,
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
                    "estimated_minutes": 60,
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
                "start_time": event.get("dates", {}).get("start", {}).get("localDate", when.isoformat()),
                "venue": venue,
                "url": event.get("url", ""),
                "price_note": price_note,
            }
        )
    return output
