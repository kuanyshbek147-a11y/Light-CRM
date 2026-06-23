# Architecture

## Stack
- Frontend: React + TypeScript + Vite
- Backend: Node.js + Express + TypeScript
- DB: PostgreSQL
- Realtime: Socket.IO
- Containerization: Docker Compose

## Services
- `frontend`: web UI at port 5173
- `backend`: API + realtime + simulator at port 4000
- `db`: PostgreSQL at port 5432

## Data Model
- Workspace
- User
- Contact
- Conversation
- Message
- Deal
- ActivityLog

## Runtime Flow
1. Simulator inserts incoming messages.
2. Backend emits websocket event `message:new`.
3. Frontend receives event and updates inbox.
4. Manager sends message via API.
5. Backend stores and emits outgoing message event.

## Security MVP
- JWT auth.
- Password hashing.
- Workspace-level data isolation in API layer.
