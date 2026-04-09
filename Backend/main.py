from fastapi import FastAPI, Request, HTTPException, Depends, Header
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer
from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime, timedelta
from pathlib import Path
import sqlite3
import bcrypt
import json
from jose import JWTError, jwt

# ===== CONFIG =====
SECRET_KEY = "your-secret-key-change-in-production"
ALGORITHM = "HS256"
TOKEN_EXPIRE_MINUTES = 1440  # 24 hours

# ===== PATHS =====
BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "app.db"

# ===== PASSWORD HASHING (Needed before DB init) =====
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

# ===== DATABASE SETUP =====
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        plain_password TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )""")
    cursor.execute("""CREATE TABLE IF NOT EXISTS user_favorites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE (user_id, item_id, item_type)
    )""")
    cursor.execute("""CREATE TABLE IF NOT EXISTS user_planner (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        course_id INTEGER NOT NULL,
        course_name TEXT NOT NULL,
        days TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        location TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE (user_id, course_id)
    )""")
    
    # Create demo account if it doesn't exist
    cursor.execute("SELECT id FROM users WHERE email = ?", ("demo@example.com",))
    if cursor.fetchone() is None:
        demo_password = "demo123"
        demo_hash = hash_password(demo_password)
        cursor.execute("INSERT INTO users (email, password_hash, plain_password) VALUES (?, ?, ?)",
                      ("demo@example.com", demo_hash, demo_password))
    
    conn.commit()
    conn.close()

init_db()

# ===== APP SETUP =====
app = FastAPI(title="Drexel Student Success API")

templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")

# ===== PYDANTIC MODELS =====
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

# ===== AUTH MODELS =====
class RegisterRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    email: str

# ===== JWT FUNCTIONS =====
def create_access_token(user_id: int, email: str, expires_delta: Optional[timedelta] = None):
    if expires_delta is None:
        expires_delta = timedelta(minutes=TOKEN_EXPIRE_MINUTES)
    expire = datetime.utcnow() + expires_delta
    to_encode = {"user_id": user_id, "email": email, "exp": expire}
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")
    token = authorization[7:]
    return verify_token(token)

# ===== DATABASE ACCESS =====
def get_db():
    return sqlite3.connect(DB_PATH)

def get_user_by_email(email: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, password_hash FROM users WHERE email = ?", (email,))
    row = cursor.fetchone()
    conn.close()
    return row

def create_user(email: str, password_hash: str, plain_password: str = None):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO users (email, password_hash, plain_password) VALUES (?, ?, ?)", 
                      (email, password_hash, plain_password))
        conn.commit()
        user_id = cursor.lastrowid
        conn.close()
        return user_id
    except sqlite3.IntegrityError:
        conn.close()
        raise HTTPException(status_code=400, detail="Email already registered")

def get_user_favorites(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT item_id, item_type FROM user_favorites WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    return [{"item_id": row[0], "item_type": row[1]} for row in rows]

def add_user_favorite(user_id: int, item_id: int, item_type: str):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO user_favorites (user_id, item_id, item_type) VALUES (?, ?, ?)", (user_id, item_id, item_type))
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        conn.close()
        return False

def remove_user_favorite(user_id: int, item_id: int, item_type: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_favorites WHERE user_id = ? AND item_id = ? AND item_type = ?", (user_id, item_id, item_type))
    conn.commit()
    conn.close()

def get_user_planner(user_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT course_id, course_name, days, start_time, end_time, location FROM user_planner WHERE user_id = ?", (user_id,))
    rows = cursor.fetchall()
    conn.close()
    result = []
    for row in rows:
        result.append({"id": row[0], "name": row[1], "days": json.loads(row[2]), "start_time": row[3], "end_time": row[4], "location": row[5]})
    return result

def add_user_planner_course(user_id: int, course_id: int, course_name: str, days: List[str], start_time: str, end_time: str, location: str):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("INSERT INTO user_planner (user_id, course_id, course_name, days, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?, ?)",
                      (user_id, course_id, course_name, json.dumps(days), start_time, end_time, location))
        conn.commit()
        conn.close()
        return True
    except sqlite3.IntegrityError:
        conn.close()
        return False

def remove_user_planner_course(user_id: int, course_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM user_planner WHERE user_id = ? AND course_id = ?", (user_id, course_id))
    conn.commit()
    conn.close()

# ===== IN-MEMORY MOCK DATA =====
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

@app.get("/login", response_class=HTMLResponse)
def login_page():
    try:
        html_path = BASE_DIR.parent / "login.html"
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

# ===== AUTHENTICATION ENDPOINTS =====
@app.post("/auth/register", response_model=Token)
def register(req: RegisterRequest):
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    
    if get_user_by_email(req.email):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed = hash_password(req.password)
    user_id = create_user(req.email, hashed, plain_password=req.password)
    token = create_access_token(user_id, req.email)
    
    return {"access_token": token, "token_type": "bearer", "user_id": user_id, "email": req.email}

@app.post("/auth/login", response_model=Token)
def login(req: LoginRequest):
    user = get_user_by_email(req.email)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    user_id, email, password_hash = user
    if not verify_password(req.password, password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_access_token(user_id, email)
    return {"access_token": token, "token_type": "bearer", "user_id": user_id, "email": email}

# ===== API - PUBLIC ENDPOINTS (No auth required) =====
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

# ===== USER FAVORITES ENDPOINTS =====
@app.get("/favorites")
def get_favorites(user: dict = Depends(get_current_user)):
    return get_user_favorites(user["user_id"])

@app.post("/favorites")
def add_favorite(fav: Favorite, user: dict = Depends(get_current_user)):
    if add_user_favorite(user["user_id"], fav.item_id, fav.item_type):
        return {"message": "Added to favorites"}
    else:
        return {"message": "Already in favorites"}

@app.delete("/favorites/{item_id}/{item_type}")
def remove_favorite(item_id: int, item_type: str, user: dict = Depends(get_current_user)):
    remove_user_favorite(user["user_id"], item_id, item_type)
    return {"message": "Removed from favorites"}

# ===== USER PLANNER ENDPOINTS =====
@app.get("/planner")
def get_planner(user: dict = Depends(get_current_user)):
    return get_user_planner(user["user_id"])

@app.post("/planner")
def add_to_planner(course: PlannerCourse, user: dict = Depends(get_current_user)):
    if add_user_planner_course(user["user_id"], course.id, course.name, course.days, course.start_time, course.end_time, course.location):
        return {"message": "Added to planner"}
    else:
        return {"message": "Course already in planner"}

@app.delete("/planner/{course_id}")
def remove_from_planner(course_id: int, user: dict = Depends(get_current_user)):
    remove_user_planner_course(user["user_id"], course_id)
    return {"message": "Removed from planner"}

@app.get("/courses")
def get_available_courses():
    return CLASSES

# ===== DEV ENDPOINTS (For Developers to View Registered Users) =====
@app.get("/dev/users")
def get_all_users_for_dev():
    """Returns all registered users with their email and plain password for development purposes"""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, email, plain_password FROM users ORDER BY created_at DESC")
    rows = cursor.fetchall()
    conn.close()
    
    result = []
    for row in rows:
        result.append({
            "id": row[0],
            "email": row[1],
            "password": row[2] if row[2] else "(no plain password stored)"
        })
    
    return result

# ===== RUN SERVER =====
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)