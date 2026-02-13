# Drexel Student Success App

## Backend

This project is built using FastAPI.

### Features Implemented
- Clubs endpoint
- Club events endpoint
- Peer availability
- Networking view

### Run Locally

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install fastapi uvicorn
uvicorn main:app --reload
