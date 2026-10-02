# ORION — AI Interview Coach: End-to-End Architecture

> A complete walkthrough of how this application works, from a user's first click to
> an AI-graded feedback report — plus the real engineering journey behind it.

---

## Table of contents

1. [What the app does](#1-what-the-app-does)
2. [The 30-second version](#2-the-30-second-version)
3. [Tech stack](#3-tech-stack)
4. [Repository layout](#4-repository-layout)
5. [System architecture](#5-system-architecture)
6. [The data model](#6-the-data-model)
7. [Authentication pipeline](#7-authentication-pipeline)
8. [Pipeline 1 — Resume ingestion](#8-pipeline-1--resume-ingestion)
9. [Pipeline 2 — Session creation & question generation](#9-pipeline-2--session-creation--question-generation)
10. [Pipeline 3 — The live interview loop](#10-pipeline-3--the-live-interview-loop)
11. [Pipeline 4 — Grading & feedback](#11-pipeline-4--grading--feedback)
12. [Pipeline 5 — Dashboard, retry & targeted re-practice](#12-pipeline-5--dashboard-retry--targeted-re-practice)
13. [The AI layer in depth](#13-the-ai-layer-in-depth)
14. [Cross-cutting concerns](#14-cross-cutting-concerns)
15. [Deployment topology](#15-deployment-topology)
16. [Complete API reference](#16-complete-api-reference)
17. [The build journey](#17-the-build-journey)
18. [Known gaps & roadmap](#18-known-gaps--roadmap)

---

## 1. What the app does

ORION is a **mock interview simulator**. A user uploads their résumé, picks a role and
difficulty, and then sits through a six-question voice interview with an AI interviewer
that *speaks* the questions aloud, *listens* to spoken answers, reacts conversationally
between questions, and finally produces a graded report card with a STAR-method
breakdown and a model answer.

The four things that make it more than a quiz app:

| Capability | What it means in practice |
|---|---|
| **Résumé-tailored questions** | Questions reference the user's actual skills and projects, not generic templates |
| **Full voice loop** | Text-to-speech asks the question; speech-to-text captures the answer |
| **Conversational bridging** | The AI acknowledges your answer and sometimes asks a probing follow-up |
| **Multi-axis grading** | Clarity / Relevance / Structure / Confidence, plus filler-word counting and webcam body-language analysis |

---

## 2. The 30-second version

```
Sign up ──► Upload résumé ──► Configure interview ──► Live voice interview ──► AI report ──► Dashboard
  (JWT)      (PDF/image →      (role, level, type,     (TTS asks, Whisper      (4 scores,     (readiness
             OCR → LLM parse)   difficulty, persona)    transcribes, LLM        STAR coach,    trend over
                                                        reacts & follows up)    model answer)  time)
```

Every arrow above is an HTTP request from a React SPA to an Express API, which in turn
calls **MongoDB** for state and **Groq** for intelligence.

---

## 3. Tech stack

### Frontend (`client/`)

| Concern | Choice | Notes |
|---|---|---|
| Framework | **React 18** (SPA) | Not Next.js — pure client-side rendering |
| Build tool | **Vite 5** | `@vitejs/plugin-react`, dev server on `:5173` |
| Routing | **react-router-dom 6** | `BrowserRouter`, 9 routes |
| Styling | **Tailwind CSS 3.4** | `darkMode: 'class'`, ~48 custom Material-3-style tokens |
| Animation | **framer-motion 11** | Page transitions, accordions, drag physics, SVG gauges |
| Auth UI | **@react-oauth/google** | `useGoogleLogin` implicit flow |
| Icons | **Material Symbols** (CDN) + `lucide-react` | |
| PDF export | **jsPDF + jspdf-autotable** | Downloadable feedback report |
| Effects | **@tsparticles** | Landing-page sparkles |

No TypeScript, no ESLint config, no test runner, and **no state-management library** —
state is React Context + local `useState` + three custom hooks.

### Backend (`server/`)

| Concern | Choice | Notes |
|---|---|---|
| Runtime | **Node.js, pure ESM** | `"type": "module"`, no build step |
| Framework | **Express 4** | |
| Database | **MongoDB Atlas** via **Mongoose 8** | 3 collections |
| Auth | **jsonwebtoken** (HS256) + **bcryptjs** (cost 12) | Stateless Bearer tokens |
| Security | **helmet**, **express-rate-limit** | 3 rate limiters |
| LLM / STT / Vision | **groq-sdk** | 3 different models |
| TTS | **msedge-tts** | Free Microsoft Edge Neural voices |
| File handling | **multer** (memory storage) + **pdf-parse** | Résumé and audio uploads |

No test framework, no linter, no logger (console only), and no validation library —
request validation is hand-rolled per handler.

---

## 4. Repository layout

npm **workspaces** monorepo. `npm run dev` at the root uses `concurrently` to boot both
halves at once.

```
coach/
├── package.json              # workspace root; dev script runs both
├── .env                      # SINGLE env file, read by the server from ../
│
├── client/
│   ├── vite.config.js        # dev port 5173
│   ├── vercel.json           # SPA catch-all rewrite (the 404-on-refresh fix)
│   ├── tailwind.config.js    # colour tokens + custom `theme-light` variant
│   └── src/
│       ├── main.jsx          # GoogleOAuthProvider > AuthProvider > App
│       ├── App.jsx           # all routes + AnimatePresence page transitions
│       ├── context/
│       │   └── AuthContext.jsx     # the only context: user, loading, login/register/logout
│       ├── hooks/
│       │   ├── useInterview.js     # question queue + conversation log
│       │   ├── useSpeech.js        # dual-pipeline audio capture
│       │   └── useTTS.js           # audio playback with browser fallback
│       ├── utils/
│       │   └── authFetch.js        # the entire "API client": attaches Bearer token
│       ├── pages/                  # Landing, Login, Register, Resume,
│       │   │                       # Onboarding, Interview, Feedback, Dashboard
│       ├── components/
│       │   ├── auth/ProtectedRoute.jsx
│       │   ├── interview/DraggableCamera.jsx, RepracticeModal.jsx
│       │   ├── layout/Navbar.jsx
│       │   └── ui/                 # Button, Input, PageWrapper + decorative components
│       └── styles/globals.css      # light-theme override layer + component classes
│
└── server/
    ├── index.js              # DNS fix → env guards → Mongo → middleware → routes → listen
    ├── routes/               # auth, sessions, feedback, resume, tts, stt
    ├── controllers/          # authController, sessionController, feedbackController, sttController
    ├── services/
    │   ├── groqService.js    # ★ all 9 AI functions live here (473 lines)
    │   └── ttsService.js     # msedge-tts wrapper
    ├── models/               # User, Session, Feedback
    └── middleware/
        ├── auth.js           # `protect` — Bearer verification
        └── rateLimiter.js    # authLimiter, feedbackLimiter, mediaLimiter
```

**Layering:** `routes → controllers → services + models`, with `middleware` cutting
across. The one deviation is `routes/resume.js`, which inlines its controller logic.

---

## 5. System architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  BROWSER                                                              │
│                                                                       │
│  React SPA (Vercel)                                                   │
│  ├─ AuthContext ── reads/writes localStorage['orion_token']            │
│  ├─ authFetch() ── injects `Authorization: Bearer <jwt>`              │
│  ├─ Web Speech API ──► live interim transcript (cosmetic only)        │
│  ├─ MediaRecorder  ──► webm blob (the authoritative audio)            │
│  ├─ getUserMedia(video) ──► canvas ──► base64 JPEG snapshots          │
│  └─ <audio> element ──► plays MP3 returned by the TTS endpoint        │
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTPS / JSON + multipart
                                │ (CORS: only CLIENT_URL in production)
┌───────────────────────────────▼───────────────────────────────────────┐
│  EXPRESS API (Render)                                                 │
│                                                                       │
│  helmet → cors → json(15mb) → [routes]                                │
│                                                                       │
│  /api/auth      register · login · google · logout · me · update      │
│  /api/resume    upload · get · delete                                 │
│  /api/sessions  list · create · get · hint · followup · reaction · del│
│  /api/feedback  create · single · stats · get                         │
│  /api/tts       synthesize speech                                     │
│  /api/stt       transcribe audio                                      │
│                                                                       │
│  middleware/auth.js `protect` guards everything except the 4 auth     │
│  entry points and the 2 health routes.                                │
└──────┬───────────────────────────────────────────┬────────────────────┘
       │                                           │
┌──────▼──────────────┐              ┌─────────────▼──────────────────┐
│ MongoDB Atlas       │              │ EXTERNAL AI SERVICES           │
│                     │              │                                │
│  users              │              │ Groq                           │
│  sessions           │              │  ├─ llama-3.1-8b-instant       │
│  feedbacks          │              │  │   (questions, grading,      │
│                     │              │  │    hints, follow-ups,       │
│                     │              │  │    reactions, résumé parse) │
│                     │              │  ├─ llama-3.2-11b-vision       │
│                     │              │  │   (résumé OCR, body language)│
│                     │              │  └─ whisper-large-v3 (STT)     │
│                     │              │                                │
│                     │              │ Microsoft Edge TTS             │
│                     │              │  └─ en-US-AriaNeural (free)    │
│                     │              │                                │
│                     │              │ Google OAuth                   │
│                     │              │  └─ /oauth2/v3/userinfo        │
└─────────────────────┘              └────────────────────────────────┘
```

### Server boot sequence (`server/index.js`)

Order matters here, and the first three lines are load-bearing:

```js
// 1. BEFORE any other import — forces IPv4 + public DNS resolvers.
//    MongoDB Atlas uses mongodb+srv:// which needs an SRV record lookup;
//    Node 17+ resolves IPv6-first and many ISP resolvers mishandle SRV.
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);

// 2. Load the single root .env
dotenv.config({ path: '../.env' });

// 3. Trust Render's reverse proxy so req.ip is the real client IP
//    (express-rate-limit keys on req.ip — without this every user
//     shares the proxy's IP and gets rate-limited collectively)
app.set('trust proxy', 1);

// 4. Fail fast rather than start insecure
if (!process.env.MONGODB_URI) process.exit(1);
if (!process.env.JWT_SECRET)  process.exit(1);

// 5. Connect Mongo, then helmet → cors → json(15mb) → routes → listen
```

---

## 6. The data model

Three Mongoose collections. All use a manual `createdAt` default rather than
`timestamps: true`, so there is no `updatedAt`.

```
┌─────────────────────────────┐
│ User                        │
├─────────────────────────────┤
│ name          String, ≤60   │
│ email         String UNIQUE │
│ passwordHash  String        │◄── NOT required: Google-only accounts have none
│ googleId      String        │◄── unique + SPARSE (critical — see below)
│ targetRoles   [String]      │
│ resumeData    { … }         │◄── embedded subdocument
│ createdAt     Date          │
└──────────┬──────────────────┘
           │ 1 ─── N
┌──────────▼──────────────────┐
│ Session                     │
├─────────────────────────────┤
│ userId        → User        │
│ role          swe|pm|design|marketing      │
│ level         intern|junior|mid|senior     │
│ interviewType behavioral|technical|case-study │
│ difficulty    easy|medium|hard|expert      │
│ personality   standard|mentor|faang        │
│ jobDescription  String      │
│ questions     [String]      │◄── parallel arrays:
│ answers       [String]      │◄── answers[i] answers questions[i]
│ isAiGenerated     Boolean   │
│ isResumeTailored  Boolean   │
└──────────┬──────────────────┘
           │ 1 ─── 1 (by convention, not enforced)
┌──────────▼──────────────────┐
│ Feedback                    │
├─────────────────────────────┤
│ sessionId     → Session     │
│ userId        → User        │
│ scores { clarity, relevance,│
│          structure,         │  each 0–10
│          confidence }       │
│ overallScore     0–10       │
│ fillerWordCount  Number     │
│ fillerWordsList  [String]   │
│ feedback         String     │  prose, 4–6 sentences
│ starFeedback     String     │  S/T/A/R graded separately
│ modelAnswer      String     │  exemplar answer
└─────────────────────────────┘
```

### Three design decisions worth understanding

**`passwordHash` is not required.** Google sign-in creates a user with no password. A
side effect that happens to be correct: logging in with a password on a Google-only
account calls `bcrypt.compare(password, undefined)`, which resolves `false` → a clean
401.

**`googleId` is `unique: true, sparse: true`.** The `sparse` flag is load-bearing.
A plain unique index treats `undefined` as a value, so the *second* email/password user
to register would collide with the first on `googleId: undefined` and be rejected. Sparse
indexes skip documents missing the field entirely.

**`questions` and `answers` are positionally correlated parallel arrays.** Index `i` of
`answers` is the answer to index `i` of `questions`. This invariant is owned by the
**client**, because the client is what splices follow-up questions into the middle of the
list. The server persists whatever ordering the client submits. (This was the source of
one of the nastier bugs in the project — see [§17](#17-the-build-journey).)

---

## 7. Authentication pipeline

**Scheme: stateless JWT carried in the `Authorization: Bearer` header. No cookies.**

### Registration / login

```
Browser                          Server                         MongoDB
   │                                │                              │
   │ POST /api/auth/register        │                              │
   │ { name, email, password }      │                              │
   ├───────────────────────────────►│                              │
   │                                │ validate: password is a      │
   │                                │ string and ≥ 8 chars         │
   │                                │                              │
   │                                │ findOne({ email }) ─────────►│
   │                                │◄──────────── exists? → 409   │
   │                                │                              │
   │                                │ bcrypt.genSalt(12) + hash    │
   │                                │ create(user) ───────────────►│
   │                                │                              │
   │                                │ jwt.sign({ userId, email },  │
   │                                │   JWT_SECRET, '7d')          │
   │◄───────────────────────────────┤                              │
   │ 201 { token, user }            │                              │
   │                                │                              │
   │ localStorage['orion_token'] = token                           │
```

Login is the same shape but returns a **uniform `401 "Invalid credentials"`** for both
an unknown email and a wrong password — deliberate, so the endpoint can't be used to
enumerate which emails are registered.

### Google sign-in — and a subtlety

The frontend uses `useGoogleLogin`, which is the **implicit flow**. That hands back an
**`access_token`**, *not* a JWT `id_token`. This matters because the usual server-side
pattern (`OAuth2Client.verifyIdToken()`) only accepts an ID token and would throw.

So the server exchanges the access token at Google's userinfo endpoint instead:

```js
const { token } = req.body;                      // access_token
const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
  headers: { Authorization: `Bearer ${token}` }
});
const { email, name, sub, email_verified } = await r.json();

// Security gate: never link an unverified Google identity to an existing account
if (email_verified === false || email_verified === 'false') {
  return res.status(401).json({ message: 'Google account email is not verified' });
}
```

The string comparison on `'false'` is intentional — Google has historically returned
`email_verified` as a string rather than a boolean.

**Account linking:** if a user already exists with that email but has no `googleId`, the
server backfills it. So someone who registered with a password can later sign in with
Google and land on the same account.

### Request protection

`server/middleware/auth.js` is the whole gate — 29 lines:

```js
const protect = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!token) return res.status(401).json({ message: 'Not authenticated — no token provided' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);  // { userId, email, iat, exp }
    next();
  } catch {
    return res.status(401).json({ message: 'Not authenticated — invalid token' });
  }
};
```

Every downstream handler reads `req.user.userId` and **scopes its Mongo query by it** —
that's the authorization model. There are no roles or tiers, so the JWT payload carries
no role claim.

Applied two ways: `router.use(protect)` for whole files (`sessions.js`, `feedback.js`)
and per-route for mixed files (`auth.js`, `resume.js`, `tts.js`, `stt.js`).

**Unprotected surface:** `GET /`, `GET /api/health`, and the four `/api/auth` entry points.

### Session verification on page load

`AuthContext` runs `verifySession()` once on mount:

```
token in localStorage?
├─ no  → user = null, loading = false   (no wasted network round-trip)
└─ yes → GET /api/auth/me
         ├─ 200 → setUser(data.user)
         └─ any failure → removeToken() + setUser(null)
```

`ProtectedRoute` then renders a "Verifying Session…" spinner while `loading`, then either
the page or `<Navigate to="/login" replace />`.

### What this design gives up

| Property | Status |
|---|---|
| Works cross-domain in Safari/Chrome | ✅ (this was the whole point) |
| `httpOnly` XSS protection | ❌ — `localStorage` is readable by any script on the origin |
| Token revocation / denylist | ❌ — `POST /logout` is a cosmetic acknowledgement |
| Refresh tokens | ❌ — one 7-day token, then re-login |
| Immediate effect of password change | ❌ — existing tokens stay valid until expiry |

A leaked token is usable for its full 7 days. This is the explicit, documented trade-off
made to escape third-party-cookie blocking.

---

## 8. Pipeline 1 — Résumé ingestion

Optional, but it's what upgrades questions from generic to tailored.

```
User drops a file on /resume
   │
   │  Client-side gate: type ∈ {pdf, jpeg, png}, size ≤ 10 MB
   ▼
POST /api/resume/upload   (multipart, field name "resume")
   │
   │  multer memoryStorage → 10 MB cap → mimetype allowlist
   ▼
┌──────────── STEP 1: EXTRACT ────────────┐
│ PDF   → pdf-parse: new PDFParse().getText()
│ Image → Groq llama-3.2-11b-vision as an OCR engine
│         ("return the complete text exactly as it appears")
└─────────────────┬───────────────────────┘
                  ▼
┌──────────── STEP 2: GUARD ──────────────┐
│ text.trim().length < 20 → 422
│ "try a clearer image or a text-based PDF"
└─────────────────┬───────────────────────┘
                  ▼
┌──────────── STEP 3: STRUCTURE ──────────┐
│ Groq llama-3.1-8b-instant, temperature 0.3, JSON mode
│ input truncated to 4,000 chars
│ → { name, detectedRole, skills[≤8], experienceLevel,
│     projects[≤5], summary }
└─────────────────┬───────────────────────┘
                  ▼
user.resumeData = { ...structured, rawText: text.slice(0, 5000),
                    uploadedAt: new Date() }
                  │
                  ▼
201 — response echoes only the structured fields, never rawText
```

Two details worth noting:

- **`experienceLevel` is constrained in the prompt to the same four values as the
  `Session.level` enum** (`intern|junior|mid|senior`), so the parsed résumé can feed
  straight into session config without a mapping layer.
- **`uploadedAt` is the de-facto "has a résumé" sentinel.** Both
  `GET /api/resume` and session creation test `resumeData.uploadedAt` rather than
  checking whether the subdocument exists, because Mongoose materialises the subdocument
  with `null` defaults either way.

---

## 9. Pipeline 2 — Session creation & question generation

```
/onboarding — a single-page accordion
   │  role · level · interviewType · difficulty  (all required)
   │  jobDescription (optional free text)
   │  personality (carried in router state from the Dashboard)
   ▼
POST /api/sessions
   │
   ├── validate the four required fields → 400 if missing
   │
   ├── User.findById(req.user.userId) → read resumeData
   │   resumeContext = resumeData.uploadedAt ? resumeData : null
   │
   ├─── existingQuestions supplied? ──► YES: RETRY MODE
   │                                   reuse the exact prior question
   │                                   array verbatim. Zero AI calls.
   │                                   (so scores are comparable)
   │
   └─── NO ──► generateQuestions(role, level, interviewType,
                                 resumeContext, jobDescription,
                                 difficulty, personality)
                   │
                   ▼
              Groq llama-3.1-8b-instant, temperature 0.7, JSON mode
                   │
                   ▼
              always exactly 6 questions
   │
   ▼
Session.create({ ...config, questions,
                 isAiGenerated, isResumeTailored })
   │
   ▼
201 { session }  →  navigate('/interview', { state: { sessionId } })
```

### How the prompt is assembled

Three things get layered into one prompt:

**1. The persona preamble** — this is the entire mechanism behind the
`standard | mentor | faang` setting:

```js
let personalityPrompt = "Adopt the persona of a professional, standard HR technical interviewer.";
if (personality === 'mentor') {
  personalityPrompt = "Adopt the persona of a highly supportive mentor. …encouraging and "
                    + "focus on drawing out their strengths…";
} else if (personality === 'faang') {
  personalityPrompt = "Adopt the persona of a high-stress, skeptical FAANG 'bar raiser' "
                    + "interviewer. Your tone should be extremely formal, slightly "
                    + "intimidating, and push their limits.";
}
```

**2. One of two body branches:**

- **Résumé-tailored** — interpolates the structured résumé as a labelled block
  (Name / Detected Role / Skills / Experience Level / Projects / Summary), optionally
  preceded by a `JOB DESCRIPTION (TARGET)` block. Asks for a mix of résumé-specific,
  behavioural, and role-specific questions at the requested difficulty.
- **Generic** — role / level / type / difficulty only.

**3. A pinned opening question.** Question 1 is specified by example so the interview
starts like a human would:

> *"How are you ${name}? I was looking at your résumé, specifically your experience with
> [pick a skill/project], and let's move forward with the interview."*

### Where JD matching actually happens

**It's purely prompt-level.** When `jobDescription` is non-empty, the prompt gains a
clause — *"Ensure questions specifically test requirements from the Job Description."*

There is **no embedding model, no cosine similarity, and no computed match score**
anywhere in the codebase. "JD matching" means the LLM reads the JD alongside the résumé
and writes questions that bridge them. Worth being precise about this, because the
feature name suggests a retrieval pipeline that doesn't exist.

### Graceful degradation

If the Groq call fails — or `GROQ_API_KEY` isn't set at all — the function falls back to
**hand-written question pools keyed by role**, shuffled and sliced to 6, and flags the
session `isAiGenerated: false`. The UI then renders a `🛠️ DEMO` badge instead of `✨ AI`.

The app never hard-fails on AI unavailability. This pattern recurs in every single AI
function and is one of the project's defining characteristics (see [§17](#17-the-build-journey)).

---

## 10. Pipeline 3 — The live interview loop

This is the most intricate part of the app. `InterviewPage.jsx` (516 lines) orchestrates
three custom hooks, two media streams, and up to four API endpoints per question.

### Screen layout

```
┌─────────────────────────────────────────────────────────────────┐
│  [✕ End]        Q3 OF 6        📄 TAILORED       [☀/🌙]        │ sticky header
├───────────────────────────────────┬─────────────────────────────┤
│  LIVE STAGE                       │  CONVERSATION LOG           │
│                                   │                             │
│   "Tell me about a time you       │  🤖 How are you Raghav? …   │
│    disagreed with a teammate."    │  👤 I built a caching …     │
│                                   │  🤖 Nice — that's a solid … │
│   ┌─ COACH'S HINT ─────────┐      │  🤖 Tell me about a time …  │
│   │ Think about the STAR … │      │                             │
│   └────────────────────────┘      │  (auto-scrolled to bottom)  │
│                                   │                             │
│   ┌─ Listening… ───────────┐      │                             │
│   │ interim transcript     │      │     ┌──────────────┐        │
│   └────────────────────────┘      │     │ 📹 draggable │        │
│                                   │     │    webcam    │        │
│  [◀] [ 🎤 BIG MIC ] [▶]  [HINT]   │     └──────────────┘        │
│      [REPLAY]  [NEXT]             │                             │
└───────────────────────────────────┴─────────────────────────────┘
```

### The audio architecture — two recorders, one answer

This is the single most important design decision in the interview flow:

```
                    ┌─────────────────────────────┐
  User speaks ──────►│ 1. Web Speech API           │
       │             │    (webkitSpeechRecognition)│
       │             │    continuous, interim      │
       │             └──────────┬──────────────────┘
       │                        ▼
       │               live on-screen text — COSMETIC ONLY
       │
       │             ┌─────────────────────────────┐
       └────────────►│ 2. MediaRecorder            │
                     │    getUserMedia({audio})    │
                     │    → audio/webm Blob        │
                     └──────────┬──────────────────┘
                                ▼
                     POST /api/stt (multipart, field "audio")
                                ▼
                     Groq whisper-large-v3, temperature 0.0
                                ▼
                     THE AUTHORITATIVE TRANSCRIPT
```

**Why both?** The browser's Web Speech API is instant, which makes it perfect for showing
the user that they're being heard — but it mangles technical vocabulary and drops
punctuation. Grading a corrupted transcript produced bad feedback. Whisper is accurate
but requires a round-trip, so it can't drive a live display.

So: the browser recogniser feeds the UI, Whisper feeds the grader. `stop()` returns a
**Promise that resolves to the Whisper text**, with the browser transcript as a fallback
if the upload fails.

One important edge case: if the user never pressed the mic, `stop()` resolves `''` rather
than the previous question's leftover transcript. (That exact bug shipped once — see
[§17](#17-the-build-journey).)

### Server-side STT plumbing

The Groq SDK won't accept a raw in-memory `Buffer` — it needs a filesystem-backed stream
with a resolvable filename and extension. So `sttController` does a temp-file round-trip:

```js
tempPath = path.join(__dirname, `../../temp_stt_${Date.now()}.webm`);
fs.writeFileSync(tempPath, req.file.buffer);
const fileStream = fs.createReadStream(tempPath);
// … transcribe …
fs.unlinkSync(tempPath);   // cleaned up in BOTH the success path and the catch
```

(`temp_stt_*.webm` is in `.gitignore` for exactly this reason.)

### Text-to-speech

```
New question renders
   │
   ▼
POST /api/tts { text }     ← truncated to 500 chars server-side
   │
   ▼
msedge-tts: en-US-AriaNeural, AUDIO_24KHZ_48KBITRATE_MONO_MP3
   │  stream collected and Buffer.concat'd
   ▼
audio/mpeg bytes + Cache-Control: public, max-age=86400
   │
   ▼
Blob → URL.createObjectURL → new Audio().play()
   │
   └─ on failure → browser speechSynthesis fallback
                   (prefers a Google/Microsoft en-* voice)
```

An `AbortController` cancels in-flight TTS when the question changes, and
`URL.revokeObjectURL` runs on `onended`/`onerror`.

> **One curious line:** `ttsService` prepends `"... "` to every utterance. The browser's
> MP3 decoder discards the leading frames while it syncs to the stream, which swallowed
> the first syllable of every question. The leading ellipsis is sacrificial silence.

### `handleNext()` — the core state machine

Every mic press or NEXT click runs this. The ordering is deliberate at several points:

```
 1. wasListening = isListening          ← captured BEFORE stop() mutates it
 2. finalTranscript = await stop()      ← resolves the Whisper text
    answer = wasListening ? (finalTranscript || transcript || '') : ''
                                        ← a skipped question records '', not stale text
 3. snapshot: draw the <video> element onto a canvas,
    toDataURL('image/jpeg', 0.5)        ← base64 webcam frame

 4. IS THIS THE LAST QUESTION?
    ├── YES → POST /api/feedback { sessionId, answers, questions, snapshots }
    │         → navigate(`/feedback/${sessionId}`)
    │
    └── NO  → the two-step conversational bridge:
              │
              ├─ (a) POST /api/sessions/:id/reaction { question, answer }
              │      → one short human acknowledgement
              │        ("That's a very diplomatic way to handle conflict.")
              │        defaults to "Okay. " on failure
              │
              ├─ (b) FOLLOW-UP? only if ALL of:
              │        answer.length > 20
              │        totalQuestions < 8
              │        Math.random() > 0.5          ← yes, a literal coin flip
              │      → POST /api/sessions/:id/followup { question, answer }
              │      → insertNextQuestion(reaction + followup)
              │
              └─ (c) otherwise → modifyNextQuestion(reaction)
                     prepends the reaction onto the already-queued next question,
                     so TTS speaks it as ONE continuous utterance

 5. nextQuestion(answer, actualNextQuestionText)
    ↑ the text is passed forward EXPLICITLY rather than re-read from
      `questions`, because the splice above is an async setState and the
      closure would still hold the pre-update array.
```

That last point is the fix for a real shipped bug where the conversation log displayed
the un-prefixed question while the TTS spoke the prefixed one.

### Why advancement is manual

There are **no timers anywhere in this app**. No per-question countdown, no session
clock, no auto-advance on silence. `InterviewPage.jsx` carries the comment:

```js
// User must manually click NEXT to advance.
```

This is the end state of three failed attempts at silence-based auto-advance
([§17](#17-the-build-journey) has the full story). The structural problem: **there is no
reliable signal that distinguishes "finished answering" from "thinking mid-answer."**

The mic button is therefore overloaded as a submit control:

```
coach still speaking?  → interrupt TTS
not listening?         → start recording
already listening?     → handleNext()   ← stop + advance in one gesture
```

### Supporting features

| Feature | Mechanism |
|---|---|
| **Hint lifeline** | `POST /api/sessions/:id/hint` → orange "COACH'S HINT" card. **One per question** — the button is disabled once `hint` is non-empty, and `hint` resets on advance. The prompt explicitly says *"Do NOT write the answer for them, just give a strategic hint."* |
| **Replay** | Re-speaks the current question |
| **Review previous** | A `viewIndex` separate from `currentIndex` lets the user scroll back through answered questions with a "Reviewing Previous" badge; the mic is disabled while reviewing |
| **End test (✕)** | Abandons the session ungraded, returns to `/dashboard` |
| **Webcam** | `DraggableCamera` is a `forwardRef` component so the parent can read the raw `<video>` for snapshots. Mirrored with `scaleX(-1)`, draggable via framer-motion, stops all tracks on unmount |
| **Provenance badge** | `📄 TAILORED` / `✨ AI` / `🛠️ DEMO`, driven by `isResumeTailored` / `isAiGenerated` |

---

## 11. Pipeline 4 — Grading & feedback

```
POST /api/feedback { sessionId, answers[], questions[], snapshots[] }
   │  (rate-limited: 10 per hour per IP)
   ▼
┌─ Trust the CLIENT'S question array ────────────────────────────┐
│ orderedQuestions = submittedQuestions?.length                  │
│                      ? submittedQuestions                      │
│                      : session.questions;   ← DB as fallback   │
│                                                                │
│ session.questions = orderedQuestions;  ← write back so the     │
│ session.answers   = answers;             feedback page renders │
│ await session.save();                    the right order       │
└────────────────────┬───────────────────────────────────────────┘
                     ▼
┌─ Build the transcript ─────────────────────────────────────────┐
│ Q: <question>                                                  │
│ A: <answer>  — or, if blank:                                   │
│    "[NO ANSWER PROVIDED BY CANDIDATE / SKIPPED]"               │
│    ↑ explicitly injected so the grader can SEE the skip        │
└────────────────────┬───────────────────────────────────────────┘
                     ▼
         analyseAnswer(transcript, snapshots)
                     │
     ┌───────────────┴───────────────┐
     │ STAGE 1 — optional vision     │
     │                               │
     │ pick the MIDDLE valid frame:  │
     │  valid[floor(len/2)]          │
     │  (first/last frames catch the │
     │   user reaching for the mouse)│
     │                               │
     │ llama-3.2-11b-vision,         │
     │ max_tokens 100:               │
     │ "analyse body language,       │
     │  posture, facial expression,  │
     │  2 brief sentences"           │
     │                               │
     │ wrapped in its own try/catch  │
     │ — vision failure must NOT     │
     │   break text grading          │
     └───────────────┬───────────────┘
                     ▼
     ┌─ STAGE 2 — the grading prompt ─────────────────────────┐
     │ llama-3.1-8b-instant, temperature 0.4,                 │
     │ max_tokens 2000, JSON mode                             │
     │                                                        │
     │ • explicit score-distribution rubric (below)           │
     │ • 4 axes, each with Reward / Note-for-improvement       │
     │ • enumerated filler-word target list                    │
     │ • NON-VERBAL ANALYSIS block spliced in if vision ran   │
     │ • per-field length and framing directives              │
     └───────────────┬────────────────────────────────────────┘
                     ▼
     ┌─ Normalise the response (the defensive core) ──────────┐
     │ stripJsonFences() → JSON.parse → then tolerate:        │
     │   • flat OR nested scores   (raw.clarity ?? scores.clarity) │
     │   • camelCase OR snake_case (raw.starFeedback ?? raw.star_feedback) │
     │   • out-of-range values     (Math.min(10, Math.max(0, …)))  │
     │   • a zeroed overallScore   (recompute as the mean)     │
     └───────────────┬────────────────────────────────────────┘
                     ▼
            Feedback.create({ … })  →  201
```

### The grading rubric

The prompt carries a deliberately **generous** score distribution:

```
GRADING PHILOSOPHY:
- A candidate who shows up, tries their best, and gives reasonable answers
  deserves a baseline of 6-7/10.
- Scores of 8-9/10 are for strong, well-structured answers that demonstrate
  real preparation.
- A perfect 10/10 is rare but achievable for truly exceptional responses.
- Scores below 5 should only be given if the candidate skipped questions
  entirely or gave completely off-topic answers.
- Always give credit for attempting an answer, even if it's imperfect.
  Growth comes from practice.
```

Four axes, each 0–10, each framed as **Reward** / **Note for improvement** rather than
*Evaluate* / *Penalise*:

- **CLARITY** — articulation and conciseness
- **RELEVANCE** — did they answer the question asked
- **STRUCTURE** — is there a narrative arc
- **CONFIDENCE** — assertiveness, hedging, filler density

**Filler-word detection** is prompt-driven, with the target list enumerated explicitly:
*um, uh, like (as filler), basically, you know, sort of, kind of, I mean, right?,
actually (as filler)* — returning both a count and the unique list.

### The three output fields

| Field | Spec in the prompt |
|---|---|
| `feedback` | 4–6 sentences, **starting with what the candidate did well**, ending with an encouraging actionable tip |
| `starFeedback` | Grade **S**ituation / **T**ask / **A**ction / **R**esult *separately* — this is the "STAR coach" |
| `modelAnswer` | A 4–6 sentence polished STAR exemplar for the question they struggled with most, framed as *"Here is how you could level up your answer."* |

The prompt closes with a shape guard: *"CRITICAL: All score fields must be at the TOP
LEVEL of the JSON, not nested inside a 'scores' object."* — and the normaliser handles
it anyway, because the model disobeys sometimes.

### The feedback page

`FeedbackPage.jsx` (666 lines) fetches feedback and session in parallel via
`Promise.all`, then renders:

- An animated SVG **radial gauge** for the overall score
- Four **metric cards** for the sub-scores
- A **filler-words badge** that expands into a popover of the actual words detected
- **Critical Insights** — the weakness pulled from `starFeedback`, the strength derived
  client-side from score thresholds
- A collapsible **Sample Answer** (`modelAnswer`)
- A collapsible **Answer Review** listing every Q/A with a **Re-practice** button
- **PDF export** via `jsPDF` + `autoTable`

---

## 12. Pipeline 5 — Dashboard, retry & targeted re-practice

### Dashboard

```
GET /api/auth/me          → identity (redirects to /login if not ok)
GET /api/sessions         → history, newest first
GET /api/feedback/stats   → { averageScore, trend: number[] }
```

`/api/feedback/stats` is the readiness engine: it pulls all of the user's feedback
ascending by date and returns the mean plus the raw series. The client renders the series
as a hand-rolled inline SVG **sparkline** and the mean as a 10-segment readiness bar.
Empty state returns `{ averageScore: 0, trend: [] }`.

The dashboard also hosts the **interviewer-personality picker**
(standard / mentor / faang), whose choice travels to `/onboarding` as router state.

### Retry the same interview

`POST /api/sessions` with `existingQuestions: session.questions` creates a brand-new
session that **reuses the exact prior question list and makes zero AI calls**. The point
is comparability — if the LLM generated fresh questions, comparing the two scores would
be meaningless.

### Targeted re-practice

`POST /api/feedback/single` grades a single Q/A pair through the same `analyseAnswer`
function with a one-pair transcript, and **deliberately does not persist a `Feedback`
document** — so drilling one weak question doesn't pollute the readiness average.

`RepracticeModal` reuses the same `useSpeech` hook for recording and shows the analysis
inline with a STRONG/DEVELOPING badge.

### Deletion

`DELETE /api/sessions/:id` cascades: `Feedback.deleteMany({ sessionId, userId })`.

---

## 13. The AI layer in depth

Everything AI lives in one file: `server/services/groqService.js` (473 lines, 9 exported
functions).

### Model routing

| Model | Used for | Why this one |
|---|---|---|
`llama-3.1-8b-instant` | questions, grading, hints, follow-ups, reactions, résumé parsing | Fast and cheap — latency sits on the critical path between questions |
`llama-3.2-11b-vision-preview` | résumé image OCR, webcam body-language analysis | Multimodal |
`whisper-large-v3` | speech-to-text | Accuracy; `temperature: 0.0`, `language: 'en'` |

TTS is **not** Groq — it's `msedge-tts`, which is free and unmetered.

### Temperature as a deliberate dial

```
0.0  Whisper transcription       — determinism
0.1  Image OCR                   — no creative reinterpretation of text
0.3  Résumé parsing              — structured extraction
0.4  Grading                     — consistent scoring, slight prose variation
0.5  Hints                       — mild variety
0.7  Question gen, follow-ups,   — genuine variety so repeat sessions differ
     reactions
```

### Three patterns that recur in every function

**1. JSON mode plus belt-and-braces fence stripping.** Every structured call sets
`response_format: { type: 'json_object' }`, *and* the response still goes through
`stripJsonFences()` — a helper that peels ```` ```json ```` wrappers before `JSON.parse`.
JSON mode is not a guarantee.

**2. Two-level graceful degradation.** Every function has an early
`if (!process.env.GROQ_API_KEY) return <canned data>` and a `try/catch` returning
fallbacks on API failure. The app runs end-to-end with **zero API keys**.

**3. Defensive prompting.** The prompts themselves carry structural instructions
(*"CRITICAL: All score fields must be at the TOP LEVEL"*, *"Do NOT ask another
question"*, *"Do NOT write the answer for them"*, *"Do NOT praise them, just ask the
follow-up directly"*), and short completions get post-processed —
`generateReaction` strips the surrounding quotes the model insists on adding.

### The nine functions

| Function | Model | Notable constraints |
|---|---|---|
| `generateQuestions` | 8b-instant | Always 6; persona preamble; two prompt branches; role-keyed fallback pools |
| `analyseAnswer` | vision + 8b-instant | Two-stage; generous rubric; heavy output normalisation |
| `generateReaction` | 8b-instant | **1 sentence, under 15 words, `max_tokens: 30`**; few-shot; "do NOT ask another question" |
| `generateFollowUp` | 8b-instant | One probing question, under 2 sentences; not persisted server-side |
| `generateHint` | 8b-instant | 1–2 sentences or 2 bullets; must not reveal the answer |
| `analyzeResume` | 8b-instant | Input truncated to 4,000 chars; `experienceLevel` constrained to the Session enum |
| `extractTextFromImage` | vision | `max_tokens: 4000`; "do not summarize or skip any section" |
| `transcribeAudio` | whisper-large-v3 | `temperature: 0.0`, `language: 'en'` |
| `stripJsonFences` | — | Shared helper (was duplicated 3× before cleanup) |

### Cost control

There is **no billing, no credits, and no paid tier** in this application. "Paid
endpoint" in the code comments means *costs the operator money*, not *gated behind a
purchase*. Spend is controlled structurally:

| Lever | Value |
|---|---|
| Per-IP rate limits | auth 20/15min · feedback 10/hr · media 60/10min |
| TTS text | truncated to 500 chars |
| Résumé text | 4,000 chars to the LLM, 5,000 stored |
| Upload caps | résumé 10 MB · audio 25 MB · JSON body 15 MB |
| TTS browser cache | `max-age=86400` (24 h) |
| Reaction calls | `max_tokens: 30` |
| Vision calls | one middle frame only, `max_tokens: 100` |

---

## 14. Cross-cutting concerns

### CORS

```js
const allowed = [process.env.CLIENT_URL].filter(Boolean);
origin: (origin, cb) => {
  if (!origin) return cb(null, true);                        // curl, same-origin
  if (allowed.includes(origin)) return cb(null, true);
  if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)/.test(origin))
    return cb(null, true);                                   // dev only
  cb(new Error('Not allowed by CORS'));
}
```

The `!isProduction` gate matters: an earlier version allowed *any* `localhost:*` origin
in **all** environments, which meant a page served from someone's local dev server could
hit the production API.

### Rate limiting

Three `express-rate-limit` instances, all per-IP, all in-memory:

| Limiter | Window | Max | Applied to |
|---|---|---|---|
| `authLimiter` | 15 min | 20 | register, login, google |
| `feedbackLimiter` | 60 min | 10 | `POST /api/feedback` |
| `mediaLimiter` | 10 min | 60 | `POST /api/tts`, `POST /api/stt` |

In-memory means counters reset on restart and don't coordinate across instances — fine
for a single Render dyno, wrong for a horizontally scaled deployment (Redis store needed).

### Theming

Dark is the hardcoded default. Light mode is a **retrofitted inversion layer** rather
than a token swap. `globals.css` contains ~50 `!important` overrides keyed on escaped
Tailwind class names under a `.theme-light` root class:

```css
.theme-light .bg-\[\#1a1a1a\] { background-color: #ffffff !important; }
.theme-light .text-white      { color: #1a1a1a !important; }
```

Two consequences worth knowing:

1. Any element written with a **literal** `text-black` isn't covered by an override, so
   it stays black-on-black in dark mode. This caused real bugs.
2. Theme state is **duplicated in four places** (`DashboardPage`, `FeedbackPage`,
   `Navbar`, `LandingPage`), each independently reading `localStorage['theme']` and
   toggling `document.documentElement.classList`. This is the clearest consolidation
   candidate in the frontend.

`tailwind.config.js` also registers a proper `theme-light` variant plugin, which
`LandingPage` uses — so there are two parallel theming mechanisms in the codebase.

### The API client layer

There isn't a real one. `client/src/utils/authFetch.js` is the whole abstraction:

```js
export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
```

Characteristics:

- It spreads caller headers, so `Content-Type: application/json` is set at each call
  site — and correctly **omitted** for `FormData` uploads so the browser can set the
  multipart boundary itself.
- It returns the **raw `Response`**. No response unwrapping, no centralised error
  handling, and **no 401 interceptor** — a 401 from any endpoint does not trigger logout.
  Every call site repeats `const data = await res.json(); if (!res.ok) throw …`.
- Login/register/google deliberately use bare `fetch`, since no token exists yet.
- The base URL constant `import.meta.env.VITE_API_URL || 'http://localhost:5000/api'` is
  **re-declared in 9 separate files**.

### Error handling

**There is no global Express error handler and no 404 handler.** Consequences:

- The CORS rejection error, multer `fileFilter` rejections, and multer
  `LIMIT_FILE_SIZE` errors all bypass route-level `try/catch` and fall through to
  Express's default handler → an **HTML stack-trace page** where the client expects JSON.
- So uploading a `.docx` résumé or an oversized file produces an unparseable response.

Route handlers themselves are careful: generic client-facing messages, with
`console.error` retaining detail server-side (error messages used to leak
`err.message` to clients).

---

## 15. Deployment topology

```
         ┌──────────────────────────┐
         │ Vercel                   │
         │ client/ as the deploy root│
         │                          │
         │ vercel.json:             │
         │   /(.*) → /index.html    │
         │                          │
         │ env: VITE_API_URL        │
         │      VITE_GOOGLE_CLIENT_ID│
         └────────────┬─────────────┘
                      │ HTTPS
         ┌────────────▼─────────────┐
         │ Render                   │
         │ server/ — Express        │
         │                          │
         │ trust proxy: 1           │
         │ GET / → health (keeps the│
         │   free dyno from idling) │
         │                          │
         │ env: PORT, NODE_ENV,     │
         │   MONGODB_URI, JWT_SECRET,│
         │   CLIENT_URL, GROQ_API_KEY│
         └────────────┬─────────────┘
                      │
         ┌────────────▼─────────────┐
         │ MongoDB Atlas            │
         │ (mongodb+srv://)         │
         └──────────────────────────┘
```

### The SPA rewrite

`client/vercel.json` exists for exactly one reason:

```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

React Router routes are client-side only. Without this, a hard refresh on `/dashboard`
makes Vercel look for a real file at that path, find none, and return 404. In-app
navigation always worked because it never hit the server — so the bug only appeared on
refresh or on a pasted URL.

### Environment variables

**Server** (`dotenv.config({ path: '../.env' })` — the *root* `.env`, loaded
independently in three files):

| Name | Required | Purpose |
|---|---|---|
| `MONGODB_URI` | ✅ fail-fast | Atlas connection string |
| `JWT_SECRET` | ✅ fail-fast | Token signing |
| `GROQ_API_KEY` | no (degrades) | All AI |
| `CLIENT_URL` | effectively | CORS allowlist |
| `PORT` | no (→ 5000) | |
| `NODE_ENV` | no | Gates the localhost CORS exception |

**Client** (Vite, `import.meta.env`):

| Name | Fallback |
|---|---|
| `VITE_API_URL` | `http://localhost:5000/api` |
| `VITE_GOOGLE_CLIENT_ID` | a dummy string |

Present in `.env` but **no longer read by anything**: `ELEVENLABS_API_KEY`,
`ELEVENLABS_VOICE_ID` (TTS moved to `msedge-tts`) and `GOOGLE_CLIENT_ID` (the server
validates via the userinfo endpoint, not by client ID).

> **Note:** the UI still renders a *"Voiced by ElevenLabs"* attribution link on the
> interview page — a leftover from before the TTS provider swap. It should be removed or
> corrected to Microsoft Edge TTS.

`.env.example` exists but is **0 bytes** — a real onboarding gap.

---

## 16. Complete API reference

`protect` = requires `Authorization: Bearer <jwt>`.

### `/api/auth`

| Method | Path | Auth | Limiter | Body → Response |
|---|---|---|---|---|
| POST | `/register` | — | authLimiter | `{name,email,password}` → `201 {token, user}` · 409 duplicate · 400 password < 8 |
| POST | `/login` | — | authLimiter | `{email,password}` → `200 {token, user}` · uniform 401 |
| POST | `/google` | — | authLimiter | `{token}` (access_token) → `200 {token, user}` · 401 unverified email |
| POST | `/logout` | — | — | → `200` stateless ack (client discards the token) |
| GET | `/me` | protect | — | → `{user}` minus `passwordHash` |
| PUT | `/update` | protect | — | `{email?,password?,targetRoles?}` → updated user |

### `/api/resume`

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/upload` | protect | multipart field `resume`; 10 MB; pdf/jpeg/png; 422 if < 20 chars extracted |
| GET | `/` | protect | → `{hasResume, resumeData\|null}` |
| DELETE | `/` | protect | clears `user.resumeData` |

### `/api/sessions` — `router.use(protect)`

| Method | Path | Body → Response |
|---|---|---|
| GET | `/` | → `{sessions}` newest first |
| POST | `/` | `{role,level,interviewType,difficulty,jobDescription?,existingQuestions?,personality?}` → `201 {session}` |
| GET | `/:id` | ownership-scoped `findOne({_id, userId})` → 404 if not owner |
| POST | `/:id/hint` | `{question}` → `{hint}` |
| POST | `/:id/followup` | `{question,answer}` → `{followup}` — **not persisted** |
| POST | `/:id/reaction` | `{question,answer}` → `{reaction}` |
| DELETE | `/:id` | cascades `Feedback.deleteMany` |

> The hint/followup/reaction routes take the question and answer from the **request
> body**, not from the stored session. The `:id` is used only to look up `personality`.

### `/api/feedback` — `router.use(protect)`

| Method | Path | Limiter | Notes |
|---|---|---|---|
| POST | `/` | feedbackLimiter | `{sessionId,answers,questions?,snapshots?}` → `201 {feedback}` |
| POST | `/single` | — | `{question,answer}` → `{analysis}`, **not persisted** |
| GET | `/stats` | — | → `{averageScore, trend[]}` — declared **before** `/:sessionId` |
| GET | `/:sessionId` | — | → `{feedback}` · 404 |

### Media

| Method | Path | Auth | Limiter | Notes |
|---|---|---|---|---|
| POST | `/api/tts` | protect | mediaLimiter | `{text}` → `audio/mpeg` bytes, 24 h cache; text truncated to 500 |
| POST | `/api/stt` | protect | mediaLimiter | multipart field `audio`, 25 MB → `{text}` |

### Health

| Method | Path | Notes |
|---|---|---|
| GET | `/` | `{message: 'Orion AI Backend is Active 🚀', status: 'Healthy'}` — keeps the free Render dyno warm |
| GET | `/api/health` | `{status, timestamp}` |

---

## 17. The build journey

31 commits over 94 days — but **27 of them land in a single 7-day sprint** (Apr 7–14),
followed by long-tail UI work and a July cleanup-and-hardening pass.

Total churn: **+15,727 / −2,673** lines (**+9,703 / −2,628** excluding the lockfile and
binary assets). The tree at HEAD is ~7,000 lines of hand-written JS/JSX/CSS.

### Phases

| Phase | Dates | Character |
|---|---|---|
| **1. Scaffold with mocks** | Apr 7–8 | Full folder skeleton written first with `// TODO` markers and mock returns, then wired to real Mongo and a real LLM |
| **2. Visual identity + feature explosion** | Apr 9–10 | Dark ORION theme; résumé parsing, JD matching, STAR coach, hints, TTS. **Claude → Groq** swap |
| **3. Auth + voice realism** | Apr 10–11 | Google OAuth, Whisper STT, Edge TTS, protected routes, first deploy |
| **4. Conversational polish** | Apr 12 | Grading tone, bridging reactions, personalities, webcam vision, re-practice, mobile layout |
| **5. Deployment firefighting** | Apr 13–14 | Rollup build error, transcript misalignment, **cookie → Bearer migration** |
| **6. Long-tail UI** | May 2–8 | Landing page; onboarding rebuilt as an accordion |
| **7. Cleanup + hardening** | Jul 10 | Dead-code removal, then two security passes |

### The technique that shaped everything: mock-first, then promote the mocks

The initial scaffold wrote **every module as a complete API surface returning fixtures**,
each with a `// TODO:` marker and a trailing `// Ready for: …` comment naming its next
integration point. `claudeService.js` returned a hardcoded 6-question array and a
hand-written STAR model answer, so the entire frontend could be built with **zero API
keys and zero database**.

The interesting part is what happened on integration. The mocks weren't deleted — they
were **demoted behind `if (!process.env.X_API_KEY)` guards and kept**. That's why the app
still runs end-to-end with no credentials today, and why a Groq outage degrades the UX
instead of 500-ing it. A later commit went further, upgrading the *error* path from
`throw` to a plausible 5/10 feedback object with genuine coaching copy.

### The fourteen real problems

#### 1. MongoDB Atlas wouldn't resolve

**Symptom:** connection hangs, or `querySrv ENOTFOUND`.
**Cause:** Atlas uses `mongodb+srv://`, which requires a DNS **SRV** record lookup.
Node 17+ resolves IPv6-first, and many consumer ISP resolvers mishandle SRV records.
**Fix:** force IPv4 ordering and hard-override the resolvers, **before any other import**:

```js
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '1.1.1.1']);
```

Still the first statement in `server/index.js` today.

#### 2. CORS blocked the dev server

**Symptom:** requests blocked whenever Vite picked a port other than 5173.
**Cause:** `origin: process.env.CLIENT_URL || 'http://localhost:5173'` is a single
hardcoded origin. Vite falls back to 5174/5175 when 5173 is taken, and `127.0.0.1` is a
*different origin* from `localhost` to the browser. Origin-less requests (curl, Postman)
were also rejected.
**Fix:** a function-based validator that prefix-matches localhost/127.0.0.1 and allows
`!origin`. *(This permissive rule later became a security finding — see #14.)*

#### 3. The LLM returned inconsistent JSON shapes

The most instructive problem in the project. `analyseAnswer` started as a short prompt
and a bare `JSON.parse(content)`. Three distinct failure modes appeared:

| Failure | Example | Fix |
|---|---|---|
| **Nesting drift** | sometimes `{clarity: 8}`, sometimes `{scores: {clarity: 8}}` | `raw.clarity ?? scores.clarity` |
| **Casing drift** | `starFeedback` vs `star_feedback` | accept both |
| **Range / zero drift** | scores outside 0–10, or `overallScore: 0` | `Math.min(10, Math.max(0, …))`, and recompute the mean when it's 0 but sub-scores aren't |

Plus a shouted prompt instruction (*"CRITICAL: All score fields must be at the TOP
LEVEL"*) — belt **and** braces, because the prompt alone wasn't reliable.

**The lesson that shaped the rest of the codebase: LLM output is untrusted input.** The
single largest defensive-coding effort in the repo is the JSON-parsing layer — fence
stripping, key-shape tolerance, type coercion, clamping, recomputation, quote stripping.

#### 4. Google OAuth: ID token vs access token

**Symptom:** `OAuth2Client.verifyIdToken()` throws.
**Cause:** `useGoogleLogin` is the implicit flow and returns an **`access_token`**, not a
JWT **`id_token`**. `verifyIdToken` only accepts the latter.
**Fix:** exchange the access token at `https://www.googleapis.com/oauth2/v3/userinfo`
instead. The `google-auth-library` client was left instantiated but **unused for three
months** before cleanup finally deleted it along with its ~3 MB dependency tree.

#### 5. The first word of every question was cut off

**Cause:** the browser's MP3 decoder discards leading frames while it syncs to the
stream, swallowing the first syllable.
**Fix:** prepend `"... "` as sacrificial silence. Three characters; the comment explaining
them is longer than the fix.

#### 6. Auto-advance fired while the AI was still talking

**Cause:** the mic was live during TTS playback, so the "4 s of silence" timer was
counting down **during the AI's own speech** and skipping the user's turn.
**Fix:** add `!isSpeaking` to the guard *and* to the dependency array.

#### 7. The AI gave everyone 9s and 10s — then 3s and 4s

Two reversals in 12 hours, and a genuinely interesting product lesson.

**First:** scores were uniformly inflated. The root cause wasn't the prompt — **skipped
questions were being silently omitted from the transcript loop, so the grader literally
never saw them.** Fixed by explicitly injecting
`[NO ANSWER PROVIDED BY CANDIDATE / SKIPPED]`, and by hardening the prompt to
*"BRUTALLY HONEST… An average acceptable interview is a 5/10."*

**Then, ~12 hours later:** the strict rubric was demoralising. Users practising
interviews got 3s and 4s and stopped using the product. Every rubric bullet was flipped
from *Evaluate* / **Penalise** to **Reward** / *Note for improvement*, and an explicit
score distribution was written in (baseline 6–7 for a genuine attempt). The `feedback`
spec changed from *"identify the #1 strength and #1 weakness"* to *"**START with what the
candidate did well**."*

**The lesson:** grading severity is a **product** decision that lived entirely in a
prompt string. It was retuned without touching a single line of application logic,
schema, or UI — and the normalisation layer from problem #3 absorbed the change for free.

#### 8. The Web Speech API transcript was too inaccurate to grade

**Cause:** `webkitSpeechRecognition` drops technical vocabulary and punctuation, so the
LLM was grading a corrupted transcript.
**Fix:** the **dual-pipeline recorder** — browser recognition for the live display,
`MediaRecorder` → Whisper for the authoritative text. `stop()` became a Promise resolving
to the Whisper result, with the browser transcript as fallback.

Also: `no-speech` and `aborted` errors are now swallowed as non-errors, because they fire
routinely on start/stop and were killing sessions.

#### 9. The Groq SDK wouldn't accept an in-memory buffer

**Cause:** `groq.audio.transcriptions.create({ file })` needs a filesystem-backed stream
with a resolvable filename and extension; a raw `Buffer` fails.
**Fix:** temp-file round-trip with `unlinkSync` cleanup in both the success path and the
catch. *(Side effect: one 45 KB temp file got committed and lived in the repo for three
months.)*

#### 10. Chrome silently killed the mic mid-answer

**Cause:** Chrome's `SpeechRecognition` auto-terminates after a few seconds of silence
**even with `continuous = true`**. A candidate pausing to think lost the mic.
**Fix:** auto-restart on `onend` whenever listening was still *intended*:

```js
recognition.onend = () => { if (isListening) { try { recognition.start(); } catch {} } };
```

Cost: the effect's dependency array had to include `isListening`, which re-creates the
recogniser on every toggle.

#### 11. The silence timer reset on its own output

**Cause:** the auto-advance effect was keyed on `[transcript]`, so **every interim
recognition result re-ran the effect and restarted the timer** — it could never fire.
**Attempted fix:** a `lastActivityRef` stamped inside `onresult`, with the effect keyed
on `[lastActivity]`. This didn't actually work either: the value was returned as a
snapshot from a ref, so its identity never changed between renders and the effect still
didn't re-fire as intended.

#### 12. Base64 snapshots exceeded Express's body limit

**Symptom:** `PayloadTooLargeError` on feedback submission.
**Cause:** `express.json()` defaults to **100 kb**. A handful of base64-encoded webcam
JPEGs blow straight past it.
**Fix:** raised to 50 MB in the emergency, then **walked back to 15 MB** in the security
pass as a DoS-surface reduction, with a comment explaining the sizing.

#### 13. Hard-refreshing any route on Vercel returned 404

The classic SPA deep-link problem, invisible in development because the Vite dev server
rewrites unknown paths and static hosting doesn't.
**Fix:** `client/vercel.json` with a catch-all rewrite to `/index.html`.

#### 14. `vite build` passed locally and failed on Vercel

**The entire diff:**

```diff
-const AuthContext = createContext();
+export const AuthContext = createContext();
```

**Cause:** Vite's **dev server uses esbuild** with lenient unbundled ESM and tolerated a
non-exported binding that something in the module graph referenced. The **production
build uses Rollup**, which performs real cross-module binding resolution and errors on an
unresolved import. Same code, two different bundlers, two different answers.

#### 15. Questions and answers were misaligned on the feedback page

A textbook distributed-state bug, and the best-documented commit in the repo.

**Symptom:** answer #3 appeared under question #5, and the AI graded mismatched pairs.

**Cause: two sources of truth that ordered the same array differently.**

```
Frontend splices a follow-up into position currentIndex + 1:
   [Q1, Q2, followup-to-Q2, Q3]

Backend's getFollowUp did `session.questions.push(followup)` — APPENDS:
   [Q1, Q2, Q3, followup-to-Q2]

createFeedback then zipped session.questions[i] against answers[i]
→ question #4 paired with the answer to question #3.
```

**Fix, in three parts:**

1. **Delete the backend push.** `getFollowUp` now only returns text —
   *"the frontend manages question ordering."*
2. **The frontend submits its array** alongside the answers.
3. **The backend treats the submitted array as authoritative**, with the DB as fallback,
   and writes it back so the feedback page renders the right order.

**The principle: designate a single authority for ordering** — here the client, because
the client is what performs the ordering mutations — and have the server persist its
result rather than independently mutating the same structure.

#### 16. Login worked, then every request 401'd — on Safari

The flagship problem, and the culmination of a **four-commit losing battle**.

**Symptom:** login returns 200 with a user object, then every subsequent request 401s.
Reliably broken on Safari. Intermittently broken on Chrome. **Working perfectly on
localhost.**

**The cookie config at the time was already correct:**

```js
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,       // required for sameSite: 'none'
  sameSite: 'none',   // required for cross-site
  maxAge: 7 * 24 * 60 * 60 * 1000,
};
if (!isProd) { COOKIE_OPTIONS.secure = false; COOKIE_OPTIONS.sameSite = 'lax'; }
```

…plus `app.set('trust proxy', 1)` (because Render terminates TLS at its edge, so Express
saw `req.protocol === 'http'` and refused to set a `secure` cookie) and
`cors({ credentials: true })`.

**Root cause:** the client is on `*.vercel.app` and the API on `*.onrender.com` — **two
different registrable domains**, so the auth cookie is a **third-party cookie** in every
browser's eyes.

- **Safari ships ITP (Intelligent Tracking Prevention) on by default**, which blocks
  third-party cookie *storage* outright. `Set-Cookie` arrives; Safari discards it. No
  error, no warning — the cookie simply never exists, so `req.cookies.token` is
  `undefined` and `protect` 401s.
- **Chrome** blocks the same cookie whenever third-party cookies are disabled — by the
  user, by an extension, by incognito, or by the Privacy Sandbox rollout. Hence the
  *intermittent* reports.
- **Everything worked on localhost** because `localhost:5173` → `localhost:5000` is
  **same-site** (port is not part of "site"), so the `sameSite: 'lax'` dev branch applied
  and no third-party rule triggered. **The bug was structurally invisible in
  development.**

**The critical realisation: no amount of cookie configuration can fix this.** `secure`,
`sameSite`, `domain`, and `trust proxy` were all already correct. The *transport* was the
problem.

**The fix — move the token out of cookie storage and into a header the browser can't
police:**

```js
const TOKEN_KEY = 'orion_token';
export const getToken    = () => localStorage.getItem(TOKEN_KEY);
export const setToken    = t  => localStorage.setItem(TOKEN_KEY, t);
export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

export async function authFetch(url, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
```

Rolled out carefully: the backend returned the JWT in the **JSON body** *while still
setting the cookie*, and `protect` read the header **with a cookie fallback** — so the
migration couldn't log anyone out mid-session. Every `credentials: 'include'` call site
across six pages and hooks swapped to `authFetch`. The commit notes *"zero visual changes
— only the transport layer for auth is different."*

The cookie half was removed three months later once the rollout was settled.

**Trade-off accepted explicitly:** `localStorage` is readable by JavaScript, so this
gives up `httpOnly`'s XSS protection in exchange for **actually working in Safari**.

#### 17. Skipped questions inherited the previous answer

**Symptom:** inflated scores and a corrupted transcript.
**Cause:** if the user never pressed the mic, `stop()` short-circuited and resolved the
**stale `transcript` state from the previous question** — so answer N−1 was recorded as
the answer to question N.
**Fix:** two coordinated changes:

```js
// useSpeech.stop(), when no recorder was active:
setTranscript(''); resolve('');              // was: resolve(transcript)

// InterviewPage.handleNext():
const wasListening = isListening;            // captured BEFORE stop() mutates it
const answer = wasListening ? (finalTranscript || transcript || '') : '';
```

#### 18. The conversation log didn't match what was spoken

**Cause:** `insertNextQuestion` / `modifyNextQuestion` are async `setState` calls.
`nextQuestion` then read `questions[nextIdx]` from a **closure captured before those
updates applied** — so the log showed the un-prefixed question while the TTS spoke the
reaction-prefixed one.
**Fix:** pass the exact text forward explicitly — `nextQuestion(answer, nextQuestionText)`
— instead of re-reading state.

> **Problems 17 and 18 are the same bug class: stale closures in async React.** Both
> fixes follow one of two patterns — *capture before mutate* (`wasListening`) or
> *pass the value forward* (`nextQuestion(answer, text)`).

#### 19. Light-theme text was invisible

**Cause:** a direct consequence of implementing light mode as
`.theme-light .text-white { color: #1a1a1a !important }` overrides. Any element written
with a **literal** `text-black` has no corresponding override, so it stayed
black-on-dark-background.
**Fix:** conditional classes (`isThemeLight ? 'text-black' : 'text-white'`) and threading
`isThemeLight` down as a prop. A patch, not a cure — the architecture still invites the
bug.

#### 20. Every protected page independently called `/auth/me`

**Cause:** per-component `useAuth()` state meant N redundant round-trips per navigation,
inconsistent loading states, and a visible "Verifying Session…" flash on every transition.
**Fix:** a single `AuthContext` provider that verifies once and shares via context.
`ProtectedRoute` shrank from 38 to 22 lines.

### Six abandoned approaches

| Abandoned | Replaced with | Why |
|---|---|---|
| **Anthropic Claude** (`claude-3-5-sonnet`, `@anthropic-ai/sdk`) | **Groq** `llama-3.1-8b-instant` | Speed and free tier — latency sits on the critical path for in-interview reactions. An orphaned `test.js` still importing the Anthropic SDK lingered for 3 months |
| **ElevenLabs TTS** | **`msedge-tts`** `en-US-AriaNeural` | Quota exhaustion. The ElevenLabs code was ringed with 500-char truncation and 24 h caching *purely to ration it*. Edge Neural voices are free. The wrapper kept the same `Buffer`-returning signature, so **zero call sites changed** |
| **Silence-based auto-advance** — three tuning attempts (4 s + 3 s countdown → 5 s flat → 6 s keyed on `lastActivity`) | **A manual NEXT button** | No reliable signal separates "done answering" from "thinking." Also cut people off mid-sentence. Rather than keep tuning a heuristic, control was handed to the user |
| **5-step onboarding wizard** (progress bar, slide transitions, emoji cards) | **Single-page accordion** | No overview, awkward back-navigation, and — the real bug — the step index mapped to field names by **positional array lookup** (`keys[currentStep]`), so reordering a step silently wrote the wrong field. The accordion uses explicit `section.id` keys |
| **Google ID-token verification** (`OAuth2Client.verifyIdToken`) | userinfo-endpoint exchange | `useGoogleLogin` returns an access token, not an ID token |
| **`httpOnly` cookie auth** (`sameSite: 'strict'` → `'none' + secure` → env-split) | **Bearer token in `localStorage`** | Safari ITP and Chrome third-party-cookie blocking — unfixable at the cookie layer across two registrable domains |

### The security pass

Three months after the sprint, a dedicated hardening pass found **eight findings — and
every one traces back to a reasonable local-dev shortcut that shipped.**

| Finding | What could happen | Fix |
|---|---|---|
| **`JWT_SECRET \|\| 'dev-secret'`** in 4 places | If the env var were ever unset in production, every token would be signed with the literal string `'dev-secret'` — **anyone could forge a JWT for any `userId`** | Removed all fallbacks **and** added a fail-fast boot guard |
| **No brute-force protection** on login/register/google | Unlimited credential stuffing | `authLimiter`: 20 / 15 min / IP |
| **Google takeover via unverified email** | An attacker creates a Google identity claiming `victim@example.com` without proving ownership; the server links it to the victim's existing account → **full takeover** | Reject when `email_verified` is `false` or `'false'` |
| **`/api/tts` and `/api/stt` were fully open** — no `protect`, no limiter | Anyone with the URL could burn the project's entire Groq quota | `protect` + `mediaLimiter` + a 25 MB STT file cap; client hooks migrated to `authFetch` |
| **`error: err.message` returned to clients** in 4 handlers | Leaked stack traces, library internals, file paths | Generic client messages; `console.error` retained server-side |
| **CORS localhost bypass in production** | A page served from someone's local dev server could hit the production API with credentials | Gated the localhost rule on `!isProduction`; `.filter(Boolean)` the allowlist |
| **50 MB body limit** | Large-payload DoS surface | Reduced to 15 MB with a comment explaining the sizing |
| **No password policy** | 1-character passwords accepted | `length < 8` → 400, plus a `typeof password !== 'string'` guard (defends against a body sending `password: {$ne: null}`) |

A separate cleanup pass removed **−223 net lines**: four never-imported UI primitives
that had been broken since the April design-system change, the orphaned Anthropic scratch
file, residue from the abandoned auto-advance heuristic (`lastActivityRef`,
`silenceTimerRef`, `isSpeakingRef`), a duplicate `useAuth` export, a committed temp audio
file, and the `stripJsonFences` logic that had been copy-pasted three times.

### Seven themes worth carrying forward

1. **Mock-first scaffolding, then *promote* the mocks.** Every service was born returning
   fixtures. On integration they were demoted behind `if (!API_KEY)` guards rather than
   deleted — so they became permanent outage resilience.

2. **LLM output is untrusted input.** Fence stripping, flat-vs-nested tolerance,
   camel/snake tolerance, `parseInt` coercion, min/max clamping, recomputed aggregates,
   quote stripping. The prompt carries defensive instructions *and* the parser assumes
   the prompt will be ignored.

3. **Dev/prod asymmetry caused the four hardest bugs.** Cookie blocking (localhost is
   same-site), the Rollup export error (esbuild vs Rollup), the Vercel 404 (dev server
   rewrites, static hosting doesn't), and the CORS localhost hole — **all four were
   structurally invisible in development.**

4. **Prompt strings as product configuration.** Grading severity and interviewer persona
   are both pure prompt text. Zero schema, logic, or UI changes to retune either.

5. **One authority per invariant.** The question-ordering bug came from client and server
   mutating the same array with different semantics. Fixed by designating the client
   authoritative and making the server a persister.

6. **Stale closures are the default failure mode of async React.** Capture before mutate,
   or pass the value forward.

7. **Security debt accumulates from convenience, not malice.** Every finding in the
   hardening pass has a traceable origin commit, and none were careless at the time —
   they were reasonable shortcuts that outlived their context.

---

## 18. Known gaps & roadmap

Documented honestly, in rough priority order.

### Correctness and security

| Issue | Detail |
|---|---|
| ~~**IDOR on `POST /api/feedback`**~~ **— FIXED** | The session lookup was `Session.findById(sessionId)`, **not scoped by `userId`** — the only session query in the codebase that wasn't. The handler then wrote the request body's `questions`/`answers` onto that session and saved, so any authenticated user who knew another user's session ObjectId could **overwrite that session's transcript**. Now `findOne({ _id: sessionId, userId: req.user.userId })`, with a `questions.length === answers.length` guard alongside it |
| **Deprecated vision model** | `llama-3.2-11b-vision-preview` has been decommissioned by Groq. Résumé *image* upload and webcam body-language analysis will fail at the API — and both degrade **silently**, so this fails quietly rather than loudly |
| **No global error handler** | CORS rejections and multer `fileFilter` / `LIMIT_FILE_SIZE` errors return Express's default **HTML** error page where the client expects JSON |
| **Unmetered AI endpoints** | `POST /api/sessions`, the three `/:id/{hint,followup,reaction}` routes, `POST /api/feedback/single`, and `POST /api/resume/upload` all call Groq with **no rate limiter** |
| **Mongo connection failure doesn't exit** | Unlike the env guards, a bad `MONGODB_URI` leaves the process listening and serving 500s |
| **No token revocation** | 7-day JWTs, no denylist; a password change doesn't invalidate existing tokens |
| **Client-trusted transcript** | `questions`, `answers`, and `snapshots` come wholly from the request body. The arrays are now length-checked against each other, but the server still can't verify that a submitted question was one it actually generated — see the `followUpsIssued` idea in the roadmap |
| **Duplicate `Feedback` docs** | Nothing enforces uniqueness on `sessionId`, so repeat submissions create duplicates and `findOne` returns an arbitrary one |

### Architecture and DX

| Issue | Detail |
|---|---|
| **`/interview` is not refresh-safe** | `sessionId` lives in **router state only**. The Vercel rewrite fixes the HTTP 404, but refreshing mid-interview bounces the user to `/onboarding` and loses in-progress answers. Fix: move to `/interview/:sessionId` |
| **No 401 interceptor** | An expired token produces per-page failures rather than a clean logout |
| **Theme logic duplicated 4×** | Plus `!important` overrides instead of token swaps — the single largest refactor opportunity |
| **`VITE_API_URL` re-declared in 9 files** | One `src/lib/api.js` exporting the base URL and typed helpers would replace all of it |
| **No tests, no linter, no TypeScript** | Nothing guards the parallel-array invariant or the AI response shape |
| **Blocking sync I/O in the STT hot path** | `writeFileSync`/`unlinkSync` stall the event loop on every transcription, and temp files land in the repo root instead of an OS temp dir |
| **In-memory rate-limit store** | Counters reset on restart and don't coordinate across instances — needs Redis to scale horizontally |
| **`.env.example` is 0 bytes** | No onboarding template for the 6 server + 2 client variables |
| **Stale ElevenLabs attribution** | The interview page still credits ElevenLabs; TTS is `msedge-tts` |
| **No `*` route** | Unknown client-side paths render nothing |
| **Dead `useAuth.js` hook** | Superseded by `AuthContext`; the one piece of dead code the cleanup pass missed |

### Product roadmap

- **Deterministic follow-ups** — `Math.random() > 0.5` means two runs of the same config
  differ in length. Gate on answer quality instead.
- **Real JD matching** — embed the JD and the résumé, compute a similarity score, and
  surface a per-requirement coverage map. Currently it's prompt-level only.
- **Question pools for `design` and `marketing`** — both are valid `Session.role` values
  but have no fallback pool, so they land on `default`.
- **Per-question scoring** — grading is whole-transcript today, so the UI can't show
  which specific answer dragged the score down.
- **Session resume** — persist answers as they're given rather than only at submission.
- **Billing** — if the project ever needs a paid tier, there's currently no `plan` field,
  no JWT plan claim, and no payment integration. Per-IP rate limiting is the only abuse
  control.
