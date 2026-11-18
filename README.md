# RosterSync

**Algorithmic Team Formation & Multi-Constraint Schedule Optimization Platform**

RosterSync replaces fragmented university group chats and static bulletin boards with an automated, constraint-driven team-formation engine. The platform solves the NP-hard problem of assembling balanced academic project teams by programmatically resolving schedule overlaps, skill complementarity, and academic target ambitions.

---

## Architecture Overview

RosterSync uses a service-oriented monorepo managed via **Turborepo** and **pnpm workspaces**, cleanly separating transactional business logic from computational optimization routines.

```
                              ┌────────────────────────┐
                              │    Next.js 15 SPA      │
                              │      (Port 3000)       │
                              └───────────┬────────────┘
                                          │ HTTPS / WSS
                                          ▼
                              ┌────────────────────────┐
                              │     Core API Layer     │
                              │    (NestJS Gateway)    │
                              │      (Port 8000)       │
                              └─────┬────────────┬─────┘
                                    │            │
                Internal HTTP / RPC │            │ Prisma ORM
                                    ▼            ▼
    ┌─────────────────────────────────┐   ┌───────────────────────────┐
    │     Matching & Schedule Engine  │   │   PostgreSQL Database     │
    │        (Python / FastAPI)       │   │        (Port 5432)        │
    │           (Port 8001)           │   └───────────────────────────┘
    └─────────────────────────────────┘

```

### Core Technical Pillars

1. **Temporal Overlap & Schedule Bitmasking:**
Ingests `.ics` university timetables and personal calendars, maps weekly availability to discrete bit vectors, and calculates instant common free windows across $N$-member candidate pools using bitwise intersection operations.
2. **Multi-Constraint Optimization Engine:**
Calculates real-time candidate-team compatibility scores using a weighted scoring formula:

$$\text{Compatibility} = w_1 \cdot S_{\text{schedule}} + w_2 \cdot S_{\text{skills}} + w_3 \cdot S_{\text{ambition}}$$


3. **Atomic Concurrency Controls:**
Employs PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE`) to eliminate race conditions when multiple candidates apply simultaneously for a team's final open vacancy.

---

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| **Monorepo** | Turborepo, pnpm | Task pipeline orchestration, local caching, workspace management |
| **Frontend** | Next.js 15 (App Router), React, Tailwind CSS, shadcn/ui | Dynamic visual schedule heatmap, team-building canvas |
| **Core API Gateway** | NestJS, TypeScript, Prisma ORM, Socket.io | JWT auth, role validation, team lifecycle, real-time WebSocket state |
| **Matching Microservice** | FastAPI, Python 3.11, NumPy, SciPy, icalendar | Interval tree intersections, matrix compatibility calculations |
| **Database** | PostgreSQL 16 | ACID transactional guarantees, relational integrity |
| **DevOps & CI/CD** | Docker, Docker Compose, GitHub Actions | Multi-container orchestration, PR validation pipelines |

---

## Repository Structure

```text
rostersync/
├── .github/workflows/         # CI pipelines (lint, typecheck, unit tests)
├── apps/
│   ├── web/                   # Next.js 15 Frontend Client
│   ├── core-api/              # NestJS Gateway & WebSocket Server
│   └── matching-service/      # Python/FastAPI Optimization Engine
├── packages/
│   ├── shared-types/          # Shared TypeScript interfaces
│   └── tsconfig/              # Shared compiler configs
├── deployments/
│   └── docker-compose.yml     # Multi-container local orchestration
├── pnpm-workspace.yaml
├── turbo.json
└── package.json

```

---

## Engineering Team & Ownership

| Engineer | Focus Area | Key Deliverables |
| --- | --- | --- |
| **Engineer 1** | Optimization & Matching Lead | Scoring heuristics, vector similarity for skills, matching algorithms |
| **Engineer 2** | Scheduling & Calendar Ingestion | `.ics` parsing pipeline, availability bitmasking, schedule overlap matrix |
| **Engineer 3** | Core Backend & Data Architect | Relational database schema, institutional auth, atomic vacancy locks |
| **Engineer 4** | Real-Time State & Communications | WebSocket infrastructure, live notification feeds, invite lifecycles |
| **Engineer 5** | Frontend Lead & UX Architect | Schedule conflict heatmap, team management dashboard, responsive UI |
| **Engineer 6** | DevOps, Testing & CI/CD | Docker environments, automated GitHub Actions pipelines, load testing |

---

## Getting Started

### Prerequisites

* [Node.js](https://nodejs.org/) `>= 20.x`
* [pnpm](https://pnpm.io/) `>= 9.x`
* [Docker](https://www.docker.com/) and Docker Compose
* [Python](https://www.python.org/) `>= 3.11` (for local matching service development)

### Quickstart (Docker Orchestration)

1. Clone the repository:
```bash
git clone https://github.com/<your-org>/rostersync.git
cd rostersync

```


2. Boot the entire infrastructure via Docker Compose:
```bash
docker compose -f deployments/docker-compose.yml up --build

```


3. Access local services:
* **Web Client:** [http://localhost:3000](http://localhost:3000)
* **Core API Gateway:** [http://localhost:8000](http://localhost:8000)
* **Matching Service Docs:** [http://localhost:8001/docs](http://localhost:8001/docs)



### Local Development (Bare Metal)

1. Install root dependencies:
```bash
pnpm install

```


2. Start PostgreSQL:
```bash
docker compose -f deployments/docker-compose.yml up postgres -d

```


3. Run Turborepo development pipeline:
```bash
pnpm dev

```



---

## Delivery Roadmap

* **Demo 1 (MVP):** Institutional auth (`@stud.ubbcluj.ro`), profile taxonomy, `.ics` calendar import, interactive availability grid, manual team postings with visual schedule overlap heatmaps.
* **Demo 2:** Automated compatibility scoring engine, 1-click "Find My Team" algorithmic ranking, atomic applicant approval and vacancy auto-close.
* **Final Presentation:** Professor cohort-wide automatic team partitioning, WebSocket event notifications, official roster CSV export, and algorithm performance benchmarks on synthetic student cohorts.
