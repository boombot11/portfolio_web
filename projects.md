# Sahil Jadhav - Portfolio Master Content

This file is the single source of truth for portfolio and resume project content.
Use this to power the Projects, Experience, Research, and Skills sections on the website.

---

## Portfolio Revamp Plan (Modern UI/UX + Scroll Effects)

### Goal
Rebuild the current basic portfolio into a modern, premium-feel experience with strong storytelling, smooth motion, and high-signal technical depth.

### Phase 1 - Content + Information Architecture
1. Replace old low-level project cards with 4 high-impact projects only.
2. Merge resume + README details into structured content blocks (problem, architecture, impact, stack).
3. Remove outdated/incorrect entries (especially Settlemint).
4. Add explicit tags: `Internship`, `Personal`, `Research`, `Production`.

### Phase 2 - Visual System Upgrade
1. Define a bold design system (custom typography, color tokens, spacing scale).
2. Replace the current plain white layout with layered backgrounds (gradient + grain + soft grid).
3. Add visual hierarchy upgrades: stronger hero, sticky section labels, timeline rails, metric badges.
4. Improve mobile-first readability and section rhythm.

### Phase 3 - Motion + Fancy Scroll Experience
1. Add scroll-progress indicator and active section highlighting.
2. Add reveal choreography (staggered cards, parallax layers, pinned storytelling sections).
3. Add project cards with tilt/hover glow + animated tech chips.
4. Add smooth section transitions and subtle micro-interactions.

### Phase 4 - Credibility + Conversion
1. Add quantified impact callouts (latency reduction, scale handled, delivery context).
2. Add architecture snapshots/GIFs and optional case-study deep links.
3. Add clear CTA block: resume, GitHub, mail, and availability.
4. Add performance + accessibility pass (Lighthouse, contrast, motion-reduced mode).

### Phase 5 - Launch Quality
1. Content freeze + proofreading.
2. Cross-device QA (desktop/tablet/mobile).
3. Optimize assets and animation performance.
4. Final deploy and monitor.

---

## Portfolio Section Structure (Recommended)

1. Hero (who you are + one-line value proposition)
2. Selected Work (4 high-level projects)
3. Internship Experience (JM Financial, Tata Digital)
4. Research
5. Skills and Live Capabilities
6. Contact / CTA

---

## Selected Work (Only High-Level Projects)

## 1) Enterprise Financial Regulatory RAG Platform (`Internship`, `Production`)

### Context
Built as part of internship work for financial regulatory and compliance use cases requiring high trust and deterministic retrieval paths.

### Problem
Financial teams needed fast, reliable answers across large regulatory corpora while minimizing hallucinations and preserving traceability.

### What I Built
- Architected a hybrid multi-path RAG platform:
  - vector-less semantic retrieval path based on a custom `PageIndex` style JSON tree
  - deterministic zero-LLM structured SQLite path for high-confidence, sub-millisecond lookups
- Implemented backend services in Python/FastAPI for retrieval orchestration and processing flows.
- Built a Flutter frontend for RAG chat and due-diligence operations.
- Added robust session continuity, streaming response flows, and UI state handling patterns.

### Cloud/Infra + Delivery
- Worked with containerized deployments and delivery workflows via Docker.
- Contributed to cloud deployment workflows on GCP including GKE and Cloud Run patterns.
- Worked with Artifact Registry style image push/deploy flow in CI/CD contexts.

### Impact
- Enabled faster internal compliance query resolution.
- Balanced AI assistance with deterministic retrieval paths for enterprise trust.
- Improved developer/operator confidence with clearer system architecture and deployment repeatability.

<!-- Photo: /public/<rag-project-screenshot>.png -->
<!-- Deployed Link: https://<rag-live-link> -->
<!-- GitHub Link: https://github.com/<repo> -->

---

## 2) Compliance Audit Workflow Engine (`Internship`, `Production`)

### Context
Built for compliance teams to manage audit workflows with explicit trails, assignment flow, and revision loops.

### Problem
Audit tasks with attachments and stepwise approvals were hard to track and standardize across junior and senior assignees.

### What I Built
- Developed a visual workflow engine in Java + Spring Boot with dynamic custom node behavior (inspired by n8n-like interaction patterns).
- Designed a generalized schema-driven workflow model supporting:
  - pass-on item trails
  - role-based handoff between assignees
  - return-with-revision cycles
  - forward progression with explicit action tracking
- Ensured traceable workflow transitions for enterprise audit reliability.

### Impact
- Used live by Compliance teams for operational audit flow management.
- Reduced ambiguity in approval chains and revision cycles.
- Improved process transparency and accountability.

<!-- Photo: /public/<workflow-engine-screenshot>.png -->
<!-- Deployed Link: https://<workflow-live-link-if-public> -->
<!-- GitHub Link: https://github.com/<repo> -->

---

## 3) Financial Data & Notification Automation Platform (`Internship`, `Production`)

### Context
Worked on internal automation tied to JM PRO style notifications and large-scale financial data processing.

### Problem
Needed reliable, real-time notification logic and data pipelines that can handle large volumes, edge cases, and frequent updates from multiple data sources.

### What I Built
- Built and maintained notification scheduling flows for use cases like:
  - birthdays
  - IPO events and updates
  - portfolio summaries
  - research/market report based triggers
- Integrated data from company databases updated through scraper bots and finance APIs.
- Deployed scheduling and automation scripts on GCP VMs with cron-based orchestration patterns.
- Worked on C# to PostgreSQL script migration/conversion with heavy edge-case handling.
- Contributed scaling techniques including multi-threading, sharding strategies, and connection pooling for high-volume records.

### Cloud/Infra + Delivery
- Worked with Docker images/containers and deployment paths used in CI/CD.
- Hands-on with GCP resources including VMs, cron scheduling, and storage/bucket workflows.

### Impact
- Improved freshness and reliability of user-facing financial notifications.
- Reduced manual operational load with automation-first architecture.
- Increased throughput reliability for high-scale data workloads.

<!-- Photo: /public/<notification-platform-screenshot>.png -->
<!-- Deployed Link: https://<internal-or-public-link> -->
<!-- GitHub Link: https://github.com/<repo> -->

---

## 4) SimArch - Visual IaC Orchestrator & Simulator (`Personal`, `Advanced Systems`)

### Context
Personal project focused on system design simulation + real execution workflows.

### Problem
Most architecture learning tools are static diagrams without execution realism or telemetry-driven feedback loops.

### What I Built
- Built a visual drag-and-drop IaC orchestration/simulation platform.
- Supported dual modes:
  - simulation mode (safe state-machine based emulation)
  - execution mode (real Docker-based runtime behavior)
- Implemented backend orchestration in FastAPI/Python with provider-style architecture.
- Integrated live WebSocket telemetry streams including terminal-style output bursts.
- Built interactive frontend flows for architecture composition and runtime visibility.

### Tech Depth
- Event-driven orchestration and DAG-like execution behavior.
- Real-time telemetry transport and UI rendering.
- Multi-provider architecture patterns for extensibility.

### Impact
- Demonstrates deep systems thinking from UI to orchestration runtime.
- Bridges architecture design, developer experience, and execution realism.

<!-- Photo: /public/<simarch-screenshot>.png -->
<!-- Deployed Link: https://<simarch-link> -->
<!-- GitHub Link: https://github.com/<simarch-repo> -->

---

## Internship Experience

## JM Financial - Software Development Intern

- Architected hybrid RAG pathways for regulatory document intelligence.
- Built compliance workflow tooling for real audit operations.
- Migrated/scaled data pipelines and notification automation workloads.
- Worked across Python, Java, Flutter, C#, SQL, cloud infra, and deployment pipelines.

## Tata Digital Pvt. Ltd. - Software Engineer Intern (Jun 2024 - Aug 2024)

- Built app UI capabilities including authentication/location related features.
- Worked on sonic/audio feature performance improvements.
- Delivered features in cross-functional Agile product teams.

Note: Settlemint has been removed as requested.

---

## Research

## Advancements in Data Augmentation using Computer Vision Techniques

- Enhanced DiffuseMix-style augmentation flow for stronger model robustness.
- Built saliency-based overlays and dynamic masking pipelines with OpenCV.
- Applied pattern-oriented synthetic data generation approaches for scenarios like medical and satellite imagery.

---

## Skills (Core Stack)

### Languages
- Python
- Java
- Dart
- JavaScript
- C#
- SQL

### Frameworks and Platforms
- FastAPI
- Spring Boot
- Flutter
- React
- Next.js

### Cloud, DevOps, Data
- Docker
- Kubernetes (GKE)
- Google Cloud Platform (Cloud Run, VMs, scheduling workflows)
- Artifact Registry workflows
- PostgreSQL
- MongoDB

---

## Live Skills (What You Can Expect From Me in Production)

- I adapt quickly to existing architectures and team workflows.
- I can work across full-stack boundaries: backend, frontend, data, infra, and delivery.
- I use AI/LLM tooling effectively (including SLM/LLM integration patterns) while keeping deterministic fallbacks where trust is critical.
- I can move from prototype to production-minded implementation with reliability and operational context.
- I communicate clearly with cross-functional teams and ship in iterative cycles.

---

## Suggested Website Copy Snippets

### One-line headline
Building production-grade AI and systems software across backend, cloud, and product UX.

### Short intro
I am a B.Tech IT engineer focused on high-impact software at the intersection of AI systems, cloud infrastructure, and real product delivery. I have built enterprise-facing regulatory RAG tooling, workflow engines, and scale-focused automation pipelines, while also shipping advanced personal systems projects like SimArch.

### Project section intro
A curated set of 4 high-impact builds that reflect architecture depth, production constraints, and end-to-end ownership.

---

## Data Notes for Portfolio Implementation

- Keep only 4 projects in the visible project section.
- Use badges per project: `Internship` / `Personal` / `Production` / `Research`.
- Keep all external links optional until finalized.
- Keep image paths and deployed links commented out until ready.

<!--
Example content model:
{
  "title": "Project Name",
  "type": ["Internship", "Production"],
  "summary": "...",
  "impact": ["...", "..."],
  "stack": ["FastAPI", "Flutter", "Docker"],
  "photo": "/public/<image>.png",
  "live": "https://...",
  "github": "https://..."
}
-->
