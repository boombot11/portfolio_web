# SimArch

**Visual, drag-and-drop local IaC orchestrator and architecture simulator.**

Design distributed systems on a canvas. Bring them to life with one click — either as a zero-risk simulation or as real Docker containers on your machine.

---

## What it does

SimArch runs in two modes selected by the toggle in the top bar:

| | Simulate | Execute |
|---|---|---|
| **Git node** | Python state machine faking commits/pushes | Real `git clone` on your host filesystem |
| **Docker node** | Simulated build steps + ANSI TTY output | Real `docker build` / `docker run` via Docker SDK |
| **Postgres node** | Probabilistic provisioning state machine | Real `postgres:15-alpine` container |
| **Redis node** | In-memory KV store with real TTL/eviction logic | Real `redis:7-alpine` container |
| **Object Storage node** | In-memory bucket/object store (mc + aws s3 CLI) | Real `minio/minio` container (S3-compatible) |
| **Message Queue node** | In-memory RabbitMQ (real deques, real commands) | Real `rabbitmq:3-management-alpine` container |
| **Load Balancer node** | Simulated Nginx (round_robin/least_conn/ip_hash) | Real `nginx:alpine` with generated `nginx.conf` |
| **Monitoring node** | In-memory Prometheus+Grafana stack | Real `prom/prometheus` + `grafana/grafana` containers |
| **Networking** | EventBus signal routing | Project-scoped Docker bridge network |
| **DATABASE_URL** | Simulated `db_ready` event | Auto-injected from Postgres into Docker env |
| **Cost** | Zero (no Docker needed) | Requires Docker Desktop |

Both modes stream live ANSI-colored TTY output to the terminal panel via WebSocket.

---

## Quick start

### Backend

```bash
cd backend
pip install -r requirements.txt

# Optional — for AI text-to-architecture
cp .env.example .env
# Add ANTHROPIC_API_KEY or OPENAI_API_KEY to .env

uvicorn main:app --reload
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
```

### Frontend

```bash
# From the repo root
flutter pub get
flutter run -d macos     # or -d windows / -d linux
```

### Requirements

| Dependency | Required for |
|---|---|
| Flutter 3.x | Frontend |
| Python 3.11+ | Backend |
| MongoDB | Project persistence (cloud save/load) |
| Docker Desktop | Execute mode only |
| `pip install docker` | Execute mode only |

---

## Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Flutter Desktop (Riverpod + CustomPaint canvas)                 │
│                                                                   │
│  CanvasToolbar  ──►  add nodes, undo/redo, save, AI, run        │
│  SimCanvas      ──►  drag-drop, edge drawing, animated pulses    │
│  InspectorPanel ──►  node config, live metrics, event injection  │
│  TerminalPanel  ──►  live ANSI TTY from all nodes                │
└────────────────────────┬────────────────────────────────────────┘
                         │  HTTP + WebSocket
                         │  POST /emulation/{id}/start
                         │  WS   /ws/telemetry/{id}
┌────────────────────────▼────────────────────────────────────────┐
│  FastAPI Backend  (Python asyncio)                               │
│                                                                   │
│  EmulationEngineV2                                               │
│    ProviderRegistry  ──►  swaps simulated ↔ real providers       │
│    EventBus          ──►  routes signals along canvas edges       │
│    DAG gate          ──►  upstream deps must reach RUNNING first  │
│    TTY burst         ──►  micro-jittered ANSI chunks → WS        │
│                                                                   │
│  Simulate providers:  CodeRepository · ComputeContainer          │
│                       Postgres · Kubernetes · Redis              │
│                       ObjectStorage · MessageQueue               │
│                       LoadBalancer · Monitoring                  │
│                                                                   │
│  Execute providers:   MetalCodeRepository (real git)             │
│                       MetalDocker (real docker run)              │
│                       MetalPostgres (real postgres:15-alpine)    │
│                       MetalRedis (real redis:7-alpine)           │
│                       MetalObjectStorage (real minio/minio)      │
│                       MetalMessageQueue (real rabbitmq:3-mgmt)   │
│                       MetalLoadBalancer (real nginx:alpine)      │
│                       MetalMonitoring (prom/prometheus + grafana)│
│                                                                   │
│  NetworkManager  ──►  simarch-{project_id} Docker bridge         │
│  WorkspaceManager ──►  /tmp/simarch_workspace/{project}/{node}   │
└─────────────────────────────────────────────────────────────────┘
```

---

## File map

### Flutter (`lib/`)

```
lib/
├── main.dart                     App entry point, shell layout
├── theme/app_theme.dart          Dark theme, colours, fonts
├── models/
│   ├── sim_node.dart             NodeType enum + 11 node subclasses
│   ├── sim_edge.dart             SimEdge, EdgeType
│   └── sim_project.dart         SimProject (projectName, nodes, edges)
├── providers/
│   ├── canvas_provider.dart      CanvasNotifier — nodes, edges, undo/redo
│   ├── telemetry_provider.dart   WS connection, emulation state, TTY, proposals
│   ├── simulation_provider.dart  Phase 3 local DFS simulation
│   └── registry_provider.dart   Fetches /registry/nodes; offline fallback
├── canvas/
│   ├── sim_canvas.dart           60fps canvas — 5-layer RepaintBoundary stack
│   ├── canvas_toolbar.dart       2-row header: action bar + node palette
│   ├── tutorial_dialog.dart      12-page in-depth tutorial (this button →)
│   ├── edge_painter.dart         Draws edges; dual pulse sets (blue=telemetry, green=sim)
│   ├── terminal_panel.dart       Interactive TTY terminal — ANSI renderer
│   ├── export_dialog.dart        IaC export (Docker Compose / Terraform / CLI)
│   └── cloud_dialogs.dart        Save / load / AI generate dialogs
├── nodes/node_widget.dart        Node card — lifecycle glow animations
├── inspector/node_inspector.dart Per-type field editors + live metrics
└── services/
    ├── api_service.dart          All HTTP calls to localhost:8000
    └── code_export_service.dart  Dart-side IaC code generation
```

### Backend (`backend/`)

```
backend/
├── main.py                       FastAPI app + CORS + lifespan
├── database.py                   Motor/PyMongo setup
├── routers/
│   ├── projects.py               CRUD /projects/ (MongoDB)
│   ├── registry.py               GET /registry/nodes
│   ├── generate.py               POST /generate/architecture (AI)
│   └── telemetry.py              WS /ws/telemetry/{id} + alert webhook
├── services/
│   └── agentic_remediation.py    30s watchdog → LLM → graph diff proposal
└── emulation/
    ├── engine_v2.py              DAG orchestrator (1s tick loop + EventBus)
    ├── session_manager.py        One engine per project_id
    ├── router.py                 /emulation/* endpoints
    ├── network_manager.py        Docker bridge network lifecycle (Phase 17)
    ├── workspace_manager.py      Host git workspace dirs (Phase 16)
    └── core/
    │   ├── base_resource.py      BaseResource ABC + TTY buffer
    │   ├── lifecycle.py          5-state enum (PENDING→RUNNING→TERMINATED)
    │   ├── event_bus.py          EventBus + EventEnvelope
    │   └── provider_registry.py  ProviderRegistry + ResourceProvider ABC
    └── providers/
        ├── code_repository.py        Simulated git state machine
        ├── compute_container.py      Simulated Docker state machine
        ├── postgres.py               Simulated Postgres state machine
        ├── kubernetes.py             Simulated K8s pod state machine
        ├── redis_cache.py            Simulated Redis KV store (Phase 18)
        ├── object_storage.py         Simulated MinIO/S3 store (Phase 18)
        ├── message_queue.py          Simulated RabbitMQ broker (Phase 19)
        ├── load_balancer.py          Simulated Nginx load balancer (Phase 20)
        ├── monitoring.py             Simulated Prometheus+Grafana (Phase 21)
        ├── metal_code_repository.py  Real git (Phase 16)
        ├── metal_docker_container.py Real Docker SDK (Phase 15/17)
        ├── metal_postgres.py         Real postgres:15-alpine (Phase 17)
        ├── metal_redis.py            Real redis:7-alpine (Phase 18)
        ├── metal_object_storage.py   Real minio/minio (Phase 18)
        ├── metal_message_queue.py    Real rabbitmq:3-management-alpine (Phase 19)
        ├── metal_load_balancer.py    Real nginx:alpine + nginx.conf generation (Phase 20)
        └── metal_monitoring.py       Real prom/prometheus + grafana/grafana (Phase 21)
```

---

## API surface

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/projects/` | Save canvas to MongoDB |
| `GET` | `/projects/` | List saved projects |
| `GET` | `/projects/{id}` | Load a project |
| `GET` | `/registry/nodes` | Node type definitions (toolbar) |
| `POST` | `/generate/architecture` | AI text → canvas JSON |
| `WS` | `/ws/telemetry/{id}` | Live tick stream → Flutter |
| `POST` | `/emulation/{id}/start` | Start simulation/execution |
| `POST` | `/emulation/{id}/stop` | Stop + cleanup |
| `GET` | `/emulation/{id}/snapshot` | HTTP polling fallback |
| `POST` | `/emulation/{id}/terminal` | Send command to a node |
| `POST` | `/emulation/{id}/traffic` | Adjust traffic load slider |
| `POST` | `/emulation/{id}/event` | Inject event (crash, push, etc.) |
| `GET` | `/emulation/providers` | List registered providers + commands |

---

## Execute mode data flow

```
canvas click "Run Pipeline" (Execute)
  │
  ├─► router: create Docker network  simarch-{project_id}
  │
  ├─► Git node (MetalCodeRepositoryResource)
  │     git clone --depth 1   OR   git init + write Dockerfile
  │     → RUNNING → publish "code_pushed" {host_path}
  │
  ├─► Postgres node (MetalPostgresResource)  [parallel with Git]
  │     docker pull postgres:15-alpine
  │     docker run --name simarch-{pid}-{nid} --network simarch-{pid}
  │     → RUNNING → publish "db_ready" {db_url, db_host}
  │
  ├─► Redis node (MetalRedisResource)  [parallel]
  │     docker pull redis:7-alpine
  │     → RUNNING → publish "cache_ready" {redis_url, host, port}
  │
  ├─► MinIO node (MetalObjectStorageResource)  [parallel]
  │     docker pull minio/minio
  │     → RUNNING → publish "storage_ready" {endpoint, access_key, ...}
  │
  ├─► RabbitMQ node (MetalMessageQueueResource)  [parallel]
  │     docker pull rabbitmq:3-management-alpine
  │     → RUNNING → publish "queue_ready" {amqp_url, host, port}
  │
  ├─► Load Balancer (MetalLoadBalancerResource)  [waits for Docker upstreams]
  │     generates nginx.conf from upstream_ids (canvas edges → TO LB)
  │     docker pull nginx:alpine
  │     → RUNNING → publish "lb_ready" {lb_url, host, http_port}
  │
  ├─► Monitoring (MetalMonitoringResource)  [after upstreams RUNNING]
  │     writes prometheus.yml from collected scrape targets
  │     starts prom/prometheus + grafana/grafana containers
  │     → RUNNING → publish "monitoring_ready" {prometheus_url, grafana_url}
  │
  └─► Docker node (MetalDockerResource)  [waits for ALL upstreams]
        receives "code_pushed"     → stores host_path
        receives "db_ready"        → stores DATABASE_URL in self._env
        receives "cache_ready"     → stores REDIS_URL in self._env
        receives "storage_ready"   → stores S3_ENDPOINT+S3_ACCESS_KEY+... in self._env
        receives "queue_ready"     → stores AMQP_URL+RABBITMQ_* in self._env
        receives "lb_ready"        → stores LOAD_BALANCER_URL in self._env
        receives "monitoring_ready"→ stores PROMETHEUS_URL+GRAFANA_URL in self._env
        docker build {host_path}   OR   docker pull {image_tag}
        docker run --network simarch-{pid} -e DATABASE_URL=... -e REDIS_URL=... ...
        → streams live stdout/stderr → tty_burst WebSocket → Flutter terminal

Stop:
  engine.stop() → resource.stop() on all Metal providers (parallel)
  workspace_manager.cleanup_project(project_id)
  network_manager.remove_network(project_id)  → removes all containers + network
```

---

## WebSocket message types

| Type | When | Payload |
|---|---|---|
| `connected` | WS connect | `{project_id}` |
| `emulation_started` | POST /start | `{project_id, node_count, engine_version, execution_mode}` |
| `emulation_stopped` | POST /stop | `{project_id}` |
| `emulation_tick` | Every 1s | `{snapshot: {nodes, active_edges}, events: [...]}` |
| `tty_burst` | After every tick | `{node_id, data: "raw ANSI string"}` |
| `emulation_snapshot` | On WS connect (if running) | same as tick |
| `alert` | Agentic watchdog | `{node_id, status}` |
| `proposal` | After LLM response | `RemediationProposal` graph diff |

---

## Node lifecycle states

```
PENDING  ──►  PROVISIONING  ──►  RUNNING  ──►  TERMINATED
                   │                │
                   └──────────►  DEGRADED
```

Node borders glow in the Flutter UI based on current state:

| State | Border colour | Opacity |
|---|---|---|
| `pending` | none | 55% |
| `provisioning` | amber (1.2s pulse) | 100% |
| `running` | green (1.8s breathe) | 100% |
| `degraded` | red (0.6s fast pulse) | 100% |
| `terminated` | grey | 40% |

---

## Adding a new node type

1. Add enum value to `NodeType` in `lib/models/sim_node.dart`
2. Create a subclass of `SimNode` with `fromProps` / `copyWith` / `properties`
3. Update `_NodeCard._meta()` in `node_widget.dart` for icon/colour
4. Create `backend/emulation/providers/my_type.py` — subclass `BaseResource`
5. Register in `providers/__init__.py` → `provider_registry.register(MyTypeProvider())`
6. For Execute mode: create `MetalMyTypeResource` + register in `router._make_execute_registry()`

---

## Completed build phases

| Phase | Feature |
|---|---|
| 1–3 | Canvas, inspector, undo/redo, DFS simulation engine |
| 4 | IaC export (Docker Compose / Terraform / CLI) |
| 5 | FastAPI backend, MongoDB persistence, AI text-to-architecture |
| 7 | Dynamic node registry from backend |
| 8 | Stateful emulation: 4 node state machines, WebSocket telemetry |
| 9 | Generic provider/resource plugin architecture, EventBus |
| 10 | Flutter V2: lifecycle visuals, dual edge pulse, interactive terminal |
| 11 | DAG execution gate, semantic command parser, commit-hash passing |
| 11B | Full IaC platform UI: inspector metrics, event injection, command history |
| 12 | Structured log levels, per-instance IPs, probabilistic Postgres |
| 13 | TTY burst: raw ANSI progress bars streamed to Flutter |
| 15 | Execute mode toggle, MetalDockerProvider (real Docker SDK) |
| 16 | Real git workspaces, code_pushed → docker build pipeline |
| 17 | Project bridge networks, MetalPostgresProvider, DATABASE_URL injection |
| 18 | Redis + MinIO: in-memory KV + S3-compatible store; Metal containers; env injection |
| 19 | RabbitMQ: in-memory broker; real rabbitmq:3-management-alpine; AMQP_URL injection |
| 20 | Nginx load balancer: round_robin/least_conn/ip_hash; real nginx:alpine + nginx.conf |
| 21 | Prometheus + Grafana monitoring: scrape targets from EventBus; real containers |
