# Samvad_Vibe

Samvad_Vibe is a real-time chat application with room support, admin controls, and MongoDB-backed persistence.

## Project structure

- `server/` — Express backend using REST + polling for chat updates
- `server/client/` — React frontend
- `server/models/` — MongoDB schemas
- `server/routes/` — API routes

## Local setup

### 1) Install backend dependencies

```bash
cd server
npm install
```

### 2) Add MongoDB environment variable

Create a `.env` file in the `server` folder:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/Samvad_Vibe
PORT=5000
```

### 3) Start the backend

```bash
cd server
npm start
```

### 4) Start the frontend

```bash
cd server/client
npm install
npm start
```

## Frontend deployment setup

Create a `.env` file inside `server/client`:

```env
REACT_APP_API_URL=https://your-backend-url
```

## Deployment architecture

Use this setup:

- Frontend: Vercel
- Backend: Vercel serverless API or another Node host
- Database: MongoDB Atlas

### Backend deployment requirements

Set these environment variables on your Node host or serverless deployment:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/Samvad_Vibe
PORT=5000
```

### Frontend deployment requirements

Set this environment variable in Vercel:

```env
REACT_APP_API_URL=https://your-backend-url
```

## Important note

This version uses REST polling for chat updates, which makes it easier to run in Vercel-compatible environments.

## Features

- Public and private rooms
- Admin controls
- Member limits
- Online users
- MongoDB-backed user and message persistence
