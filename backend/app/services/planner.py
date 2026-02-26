from __future__ import annotations

import math
import os
from datetime import date

from langchain.agents import AgentType, initialize_agent
from langchain.tools import tool
from langchain_openai import ChatOpenAI

from app.models import EventInfo, PlanResponse, Stop, WeatherInfo
from app.services.providers import geocode_location, nearby_places, paid_events, weather_for_day


class TravelPlanner:
    async def create_plan(self, location: str, when: date, interests: list[str]) -> PlanResponse:
        lat, lon = await geocode_location(location)
        weather_raw = await weather_for_day(lat, lon, when)

        places_raw = []
        for interest in interests[:3] or [""]:
            places_raw.extend(await nearby_places(lat, lon, interest, limit=3))

        deduped = {place["name"]: place for place in places_raw}
        stops = [Stop(**value) for value in list(deduped.values())[:6]]

        events = [EventInfo(**event) for event in await paid_events(location, when)]
        route_order, transit_minutes = self._nearest_neighbor_route(lat, lon, stops)
        total_minutes = transit_minutes + sum(stop.estimated_minutes for stop in stops)

        itinerary = self._build_itinerary(location, when, interests, weather_raw, stops, events, route_order)

        return PlanResponse(
            location=location,
            date=when,
            weather=WeatherInfo(**weather_raw),
            places=stops,
            events=events,
            route_order=route_order,
            estimated_total_minutes=total_minutes,
            itinerary=itinerary,
        )

    def _nearest_neighbor_route(self, start_lat: float, start_lon: float, stops: list[Stop]) -> tuple[list[str], int]:
        if not stops:
            return [], 0

        remaining = stops.copy()
        route: list[str] = []
        current_lat, current_lon = start_lat, start_lon
        total_minutes = 0

        while remaining:
            nxt = min(remaining, key=lambda s: self._distance_km(current_lat, current_lon, s.latitude, s.longitude))
            km = self._distance_km(current_lat, current_lon, nxt.latitude, nxt.longitude)
            total_minutes += max(10, int((km / 25) * 60))
            route.append(nxt.name)
            current_lat, current_lon = nxt.latitude, nxt.longitude
            remaining.remove(nxt)

        return route, total_minutes

    @staticmethod
    def _distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        radius = 6371
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        return 2 * radius * math.asin(math.sqrt(a))

    def _build_itinerary(
        self,
        location: str,
        when: date,
        interests: list[str],
        weather_raw: dict,
        stops: list[Stop],
        events: list[EventInfo],
        route_order: list[str],
    ) -> str:
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            return self._deterministic_itinerary(location, when, interests, weather_raw, stops, events, route_order)

        @tool
        def weather_tool(query: str) -> str:
            """Return the weather summary for the target date."""
            return f"{weather_raw['summary']} (min {weather_raw['min_temp_c']}°C, max {weather_raw['max_temp_c']}°C)"

        @tool
        def places_tool(query: str) -> str:
            """Return major places to visit."""
            return ", ".join(route_order) or "No places found"

        @tool
        def events_tool(query: str) -> str:
            """Return paid events for the day."""
            if not events:
                return "No paid events found"
            return "; ".join(f"{e.name} at {e.venue} ({e.price_note})" for e in events)

        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.3)
        agent = initialize_agent(
            tools=[weather_tool, places_tool, events_tool],
            llm=llm,
            agent=AgentType.ZERO_SHOT_REACT_DESCRIPTION,
            verbose=False,
        )
        prompt = (
            f"Create a one-day travel itinerary for {location} on {when.isoformat()} for interests: {', '.join(interests) or 'general'}. "
            "Include weather tips, order of places, and best event option."
        )
        return str(agent.run(prompt))

    @staticmethod
    def _deterministic_itinerary(
        location: str,
        when: date,
        interests: list[str],
        weather_raw: dict,
        stops: list[Stop],
        events: list[EventInfo],
        route_order: list[str],
    ) -> str:
        lines = [
            f"One-day plan for {location} on {when.isoformat()}.",
            f"Weather: {weather_raw['summary']} ({weather_raw['min_temp_c']}°C to {weather_raw['max_temp_c']}°C).",
            f"Interests: {', '.join(interests) if interests else 'general sightseeing'}.",
            "Recommended route:",
        ]
        lines.extend(f"- {name}" for name in route_order)
        if events:
            lines.append(f"Evening paid event: {events[0].name} at {events[0].venue} ({events[0].price_note}).")
        else:
            lines.append("No paid events were found (or Ticketmaster API key is not configured).")
        lines.append("Use rideshare/public transit between distant stops to fit everything in one day.")
        return "\n".join(lines)
