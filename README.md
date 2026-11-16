# ORION — AI Interview Coach

ORION is an AI-powered mock interview platform built for job candidates who want to practice interviews in a realistic, voice-driven environment. It combines resume-aware question generation, live voice interaction, conversational AI feedback, and structured performance tracking in a single MERN-style app with a React client and Express API.

This repository is organized as a monorepo with:
- `client/` — React + Vite frontend
- `server/` — Express + MongoDB backend
- `docs/` — architecture and interview coaching documentation

The project is designed to help users:
- upload a resume or profile summary
- choose a role, level, interview type, and challenge difficulty
- complete a realistic multi-question interview experience
- receive AI-generated scoring, STAR-based feedback, and model answers
- revisit weak questions for targeted re-practice

For deeper technical context, see:
- `docs/ARCHITECTURE.md`
- `docs/INTERVIEW-QUESTION-BANK.md`

---

## Table of Contents

- [Overview](#overview)
- [Problem It Solves](#problem-it-solves)
- [Core Features](#core-features)
- [User Journey](#user-journey)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running the App](#running-the-app)
- [Frontend Routes](#frontend-routes)
- [Backend API Reference](#backend-api-reference)
- [Data Model](#data-model)
- [Security Considerations](#security-considerations)
- [Deployment Notes](#deployment-notes)
- [Troubleshooting](#troubleshooting)
- [Roadmap & Known Gaps](#roadmap--known-gaps)
- [Contributing](#contributing)
- [License](#license)
- [Additional Docs](#additional-docs)

---

## Overview

ORION is a mock interview simulator that turns a typical job interview prep experience into a guided AI coaching flow. Rather than simply showing a list of static questions, it tries to mimic a real interview pattern:

1. The user uploads a resume or relevant profile information.
2. The app infers skills, experience level, and role fit.
3. It generates interview questions tailored to the user and the selected role.
4. The AI interviewer asks questions in voice.
5. The user answers aloud.
6. The system transcribes the answer, evaluates it, and follows up with a conversational bridge.
7. At the end, a feedback report is produced with scoring and coaching guidance.

The app is intentionally structured to feel more like a product experience than a reference implementation: it includes onboarding, protected routes, dashboard history, and a polished UI built with animation and responsive layouts.

---

## Problem It Solves

Candidates often practice interview questions in a passive way. Reading lists of common questions and preparing answers in isolation is useful, but it does not train the real interview experience:

- speaking under pressure
- answering out loud without overthinking
- responding to follow-up questions and conversational transitions
- receiving personalized feedback on structure and confidence
- understanding where they are weak and how to re-practice

ORION addresses that gap by combining resume tailoring, conversational AI, audio input, and feedback scoring in one platform.

---

## Core Features

### 1. Resume-aware interview setup
- Upload a PDF resume or image-based resume
- Extract text using PDF parsing or OCR-style AI extraction
- Analyze skills, summary, projects, detected job role, and experience level
- Use that data to tailor the interview questions

### 2. Interview configuration
Users can choose:
- role (`swe`, `pm`, `design`, `marketing`)
- level (`intern`, `junior`, `mid`, `senior`)
- interview type (`behavioral`, `technical`, `case-study`)
- difficulty (`easy`, `medium`, `hard`, `expert`)
- personality mode (`standard`, `mentor`, `faang`)
- optional job description

### 3. AI-generated questions
The backend generates questions through the Groq AI layer and can tailor them based on:
- resume data
- selected role
- level
- interview type
- difficulty
- optional JD input

### 4. Voice-driven interview loop
The app supports:
- text-to-speech prompting
- speech-to-text answer capture
- a conversational reaction after an answer
- optional hint lifelines during a question
- follow-up question generation based on prior answers

### 5. Feedback and scoring
At the end of an interview, the backend creates a feedback report that includes:
- clarity score
- relevance score
- structure score
- confidence score
- overall score
- filler word count and examples
- STAR-method feedback summary
- model answer for the weakest or most important question

### 6. Dashboard and learning loop
Users can:
- view previous sessions
- track readiness trend over time
- revisit earlier sessions
- re-run interview questions
- target weak questions for additional practice

### 7. Authentication
The app supports:
- email/password registration and login
- Google login flow
- JWT-based session protection
- protected routes for sensitive pages

### 8. Multi-platform deployment structure
This repo is split to support:
- Vercel for frontend deployment
- Render for backend deployment
- MongoDB Atlas for persistence

---

## User Journey

A typical user flow looks like this:

1. Sign up or log in
2. Upload resume
3. Choose interview preferences
4. Start interview session
5. Listen to AI question via TTS
6. Answer using microphone
7. Receive AI reaction or follow-up
8. Complete all questions
9. Review detailed feedback
10. Return to dashboard to track progress or retry practice

This is the core product loop of the system.

---

## Architecture Overview

The project follows a simple layered architecture with a clear split between frontend and backend:

```text
Browser / User
   │
   ▼
React SPA (client)
   - routes & page flows
   - auth state
   - interview UI
   - TTS + audio capture
   - feedback presentation
   │
   ▼
Express API (server)
   - auth routes
   - resume handling
   - session management
   - feedback generation
   - STT / TTS endpoints
   │
   ▼
MongoDB
   - users
   - sessions
   - feedback
   │
   ▼
External AI services
   - Groq for text, vision, and transcription
   - Microsoft Edge TTS for voice output
```

The backend is organized at a high level as:

```text
routes/ -> controllers/ -> services/ + models/
```

Middleware sits across routes for authentication, rate limiting, and security controls.

---

## Tech Stack

### Frontend
| Concern | Choice | Notes |
|---|---|---|
| Framework | React 18 | SPA architecture |
| Build tool | Vite | Fast local development |
| Routing | react-router-dom | BrowserRouter and protected routes |
| Styling | Tailwind CSS | Custom UI and dark/light styling |
| Animation | framer-motion | Page transitions and motion components |
| Auth | @react-oauth/google | Google login support |
| PDF export | jsPDF + jspdf-autotable | Downloadable reports |
| Icons | lucide-react | UI icons |
| Visual effects | tsparticles | Landing page polish |

### Backend
| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js | ESM module setup |
| Server framework | Express 4 | API layer |
| Database | MongoDB with Mongoose | User/session/feedback storage |
| Auth | JWT + bcryptjs | Bearer token pattern |
| Security | helmet + express-rate-limit | Rate limiting and hardening |
| AI | Groq SDK | Text, vision, and transcription |
| TTS | msedge-tts | Audio generation |
| File handling | multer + pdf-parse | Resume parsing |

### Dev / Ops
| Concern | Choice |
|---|---|
| Monorepo tooling | npm workspaces |
| Root runner | concurrently |
| Frontend host | Vercel |
| Backend host | Render |
| Database host | MongoDB Atlas |

---

## Repository Structure

```text
Agentic-Interview-coach-
├── .gitignore
├── .env.example
├── package.json
├── package-lock.json
├── client/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vercel.json
│   ├── public/
│   │   ├── favicon.png
│   │   └── screenshots / mock images
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── assets/
│       ├── components/
│       │   ├── auth/
│       │   ├── interview/
│       │   ├── layout/
│       │   └── ui/
│       ├── context/
│       │   └── AuthContext.jsx
│       ├── hooks/
│       │   ├── useAuth.js
│       │   ├── useInterview.js
│       │   ├── useSpeech.js
│       │   └── useTTS.js
│       ├── lib/
│       │   └── utils.js
│       ├── pages/
│       │   ├── LandingPage.jsx
│       │   ├── LoginPage.jsx
│       │   ├── RegisterPage.jsx
│       │   ├── ResumePage.jsx
│       │   ├── OnboardingPage.jsx
│       │   ├── InterviewPage.jsx
│       │   ├── FeedbackPage.jsx
│       │   └── DashboardPage.jsx
│       ├── styles/
│       │   └── globals.css
│       └── utils/
│           └── authFetch.js
├── server/
│   ├── index.js
│   ├── package.json
│   ├── middleware/
│   │   ├── auth.js
│   │   └── rateLimiter.js
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── feedbackController.js
│   │   ├── sessionController.js
│   │   └── sttController.js
│   ├── models/
│   │   ├── User.js
│   │   ├── Session.js
│   │   └── Feedback.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── feedback.js
│   │   ├── resume.js
│   │   ├── sessions.js
│   │   ├── stt.js
│   │   └── tts.js
│   └── services/
│       ├── groqService.js
│       └── ttsService.js
├── docs/
│   ├── ARCHITECTURE.md
│   └── INTERVIEW-QUESTION-BANK.md
└── README.md
```

---

## Prerequisites

Before running the app locally, ensure you have:

- Node.js 18+
- npm 9+
- MongoDB Atlas connection string or a local MongoDB instance
- Groq API key (recommended for full AI-powered behavior)
- Internet access for Google auth and external AI providers

Optional but useful:
- VS Code or other modern IDE
- MongoDB Compass for dataset inspection
- Postman or curl for manual API testing

---

## Installation

From the project root:

```bash
npm install
```

This uses the workspace configuration to install both the frontend and backend dependencies.

---

## Environment Variables

The server uses a root `.env` file. Create one in the repository root with configuration like the following:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/orion
JWT_SECRET=your_super_secret_jwt_key
CLIENT_URL=http://localhost:5173
GROQ_API_KEY=your_groq_api_key
NODE_ENV=development
```

Notes:
- `MONGODB_URI` is required for database connectivity.
- `JWT_SECRET` is required for auth security.
- `CLIENT_URL` is used by CORS logic.
- `GROQ_API_KEY` is strongly recommended for real AI-generated interview flows.
- The app is designed to reject startup when required configuration is missing.

The project also includes `.env.example`, but it is intentionally minimal and may need to be filled with the actual values for your environment.

---

## Running the App

### Development mode

From the root:

```bash
npm run dev
```

This runs both:
- client: Vite dev server on `http://localhost:5173`
- server: Express API on `http://localhost:5000`

### Server only

```bash
cd server
npm install
npm run dev
```

### Client only

```bash
cd client
npm install
npm run dev
```

### Production build

```bash
cd client
npm run build
```

The build output is generated by Vite and is intended for deployment via Vercel or another static host.

---

## Frontend Routes

The client uses protected routing and route transitions.

| Route | Purpose | Protection |
|---|---|---|
| `/` | Landing page | No |
| `/register` | Registration | No |
| `/login` | Login | No |
| `/resume` | Resume upload & analysis | Yes |
| `/onboarding` | User interview setup | Yes |
| `/interview` | Live interview experience | Yes |
| `/feedback` | Feedback summary | Yes |
| `/feedback/:sessionId` | Session-specific review | Yes |
| `/dashboard` | Session history and readiness view | Yes |

Protected route logic is handled by a React wrapper component that checks the authentication context.

---

## Backend API Reference

The API is versionless and grouped by feature area.

### Authentication

#### `POST /api/auth/register`
Creates a user account.

Request body:
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "securepassword"
}
```

Response includes:
- token
- user metadata

#### `POST /api/auth/login`
Logs in a user and returns a JWT.

#### `POST /api/auth/google`
Authenticates with a Google access token.

#### `GET /api/auth/me`
Returns the current authenticated user.

#### `PUT /api/auth/update`
Updates user profile information and target roles.

#### `POST /api/auth/logout`
No-op acknowledgement for client-side logout.

---

### Resume APIs

#### `POST /api/resume/upload`
Uploads a PDF or image resume.

- Accepts `multipart/form-data`
- Supports PDF/JPEG/PNG
- Extracts text and sends it to the AI analyzer
- Stores structured resume data to the user profile

#### `GET /api/resume`
Returns the current user’s saved resume metadata.

#### `DELETE /api/resume`
Clears stored resume data.

---

### Session APIs

#### `GET /api/sessions`
Returns all sessions for the authenticated user.

#### `POST /api/sessions`
Creates a new session and generates AI-tailored questions.

Example body:
```json
{
  "role": "swe",
  "level": "mid",
  "interviewType": "behavioral",
  "difficulty": "medium",
  "jobDescription": "Build backend APIs",
  "personality": "standard"
}
```

#### `GET /api/sessions/:id`
Returns a single session.

#### `POST /api/sessions/:id/hint`
Generates a hint for a question.

#### `POST /api/sessions/:id/followup`
Generates a follow-up question based on the previous answer.

#### `POST /api/sessions/:id/reaction`
Generates a conversational reaction to a candidate answer.

#### `DELETE /api/sessions/:id`
Deletes a session and associated feedback.

---

### Feedback APIs

#### `POST /api/feedback`
Generates feedback for an interview session.

It expects:
- `sessionId`
- `answers`
- `questions` (optional, used for ordering)
- `snapshots` (optional image/frame data for body-language analysis)

#### `GET /api/feedback/:sessionId`
Returns the feedback record for a session.

#### `GET /api/feedback/stats`
Returns the aggregated trend and average score for the user.

#### `POST /api/feedback/single`
Analyzes a single answer and question for targeted re-practice.

---

### TTS API

#### `POST /api/tts`
Converts text into spoken audio.

Request body:
```json
{
  "text": "Tell me about a time you solved a complex problem."
}
```

Returns an MP3 audio stream.

---

### STT API

#### `POST /api/stt`
Accepts audio input and transcribes it through the AI speech service.

- Accepts multipart audio upload
- Protected by media rate limiting
- Meant for interview answer capture

---

### Health Check

#### `GET /`
Basic server status message

#### `GET /api/health`
Returns:
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

---

## Data Model

### User
Stored in `server/models/User.js`.

Fields include:
- `name`
- `email`
- `passwordHash`
- `googleId`
- `targetRoles`
- `resumeData` with parsed resume metadata
- `createdAt`

The resume data schema includes:
- `rawText`
- `name`
- `detectedRole`
- `skills`
- `experienceLevel`
- `projects`
- `summary`
- `uploadedAt`

### Session
Stored in `server/models/Session.js`.

Fields include:
- `userId`
- `role`
- `level`
- `jobDescription`
- `interviewType`
- `difficulty`
- `personality`
- `questions`
- `answers`
- `isAiGenerated`
- `isResumeTailored`
- `createdAt`

### Feedback
Stored in `server/models/Feedback.js`.

Fields include:
- `sessionId`
- `userId`
- `scores`
  - `clarity`
  - `relevance`
  - `structure`
  - `confidence`
- `fillerWordCount`
- `fillerWordsList`
- `overallScore`
- `feedback`
- `starFeedback`
- `modelAnswer`
- `createdAt`

---

## Security Considerations

The codebase includes several security features, but it is still a project app and should be hardened before production-wide public use.

### Implemented protections
- JWT validation in middleware
- Bearer token authentication on protected routes
- CORS restriction based on `CLIENT_URL` in production
- Helmet middleware for HTTP header hardening
- Rate limiting for authentication, feedback, and media endpoints
- Password hashing via `bcryptjs`
- Google account email verification check before account linking

### Important notes
- The app uses a root `.env` file and assumes it is managed securely.
- No explicit SQL injection vector is present in this MongoDB/Mongoose app, but input validation remains lightweight in some flows.
- The backend uses command-line console logging in several places; for production, structured logging is strongly recommended.
- File upload limits are enforced, but more robust validation may be desired for larger deployments.

---

## Deployment Notes

The project is designed for a split deployment model.

### Frontend deployment
- Deploy `client/` to Vercel
- Configure the build as a Vite app
- Use a SPA rewrite (handled by `client/vercel.json`)

### Backend deployment
- Deploy `server/` to Render or another Node host
- Set `PORT` and environment variables in the host
- Ensure MongoDB access is configured correctly

### Database deployment
- Use MongoDB Atlas
- Store the connection string in `MONGODB_URI`

### Production environment checklist
- Set `NODE_ENV=production`
- Configure `CLIENT_URL` to the real frontend URL
- Ensure `JWT_SECRET` is strong and unique
- Configure Groq API credentials
- Keep `.env` values out of source control

---

## Troubleshooting

### Server refuses to start
Common causes:
- missing `MONGODB_URI`
- missing `JWT_SECRET`
- wrong Node version
- dependency installation not complete

Check:
```bash
node -v
npm install
```

### CORS issues
If the frontend cannot call the backend, verify that:
- `CLIENT_URL` matches the frontend origin
- the backend is running on the correct port
- `NODE_ENV` is aligned with your deployment mode

### Authentication fails
Check:
- whether the JWT is being sent in `Authorization: Bearer <token>`
- whether `JWT_SECRET` is consistent between login and protected route verification
- whether the user record exists in MongoDB

### Resume upload fails
Likely causes:
- invalid PDF or image file
- low-quality image text extraction
- Groq service unavailable
- extracted text too short

### TTS or STT errors
These features depend on external services and may fail if:
- the API key is absent or invalid
- the text length exceeds limits
- the audio payload is too large
- the service is temporarily unavailable

---

## Roadmap & Known Gaps

The current project is a strong prototype or MVP, and there are several natural next improvements:

- add automated tests for API handlers and core workflows
- add ESLint and formatting rules
- add request validation library (for stronger schema enforcement)
- improve logging and observability
- add environment-specific config management
- implement background job processing for heavy AI tasks
- add audio chunk persistence and resumable file handling
- improve error recovery for failed AI calls
- add more advanced dashboard analytics
- support more interview domains and role-specific question sets
- add user onboarding and interview fairness statistics

This is a good product foundation, but it still benefits from more production rigor around testing, monitoring, and reliability.

---

## Contributing

Contributions are welcome if you want to expand the app or improve quality.

Suggested workflow:
1. Fork the repository
2. Create a feature branch
3. Make focused changes
4. Validate locally with the app running
5. Submit a clear pull request with a summary and testing notes

At minimum, expect to validate:
- installation works
- auth works
- session generation works
- feedback generation works
- the app still runs in development mode

---

## License

This repository does not currently include a visible license file. If you plan to distribute or publish this project publicly, it is recommended that you add an explicit license (for example, MIT or Apache-2.0) before sharing it broadly.

---

## Additional Docs

The repo includes companion documentation that explains the system more deeply:

- `docs/ARCHITECTURE.md` — architecture walkthrough and design notes
- `docs/INTERVIEW-QUESTION-BANK.md` — interview questions and project-level interview prep guidance

These files are useful if you want to understand the project beyond the basic README.

---

## Summary

ORION is a full-stack AI interview coach designed to simulate realistic interview practice with resume-aware customization, voice interaction, and structured feedback. It blends modern frontend UX, Express APIs, MongoDB persistence, and Groq-powered intelligence into a cohesive product experience.

It is an ideal project for demonstrating:
- AI product engineering
- full-stack integration
- user-facing workflow design
- voice and multimodal application patterns
- interview and coaching data modeling

If you are using this repo as a portfolio project, a hackathon app, or a real interview-prep product, the codebase is already structured to support a strong demonstration of end-to-end AI product delivery.

---

This README was prepared for ORION based on the repository's current structure and implementation.
