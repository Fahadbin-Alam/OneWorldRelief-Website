# Drexel Student Success App

## Project Overview

The Drexel Student Success App is a student-focused platform designed to improve campus engagement, academic planning, and peer networking.

This sprint focuses on implementing the backend API using FastAPI to support:

- Clubs discovery
- Club events
- Peer availability
- Networking features

---

## User Story Implemented (Sprint Feature)

> As a person that participates in clubs and wants to be involved more,  
> I would like to know what clubs and which of my peers are available  
> so I can network and make friends.

This is supported through:

- `/clubs`
- `/clubs/{club_id}/events`
- `/availability`
- `/networking`

---

## Architecture

Backend: FastAPI  
API Documentation: Swagger UI (`/docs`)  
Data Models: Pydantic  

The backend currently runs as a local development server.

---

## Features Implemented

- GET `/clubs`
- GET `/clubs/{club_id}/events`
- GET `/availability`
- GET `/networking`

---

## How to Run Locally

```bash
cd backend
python -m venv .venv
source .venv/Scripts/activate
pip install fastapi uvicorn
uvicorn main:app --reload
