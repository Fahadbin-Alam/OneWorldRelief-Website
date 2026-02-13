# ------------------------------
# Student Guide App Backend (MVP)
# Feature: Clubs + Events + Peer Availability
# ------------------------------

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

# Create the FastAPI application object.
# This is the "server" that will receive HTTP requests.
app = FastAPI(title="Drexel Student Success API")

# ------------------------------
# 1) DATA MODELS (Pydantic)
# ------------------------------
# These classes define the "shape" of our data.
# FastAPI uses them to:
# - validate inputs/outputs
# - generate documentation in /docs
# - convert Python objects into JSON responses automatically

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
    # A single "available time range" for a user.
    start_time: datetime
    end_time: datetime

class Peer(BaseModel):
    id: int
    name: str
    year: str
    interests: List[str]
    availability: List[AvailabilitySlot]

# ------------------------------
# 2) FAKE DATABASE (IN MEMORY)
# ------------------------------
# For MVP we keep data in lists (RAM).
# Later, we replace this with SQLite/Postgres.

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

# ------------------------------
# 3) HELPER FUNCTIONS
# ------------------------------

def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime) -> bool:
    """
    Returns True if time range A overlaps time range B.
    Example:
    A: 6-8pm, B: 7-9pm -> overlap True
    A: 6-7pm, B: 7-8pm -> overlap False (touching is not overlap)
    """
    return a_start < b_end and b_start < a_end

def peer_is_available(peer: Peer, start: datetime, end: datetime) -> bool:
    """
    Returns True if the peer has ANY availability slot that overlaps the requested window.
    """
    for slot in peer.availability:
        if overlaps(slot.start_time, slot.end_time, start, end):
            return True
    return False

# ------------------------------
# 4) API ENDPOINTS (THE "DOORS")
# ------------------------------

@app.get("/clubs", response_model=List[Club])
def get_clubs():
    """
    Return all clubs.
    """
    return CLUBS

@app.get("/clubs/{club_id}/events", response_model=List[Event])
def get_events_for_club(club_id: int):
    """
    Return all events for a specific club.
    """
    # Confirm club exists (good API behavior)
    if not any(c.id == club_id for c in CLUBS):
        raise HTTPException(status_code=404, detail="Club not found")

    # Filter events that match this club
    return [e for e in EVENTS if e.club_id == club_id]

@app.get("/availability", response_model=List[Peer])
def get_available_peers(
    start: datetime = Query(..., description="Start time (ISO format)"),
    end: datetime = Query(..., description="End time (ISO format)")
):
    """
    Return peers who are available between start and end.
    Example:
    /availability?start=2026-02-05T18:00:00&end=2026-02-05T20:00:00
    """
    if start >= end:
        raise HTTPException(status_code=400, detail="start must be before end")

    return [p for p in PEERS if peer_is_available(p, start, end)]

@app.get("/networking")
def networking_view(
    club_id: int = Query(..., description="Club ID to focus on"),
    start: datetime = Query(..., description="Networking start time (ISO format)"),
    end: datetime = Query(..., description="Networking end time (ISO format)")
):
    """
    Combined endpoint for the user story:
    - shows the club
    - shows the club's events
    - shows peers available in the given time window
    """
    # Find the club
    club = next((c for c in CLUBS if c.id == club_id), None)
    if club is None:
        raise HTTPException(status_code=404, detail="Club not found")

    # Get events for that club
    club_events = [e for e in EVENTS if e.club_id == club_id]

    # Get peers available in that time window
    available_peers = [p for p in PEERS if peer_is_available(p, start, end)]

    # Return a JSON object that contains everything the app needs
    return {
        "club": club,
        "events": club_events,
        "available_peers": available_peers,
        "requested_window": {"start": start, "end": end}
    }
