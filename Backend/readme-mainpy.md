What this program is (big picture)

This is a FastAPI backend for a Student Guide / Student Success app (MVP).

It lets the app:

Show clubs

Show events for a club

Find which peers are available during a time window

Return a combined “networking view” that gives you all of that in one response

It uses a fake database in memory (Python lists) so you can test the API without setting up SQL yet.

1) Imports (what tools we’re using)

FastAPI = web server framework (creates routes like /clubs)

Pydantic BaseModel = defines data shapes and auto-validates them

datetime = handles times for events and availability

Jinja2Templates / HTMLResponse = serves a homepage HTML (index.html)

So the API can return:

JSON data (for the app)

HTML (for the homepage)

2) App setup (creating the server)
app = FastAPI(title="Drexel Student Success API")
templates = Jinja2Templates(directory="templates")


This creates the backend server object.

Home route
@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


When someone visits /, it loads templates/index.html.

So the backend can show a landing page.

3) Data models (the “shapes” of our data)

These are Pydantic models:

Club

Has:

id

name

optional description

Event

Has:

id

club_id (links event → club)

title, start_time, end_time, location, description

AvailabilitySlot

A time range:

start_time → end_time

Peer

A student with:

id, name, year

interests (list of strings)

availability (list of availability slots)

Why models matter:
FastAPI uses them to:

validate data

auto-generate /docs

auto-convert Python objects into JSON

4) Fake database (in-memory lists)

Instead of SQL, we hardcode example data:

CLUBS = [...]

EVENTS = [...]

PEERS = [...]

So right now everything is stored in RAM:

If you restart the server → data resets.

Later you replace this with SQLite/Postgres.

5) Helper functions (logic utilities)
overlaps()

Checks if two time ranges overlap.

return a_start < b_end and b_start < a_end


Important detail:

If they just touch (like 6–7 and 7–8), it returns False

Only returns True if they actually overlap time

peer_is_available()

Loops through a peer’s availability slots and checks if ANY slot overlaps the requested window.

So if you ask:

“who is free 6pm–8pm?”
It checks each peer and returns True/False.

6) Endpoints (the “doors” of the API)
GET /clubs

Returns a list of all clubs.

return CLUBS

GET /clubs/{club_id}/events

Returns events for a specific club.

It does 2 things:

Checks if the club exists

Filters EVENTS by club_id

If club doesn’t exist:

returns 404 “Club not found”

GET /availability?start=...&end=...

Returns peers who are available in that time window.

It validates:

if start >= end → error 400

Then:

filters peers using peer_is_available()

Example call:
/availability?start=2026-02-05T18:00:00&end=2026-02-05T20:00:00

GET /networking?club_id=...&start=...&end=...

This is the “combined user story endpoint.”

It returns one JSON object containing:

the club

events for the club

peers available in the given window

the requested time window

This endpoint is basically:
“Give me everything the app needs for networking on one screen.”

What I would say as a final summary to the class

“This backend is a FastAPI MVP for a student guide app. It defines data models for clubs, events, and peers. It stores sample data in Python lists. It exposes routes to fetch clubs, fetch a club’s events, and find available peers within a time window using an overlap function. Finally, it has a combined /networking route that returns the club + events + available peers in one request so the frontend can render a networking view easily.”