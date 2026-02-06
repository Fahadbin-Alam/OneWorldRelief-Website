from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

app = FastAPI(title="Drexel Student Success API")

class Event(BaseModel):
    id: int
    title: str
    club: str
    start_time: datetime
    end_time: datetime
    location: str
    description: Optional[str] = None
    url: Optional[str] = None

EVENTS: List[Event] = [
    Event(
        id=1,
        title="Anime Club Meetup",
        club="Drexel Anime Club",
        start_time=datetime(2026, 2, 5, 18, 0),
        end_time=datetime(2026, 2, 5, 19, 30),
        location="Creese Student Center",
        description="Weekly meetup + new season watch party.",
        url="https://example.com"
    ),
    Event(
        id=2,
        title="Cybersecurity Workshop",
        club="InfoSec Club",
        start_time=datetime(2026, 2, 6, 17, 0),
        end_time=datetime(2026, 2, 6, 18, 30),
        location="Bossone 302",
        description="Beginner-friendly: passwords, MFA, phishing.",
        url=None
    ),
]

@app.get("/events", response_model=List[Event])
def get_events():
    return EVENTS

@app.get("/events/{event_id}", response_model=Event)
def get_event(event_id: int):
    for e in EVENTS:
        if e.id == event_id:
            return e
    raise HTTPException(status_code=404, detail="Event not found")
