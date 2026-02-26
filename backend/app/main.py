from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.models import PlanRequest, PlanResponse
from app.services.planner import TravelPlanner

app = FastAPI(title="LangChain Travel Assist API")
planner = TravelPlanner()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/plan", response_model=PlanResponse)
async def create_plan(payload: PlanRequest) -> PlanResponse:
    return await planner.create_plan(payload.location, payload.date, payload.interests)
