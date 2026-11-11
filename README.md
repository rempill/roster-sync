# Engineering Plan: Team Formation & Scheduling Platform

---

### Core Technical Challenges to Present

1. **Automated Schedule Intersection Engine:**
* Ingesting academic calendars (`.ics` files, Google Calendar sync, or university timetable scraping).
* Computing temporal overlaps using bitmask operations or interval trees to determine true mutual working windows across $N$ students in real time.


2. **Multi-Constraint Matching Algorithm:**
* A scoring engine implementing a weighted bipartite matching / knapsack formulation:

$$\text{Compatibility Score} = w_1 \cdot S_{\text{schedule}} + w_2 \cdot S_{\text{skills}} + w_3 \cdot S_{\text{ambition}}$$


* Balances hard constraints (identical course enrollment, maximum team capacity) with soft constraints (complementary tech stacks, schedule overlap, target grades).


3. **Concurrency & Race Conditions:**
* Atomic operations and database locks to handle simultaneous join requests when an open team has only one remaining slot.



---

## 2. Six-Engineer Work Division & Architecture

To avoid overlapping workflows, the architecture is decoupled into six distinct engineering domains:

| Role | Core Domain & Responsibilities | Suggested Stack | Resume Impact Headline |
| --- | --- | --- | --- |
| **Engineer 1: Optimization & Matching Lead** | Heuristic constraint solver, scoring weights, vector similarity for skills, auto-matching engine. | Python (FastAPI / NumPy) or Go | *Designed and benchmarked a multi-constraint optimization engine for automated team formation.* |
| **Engineer 2: Scheduling & Ingestion Engine** | Calendar ingestion (`.ics` parser, Google Calendar API), availability bitmasking, schedule overlap matrix. | Node.js, Go, or Python | *Built a high-throughput temporal overlap engine calculating common availability across multi-user graphs.* |
| **Engineer 3: Data Architect & Core Backend** | Relational schema design, entity lifecycles, institutional authentication (`@stud.ubbcluj.ro` SSO), atomic join locks. | PostgreSQL, Prisma, NestJS / Spring Boot | *Architected scalable relational schemas, role-based auth, and pessimistic locking for concurrent team joins.* |
| **Engineer 4: Real-Time State & Communications** | WebSocket infrastructure for team invites, real-time application status, push notifications. | WebSockets, Socket.io, Redis Pub/Sub | *Engineered real-time state synchronization and event messaging for distributed user collaboration.* |
| **Engineer 5: Frontend Lead & UX Architect** | Dynamic team formation canvas, schedule heatmap visualizer, progressive onboarding, responsive UI. | Next.js, React, Tailwind CSS, TanStack Query | *Built a responsive SPA featuring real-time schedule conflict heatmaps and dynamic team-building flows.* |
| **Engineer 6: DevOps, Testing & CI/CD** | Containerization, automated CI/CD pipelines, load testing, automated synthetic data generation for benchmarks. | Docker, GitHub Actions, k6, AWS / Render | *Architected automated CI/CD pipelines, containerized microservices, and end-to-end API load tests.* |

---

## 3. Phased Delivery Roadmap

### Demo 1: Core Architecture & Visual Schedule Overlap (MVP)

* **Institutional Verification:** Restrict account creation to institutional domains (`@stud.ubbcluj.ro`).
* **Taxonomy & Profiles:** Pre-populated course lists, roles (Frontend, Backend, Mobile, DevOps, ML), and target grade preferences (e.g., "Pass only" vs. "Max grade / 10").
* **Interactive Availability Grid:** Visual weekly availability editor with immediate `.ics` calendar import.
* **Smart Team Postings:** Teams post specific vacancy slots (e.g., *"Need 1 Backend Dev with >= 4 hours overlap on Thursdays/Fridays"*).
* **Schedule Overlap Inspector:** Instant visual heatmap when viewing a team: *"Your schedule overlaps 8.5 hours/week with this group."*

### Demo 2: Algorithmic Matching Hook

* **Match Score Calculation:** Automated percentage match indicator on all team listings based on skill gaps and shared free time.
* **"Find My Team" Auto-Ranker:** A single-click query returning the top 5 compatible teams with plain-text justifications (*"Fills their open React slot; 6 overlapping hours on weekends"*).
* **Application & Atomic Join Flow:** Team owners approve/reject candidates; database transactions automatically close listings upon reaching capacity.

### Final Presentation: Scale & Differentiation

* **Cohort-Wide Auto-Grouping ("The Professor Mode"):** Administrative utility where an instructor imports a list of unassigned students and the algorithm partitions them into balanced teams.
* **Real-Time Notification Pipeline:** WebSocket alerts when invited, accepted, or when open slots decrease.
* **Official Export System:** One-click roster generation exporting team composition to CSV/Excel following official faculty submission templates.
* **Empirical Benchmarks:** Performance graphs demonstrating matching algorithm latency across 100, 500, and 2,000 synthetic student profiles.

---

## 5. Immediate Action Plan

1. **Tech Stack Selection:** Confirm the backend language (FastAPI recommended for rapid optimization prototyping; NestJS/Go for strict typing) and frontend framework (Next.js 15+).
2. **Assign Core Roles:** Map each of the 6 team members to one of the specific domains defined above.
3. **Define Algorithm Constraints:** Formalize the input schema (skills, course, availability matrix) to establish clean API contracts between frontend and backend leads.
4. **Initialize Repository:** Configure branch protection, Docker Compose environments, and project management boards (Linear / GitHub Projects).
