# Backend/main.py

import re
from pathlib import Path
from datetime import datetime
from typing import List, Optional

from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# ------------------------------
# 0) APP + TEMPLATES SETUP
# ------------------------------

# Find the folder this file lives in (Backend/)
BASE_DIR = Path(__file__).resolve().parent

# Create ONE FastAPI app (do NOT create it twice)
app = FastAPI(title="Drexel Student Success API", version="0.1.0")

# Tell FastAPI where templates live (Backend/templates)
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

# ------------------------------
# 0B) UI ROUTES (HOMEPAGE + ADD CLASS)
# ------------------------------

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/add-class", response_class=HTMLResponse)
def add_class_page(request: Request):
    return templates.TemplateResponse("add_class.html", {"request": request})

# ------------------------------
# 1) DATA MODELS (Pydantic)
# ------------------------------

class Club(BaseModel):
    id: int
    name: str
    description: Optional[str] = None

class Event(BaseModel):
    id: int
    club_id: int
    title: str
    start_time: datetime
    end_time: datetime
    location: str
    description: Optional[str] = None

class AvailabilitySlot(BaseModel):
    start_time: datetime
    end_time: datetime

class Peer(BaseModel):
    id: int
    name: str
    year: str
    interests: List[str]
    availability: List[AvailabilitySlot]

# ------------------------------
# 1B) CLASS SCHEDULE MODELS
# ------------------------------

class ClassCreate(BaseModel):
    name: str
    days: List[str]        # ["M","W","F"]
    start_time: str        # "08:00 AM"
    end_time: str          # "09:20 AM"
    location: str

class ClassOut(ClassCreate):
    id: int

# ------------------------------
# 2) FAKE DATABASE (IN MEMORY)
# ------------------------------

CLUBS: List[Club] = [
    Club(id=1, name="Drexel Anime Club", description="Meetups, watch parties, manga talk."),
    Club(id=2, name="InfoSec Club", description="Cybersecurity workshops and CTF practice."),
]

EVENTS: List[Event] = [
    Event(
        id=1,
        club_id=1,
        title="Anime Club Meetup",
        start_time=datetime(2026, 2, 5, 18, 0),
        end_time=datetime(2026, 2, 5, 19, 30),
        location="Creese Student Center",
        description="Weekly meetup + watch party."
    ),
    Event(
        id=2,
        club_id=2,
        title="Cybersecurity Workshop",
        start_time=datetime(2026, 2, 6, 17, 0),
        end_time=datetime(2026, 2, 6, 18, 30),
        location="Bossone 302",
        description="Beginner-friendly: passwords, MFA, phishing."
    ),
]

PEERS: List[Peer] = [
    Peer(
        id=101,
        name="Punit",
        year="Senior",
        interests=["anime", "ui", "clubs"],
        availability=[
            AvailabilitySlot(
                start_time=datetime(2026, 2, 5, 17, 0),
                end_time=datetime(2026, 2, 5, 20, 0),
            )
        ]
    ),
    Peer(
        id=102,
        name="Abdullah",
        year="Junior",
        interests=["fitness", "design", "networking"],
        availability=[
            AvailabilitySlot(
                start_time=datetime(2026, 2, 5, 19, 0),
                end_time=datetime(2026, 2, 5, 22, 0),
            )
        ]
    ),
    Peer(
        id=103,
        name="Muhammed",
        year="Sophomore",
        interests=["scheduling", "data", "clubs"],
        availability=[
            AvailabilitySlot(
                start_time=datetime(2026, 2, 6, 16, 0),
                end_time=datetime(2026, 2, 6, 19, 0),
            )
        ]
    ),
]

# MVP class storage (in RAM)
CLASSES: List[ClassOut] = []
NEXT_CLASS_ID = 1

# ------------------------------
# 3) HELPER FUNCTIONS
# ------------------------------

def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    return a_start < b_end and b_start < a_end

def peer_is_available(peer: Peer, start: datetime, end: datetime) -> bool:
    for slot in peer.availability:
        if overlaps(slot.start_time, slot.end_time, start, end):
            return True
    return False

# ------------------------------
# 3B) VALIDATION HELPERS (CLASSES)
# ------------------------------

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s?(AM|PM)$", re.IGNORECASE)

def is_valid_time_str(t: str) -> bool:
    return bool(TIME_RE.match(t.strip()))

def normalize_days(days: List[str]) -> List[str]:
    allowed = {"M", "T", "W", "R", "F"}
    cleaned: List[str] = []
    for d in days:
        d = d.strip().upper()
        if d in allowed and d not in cleaned:
            cleaned.append(d)
    return cleaned

# ------------------------------
# 4) API ENDPOINTS (THE "DOORS")
# ------------------------------

@app.get("/clubs", response_model=List[Club])
def get_clubs():
    return CLUBS

@app.get("/clubs/{club_id}/events", response_model=List[Event])
def get_events_for_club(club_id: int):
    if not any(c.id == club_id for c in CLUBS):
        raise HTTPException(status_code=404, detail="Club not found")
    return [e for e in EVENTS if e.club_id == club_id]

@app.get("/availability", response_model=List[Peer])
def get_available_peers(
    start: datetime = Query(..., description="Start time (ISO format)"),
    end: datetime = Query(..., description="End time (ISO format)")
):
    if start >= end:
        raise HTTPException(status_code=400, detail="start must be before end")
    return [p for p in PEERS if peer_is_available(p, start, end)]

@app.get("/networking")
def networking_view(
    club_id: int = Query(..., description="Club ID to focus on"),
    start: datetime = Query(..., description="Networking start time (ISO format)"),
    end: datetime = Query(..., description="Networking end time (ISO format)")
):
    club = next((c for c in CLUBS if c.id == club_id), None)
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")

    club_events = [e for e in EVENTS if e.club_id == club_id]
    available_peers = [p for p in PEERS if peer_is_available(p, start, end)]

    return {
        "club": club,
        "events": club_events,
        "available_peers": available_peers,
        "requested_window": {"start": start, "end": end}
    }

# ------------------------------
# 4B) CLASS SCHEDULE ENDPOINTS
# ------------------------------

@app.get("/classes", response_model=List[ClassOut])
def list_classes():
    return CLASSES

@app.post("/classes", response_model=ClassOut)
def create_class(new_class: ClassCreate):
    global NEXT_CLASS_ID

    days = normalize_days(new_class.days)
    if len(days) == 0:
        raise HTTPException(status_code=400, detail="Invalid days. Use M,T,W,R,F.")

    if not is_valid_time_str(new_class.start_time):
        raise HTTPException(status_code=400, detail="Invalid start_time format. Example: 08:00 AM")
    if not is_valid_time_str(new_class.end_time):
        raise HTTPException(status_code=400, detail="Invalid end_time format. Example: 09:20 AM")

    saved = ClassOut(
        id=NEXT_CLASS_ID,
        name=new_class.name.strip(),
        days=days,
        start_time=new_class.start_time.strip(),
        end_time=new_class.end_time.strip(),
        location=new_class.location.strip(),
    )

    NEXT_CLASS_ID += 1
    CLASSES.append(saved)
    return saved