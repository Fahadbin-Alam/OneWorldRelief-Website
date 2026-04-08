from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from pathlib import Path

# -----------------------------
# Paths
# -----------------------------
BASE_DIR = Path(__file__).resolve().parent

# -----------------------------
# App + Templates + Static
# -----------------------------
app = FastAPI(title="Drexel Student Success API")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# -----------------------------
# Data Models
# -----------------------------
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

class ClassItem(BaseModel):
    id: int
    name: str
    days: List[str]          # ["M","W","F"]
    start_time: str          # "11:00 AM"
    end_time: str            # "11:50 AM"
    location: str

class Favorite(BaseModel):
    item_id: int
    item_type: str  # "club" or "event"

class PlannerCourse(BaseModel):
    id: int
    name: str
    days: List[str]
    start_time: str
    end_time: str
    location: str

# -----------------------------
# Fake DB (in-memory)
# -----------------------------
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

CLASSES: List[ClassItem] = [
    ClassItem(
        id=1,
        name="General Psychology I",
        days=["M","W","F"],
        start_time="11:00 AM",
        end_time="11:50 AM",
        location="Nesbitt 111"
    ),
    ClassItem(
        id=2,
        name="Data Structures",
        days=["T","R"],
        start_time="2:00 PM",
        end_time="3:30 PM",
        location="Bossone 303"
    ),
    ClassItem(
        id=3,
        name="Calculus II",
        days=["M","W","F"],
        start_time="1:00 PM",
        end_time="1:50 PM",
        location="Curtis 113"
    ),
    ClassItem(
        id=4,
        name="Web Development",
        days=["T","R"],
        start_time="10:00 AM",
        end_time="11:30 AM",
        location="Raytheon 204"
    ),
    ClassItem(
        id=5,
        name="Public Speaking",
        days=["M","W"],
        start_time="3:00 PM",
        end_time="4:30 PM",
        location="Myers 101"
    ),
]

FAVORITES: List[Favorite] = []

PLANNER_ITEMS: List[PlannerCourse] = []

# -----------------------------
# Helpers
# -----------------------------
def time_to_minutes(t: str) -> int:
    # "HH:MM AM/PM"
    # safe parse even if hour is 1-digit ("8:00 AM") -> normalize first
    t = t.strip()
    parts = t.split()
    hm = parts[0]
    ampm = parts[1].upper()
    hour_str, minute_str = hm.split(":")
    hour = int(hour_str)
    minute = int(minute_str)

    if ampm == "PM" and hour != 12:
        hour += 12
    if ampm == "AM" and hour == 12:
        hour = 0
    return hour * 60 + minute

DAY_ORDER = {"M": 1, "T": 2, "W": 3, "R": 4, "F": 5, "S": 6, "U": 7}

def sort_classes(items: List[ClassItem]) -> List[ClassItem]:
    # sort by first day then start time
    return sorted(
        items,
        key=lambda c: (DAY_ORDER.get(c.days[0], 99), time_to_minutes(c.start_time), c.name)
    )

# -----------------------------
# HTML PAGES (Clean Rendering)
# -----------------------------
@app.get("/", response_class=HTMLResponse)
def home():
    try:
        html_path = BASE_DIR.parent / "SUCCEED_Final_Version.html"
        with open(str(html_path), "r", encoding="utf-8") as f:
            content = f.read()
        return content
    except Exception as e:
        return f"<h1>Error: {str(e)}</h1>"

@app.get("/clubs-view", response_class=HTMLResponse)
def clubs_view(request: Request):
    return templates.TemplateResponse("clubs.html", {"request": request, "clubs": [c.dict() for c in CLUBS]})

@app.get("/clubs/{club_id}/events-view", response_class=HTMLResponse)
def events_view(request: Request, club_id: int):
    if not any(c.id == club_id for c in CLUBS):
        raise HTTPException(status_code=404, detail="Club not found")

    club = next(c for c in CLUBS if c.id == club_id)
    club_events = sorted([e for e in EVENTS if e.club_id == club_id], key=lambda e: e.start_time)

    return templates.TemplateResponse(
        "events.html",
        {"request": request, "club": club, "events": club_events}
    )

@app.get("/schedule", response_class=HTMLResponse)
def schedule_view(request: Request):
    sorted_items = sort_classes(CLASSES)
    return templates.TemplateResponse("schedule.html", {"request": request, "classes": sorted_items})

# -----------------------------
# API (Keep your JSON endpoints too)
# -----------------------------
@app.get("/clubs", response_model=List[Club])
def get_clubs():
    return CLUBS

@app.get("/events", response_model=List[Event])
def get_events():
    return EVENTS

@app.get("/clubs/{club_id}/events", response_model=List[Event])
def get_events_for_club(club_id: int):
    if not any(c.id == club_id for c in CLUBS):
        raise HTTPException(status_code=404, detail="Club not found")
    return [e for e in EVENTS if e.club_id == club_id]

# Favorites API
@app.get("/favorites", response_model=List[Favorite])
def get_favorites():
    return FAVORITES

@app.post("/favorites")
def add_favorite(fav: Favorite):
    if fav not in FAVORITES:
        FAVORITES.append(fav)
    return {"message": "Added to favorites"}

@app.delete("/favorites/{item_id}/{item_type}")
def remove_favorite(item_id: int, item_type: str):
    global FAVORITES
    FAVORITES = [f for f in FAVORITES if not (f.item_id == item_id and f.item_type == item_type)]
    return {"message": "Removed from favorites"}

# Planner API
@app.get("/test")
def test_endpoint():
    return {"message": "Test endpoint works"}

@app.get("/planner")
def get_planner():
    return PLANNER_ITEMS

@app.post("/planner")
def add_to_planner(course: PlannerCourse):
    # Check if course already in planner
    if any(c.id == course.id for c in PLANNER_ITEMS):
        return {"message": "Course already in planner"}
    PLANNER_ITEMS.append(course)
    return {"message": "Added to planner"}

@app.delete("/planner/{course_id}")
def remove_from_planner(course_id: int):
    global PLANNER_ITEMS
    PLANNER_ITEMS = [c for c in PLANNER_ITEMS if c.id != course_id]
    return {"message": "Removed from planner"}

@app.get("/courses")
def get_available_courses():
    return CLASSES