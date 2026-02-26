# LangChain Travel Assist

A full-stack travel-planning app with:
- **Backend:** FastAPI + LangChain agent (Python)
- **Frontend:** React + TypeScript (Vite)

The app builds a one-day plan for a location/date and returns:
- Weather forecast
- Famous nearby places based on interests
- Paid events (via Ticketmaster when API key is provided)
- Fastest visit order for the day

## Project structure

- `backend/` – FastAPI + LangChain planner API
- `frontend/` – React TypeScript UI

## Backend setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Environment variables:
- `OPENAI_API_KEY` (optional; enables LLM-generated itinerary text)
- `TICKETMASTER_API_KEY` (optional; enables paid events search)

## Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Set API URL if needed:

```bash
export VITE_API_BASE=http://localhost:8000
```

## API

`POST /api/plan`

```json
{
  "location": "Paris",
  "date": "2026-07-10",
  "interests": ["history", "food", "art"]
}
```
