from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class PlanRequest(BaseModel):
    location: str = Field(..., description="City or neighborhood")
    date: date
    interests: List[str] = Field(default_factory=list)


class Stop(BaseModel):
    name: str
    category: str
    description: str
    latitude: float
    longitude: float
    estimated_minutes: int


class WeatherInfo(BaseModel):
    summary: str
    max_temp_c: Optional[float] = None
    min_temp_c: Optional[float] = None


class EventInfo(BaseModel):
    name: str
    start_time: str
    venue: str
    url: str
    price_note: str


class PlanResponse(BaseModel):
    location: str
    date: date
    weather: WeatherInfo
    places: List[Stop]
    events: List[EventInfo]
    route_order: List[str]
    estimated_total_minutes: int
    itinerary: str
