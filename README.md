
<img width="443" height="457" alt="Screenshot 2026-03-07 at 7 09 09 PM" src="https://github.com/user-attachments/assets/29cb1820-ac25-450d-aa5e-d484bffd27b6" />
<img width="665" height="631" alt="Screenshot 2026-03-07 at 7 09 38 PM" src="https://github.com/user-attachments/assets/95aebc98-b82f-41d8-98b5-a086bf365794" />
<img width="643" height="661" alt="Screenshot 2026-03-07 at 7 09 48 PM" src="https://github.com/user-attachments/assets/9001355e-7f8f-43d5-9351-9fa6bc8cf40d" />


# Travel Assist

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

- `LLM_PROVIDER` (`openai`, `gemini`, or `none`; default `openai`)
- `OPENAI_API_KEY` (used when `LLM_PROVIDER=openai`)
- `OPENAI_MODEL` (optional; default `gpt-4o-mini`)
- `GOOGLE_API_KEY` (used when `LLM_PROVIDER=gemini`)
- `GEMINI_MODEL` (optional; default `gemini-1.5-flash`)
- `GOOGLE_PLACES_API_KEY` (optional; enables Google Places-based nearby recommendations)
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
