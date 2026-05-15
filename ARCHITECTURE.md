# Architecture: Financial Regulatory RAG System

A hybrid retrieval-augmented generation system for SEBI, NSE, and BSE regulatory documents. Supports strict doc-scoped routing, optional embeddings for Tier 2, and zero-LLM structured querying.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Component Map](#3-component-map)
4. [Storage Layer](#4-storage-layer)
5. [Ingestion Architecture](#5-ingestion-architecture)
6. [Query Architecture](#6-query-architecture)
7. [Key Design Decisions](#7-key-design-decisions)
8. [Data Flow Diagrams](#8-data-flow-diagrams)
9. [Configuration & Thresholds](#9-configuration--thresholds)

---

## 1. System Overview

This system ingests financial regulatory PDFs (SEBI bulletins, NSE/BSE circulars, guidelines) and answers questions about them via a hybrid query engine. The core design principles are:

- **No embeddings for the primary semantic path.** The PageIndex engine navigates hierarchical JSON document trees using Gemini's reasoning, not vector similarity.
- **Structured retrieval stays deterministic.** Counting/listing/export use RowStore/NoSQL directly with no retrieval-time LLM. CLI can optionally run a post-formatting LLM cleanup pass for readability.
- **Document-structure-awareness.** Each PDF's layout (bulletin, notice, framework) determines how it is split, stored, and navigated.
- **Graceful degradation.** Every component has a fallback: vector search falls back to PageIndex, RowStore falls back to NoSQL, hybrid extraction falls back to PyMuPDF, PyMuPDF falls back to PyPDF2.

---

## 2. High-Level Architecture

```
                    ┌────────────────────────────────┐
                    │  PDF Documents / Email Webhook  │
                    │  ./rag_documents/**/*.pdf       │
                    │  POST /fetch-circulars (URLs)   │
                    └──────────────┬─────────────────┘
                                   │
                                   ▼
                    ┌────────────────────────────────┐
                    │       Ingestion Pipeline        │
                    │   (main.py -> pipeline.py)      │
                    │   downloader.py (web scrape)    │
                    └──────────────┬─────────────────┘
                                   │
                       ┌───────────┴───────────┐
              ┌────────▼──┐               ┌────▼────┐
              │  RowStore  │               │PageIndex│
              │  SQLite    │               │JSON ToC │
              │(structured)│               │(semantic│
              │            │               │ path)   │
              └─────┬──────┘               └────┬────┘
                    │                            │
                    └────────────┬───────────────┘
                                 │
                                 ▼
                    ┌────────────────────────────────┐
                    │          Query Router           │
                    │ IntentClassifier (regex/model)  │
                    │   HybridRouter + router_util/   │
                    └──────────────┬─────────────────┘
                                   │
              ┌────────────────────┼────────────────┐
              │                                     │
     ┌────────▼──────┐                   ┌──────────▼──────┐
     │ STRUCTURED     │                   │   SEMANTIC        │
     │ (zero LLM)     │                   │  3-Tier Engine    │
     │                │                   │                   │
     │ - COUNT        │                   │  T1: Cache hit    │
     │ - LIST/EXPORT  │                   │  T2: Vector opt.  │
     │ - LOOKUP       │                   │  T3: PageIndex    │
     └───────┬────────┘                   └────────┬─────────┘
             │                                     │
             └───────────────────┬─────────────────┘
                                 │
                                 ▼
                    ┌───────────────────┐
                    │  QueryResponse    │
                    │  answer           │
                    │  sources          │
                    │  tier_used        │
                    │  agent_steps      │
                    │  confidence       │
                    └───────────────────┘
```

---

## 3. Component Map

```
rag_project/
│
├── main.py                          Entry point; 6 CLI commands
│
├── src/
│   ├── config.py                    Pydantic Settings (singleton via @lru_cache)
│   ├── logger.py                    Rich logger (Windows-safe, file + console)
│   ├── nosql_store.py               JSON fallback document store
│   │
│   ├── ingestion/
│   │   ├── pipeline.py              Orchestrator: discovers, extracts, routes to stores
│   │   ├── pdf_extractor.py         Hybrid PDF extraction (Docling + fitz + OCR)
│   │   ├── toc_builder.py           Builds hierarchical ToC JSON per document
│   │   ├── section_detector.py      Detects section boundaries via regex + fallback
│   │   ├── registry.py              SHA-256 dedup registry (JSON)
│   │   ├── chunker.py               Exchange / doc_type inference utilities
│   │   ├── downloader.py            Web scraper: email URL -> headless Chrome -> PDF save
│   │   └── smart_chunker.py         (legacy — sub-chunker for optional vector embedding)
│   │
│   ├── pageindex/
│   │   └── store.py                 PageIndexStore: read/write ToC JSON documents
│   │
│   ├── storage/
│   │   └── row_store.py             RowStore: SQLite for table rows + identifier index
│   │
│   ├── retrieval/
│   │   ├── engine.py                RAGEngine: Tier 1 (cache) + Tier 2 (PageIndex agent)
│   │   ├── router.py                HybridRouter: intent -> structured or semantic
│   │   ├── intent_classifier.py     Pure regex intent classifier (11 intents)
│   │   ├── llm_client.py            Unified Gemini wrapper (call_gemini, parse_json_response)
│   │   ├── util.py                  PageIndex agent helpers (build_toc_summary, extract_internal_refs)
│   │   ├── cache.py                 ContextCache: pinned facts store for Tier 1 triage
│   │   ├── prompts.py               All Gemini prompt templates
│   │   ├── filter_parser.py         (unused — FilterParser removed; retained for reference)
│   │   ├── bm25_index.py            (legacy — BM25 for optional vector RRF; not active)
│   │   └── router_util/
│   │       ├── extractors.py        extract_global_identifiers(), extract_proper_nouns()
│   │       └── helpers.py           inject_source_filter(), format_records(), wants_count()
│   │
│   ├── vectorstore/                 (optional — only used when ENABLE_EMBEDDINGS=true)
│   │   ├── store.py                 VectorStore: ChromaDB wrapper + RRF
│   │   └── embedder.py              Embedder: FastEmbed / Sentence-Transformers
│   │
│   ├── cache/
│   │   ├── llm_cache.py             LLM answer cache (TTL-based, registry-versioned)
│   │   └── row_cache.py             Row query cache (invalidated on re-ingest)
│   │
│   └── api/
│       ├── app.py                   FastAPI factory (lifespan, CORS, router mount, cache dir pre-creation)
│       ├── routes_*.py              Modular REST endpoints (query/templates/ingest/due-diligence/admin/common)
│       ├── dependencies.py          Context-scoped service wiring via container-backed getters
│       ├── models.py                Pydantic request/response models (incl. EmailIngestRequest)
│       └── pagination.py            Session cursor management
│
└── data/
    ├── toc_store/                   PageIndex: index.json + docs/{sha256}.json
    ├── row_store.db                 SQLite: documents, rows, table_headers, document_identifiers
    ├── nosql_records/               JSON fallback: records/{sha256}.json
    ├── processed/
    │   ├── registry.json            SHA-256 dedup registry
    │   └── context_cache.json       Pinned context facts (Tier 1 cache)
    └── cache/
        ├── llm_cache/               Cached LLM answers (semantic intents)
        └── row_cache/               Cached row pages (structured intents)
```

---

## 4. Storage Layer

The system uses **three independent storage layers**, each serving a different query pattern.

### 4.1 PageIndexStore (`src/pageindex/store.py`)

Primary storage for the semantic path.

**What it stores:** A hierarchical JSON Table of Contents per document, plus the full text of every section node.

**Why JSON, not a database:** Each document's structure is unique. JSON supports arbitrary nesting (chapters > sections > subsections) without a schema migration when document types change.

**Disk layout:**
```
data/toc_store/
  index.json                     # metadata index: {by_sha256, by_file}
  docs/
    abc123def456...json          # one file per document (sha256 named)
    789xyz001...json
```

**Per-document JSON schema:**
```json
{
  "doc_id": "sha256_hex",
  "source_file": "bu240226.pdf",
  "total_pages": 78,
  "layout": "bulletin",
  "exchange": "SEBI",
  "doc_type": "BULLETIN",
  "ingestion_date": "2026-02-28",
  "toc": {
    "node_id": "root",
    "title": "bu240226.pdf",
    "level": 0,
    "pages": [1, 2, ..., 78],
    "children": [
      { "node_id": "p1",  "title": "Page 1",  "level": 1, "pages": [1],  "children": [] },
      { "node_id": "p2",  "title": "Page 2",  "level": 1, "pages": [2],  "children": [] },
      ...
      { "node_id": "n3",  "title": "SECTION 3 ELIGIBILITY CRITERIA", "level": 1, "pages": [5, 6], "children": [] }
    ]
  },
  "text_blocks": {
    "root": "full document text (capped at 100,000 chars)",
    "p1": "Page 1 text (capped at 40,000 chars)",
    "n3": "Section 3 text (capped at 40,000 chars)"
  }
}
```

**Text block caps:**
- `root` node: 100,000 characters (entire document, truncated)
- Per-section/page node: 40,000 characters

**Thread safety:** Index writes are protected by `threading.Lock()`.

---

### 4.2 RowStore (`src/storage/row_store.py`)

Primary storage for the structured path. SQLite with WAL mode.

**What it stores:** Every data row from every table in every PDF, with typed metadata columns pre-extracted at ingestion time.

**Why SQLite:** Enables O(1) COUNT, parameterized WHERE clauses, and sorted paginated retrieval — all without any LLM involvement.

**Schema:**

```sql
-- One row per ingested PDF
CREATE TABLE documents (
    sha256         TEXT PRIMARY KEY,
    source_file    TEXT NOT NULL UNIQUE,
    exchange       TEXT NOT NULL DEFAULT 'OTHER',
    doc_type       TEXT NOT NULL DEFAULT 'OTHER',
    layout         TEXT NOT NULL DEFAULT 'mixed',
    total_pages    INTEGER DEFAULT 0,
    total_rows     INTEGER DEFAULT 0,
    ingestion_date TEXT NOT NULL
);

-- One row per table-data-row in a PDF
CREATE TABLE rows (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sha256         TEXT NOT NULL REFERENCES documents(sha256),
    source_file    TEXT NOT NULL,
    page_number    INTEGER NOT NULL,
    table_index    INTEGER NOT NULL,
    row_index      INTEGER NOT NULL,
    row_data       TEXT NOT NULL,        -- full JSON of original table row
    -- typed columns for fast SQL filtering
    notice_number  TEXT,
    subject        TEXT,
    isin           TEXT,
    scheme_name    TEXT,
    haircut_pct    REAL,
    exchange       TEXT,
    doc_type       TEXT,
    ingestion_date TEXT NOT NULL,
    UNIQUE(sha256, page_number, table_index, row_index)
);

-- Partial indexes for frequent filter patterns
CREATE INDEX idx_rows_haircut ON rows(haircut_pct) WHERE haircut_pct IS NOT NULL;
CREATE INDEX idx_rows_isin    ON rows(isin)        WHERE isin IS NOT NULL;
CREATE INDEX idx_rows_scheme  ON rows(scheme_name) WHERE scheme_name IS NOT NULL;

-- 0-latency identifier -> document lookup
CREATE TABLE document_identifiers (
    source_file TEXT NOT NULL,
    identifier  TEXT NOT NULL,        -- ISIN, circular number, ref code
    UNIQUE(source_file, identifier)
);
CREATE INDEX idx_docident_identifier ON document_identifiers(identifier);
```

**`document_identifiers` explained:** At ingestion, the system scans the first 3 pages of every PDF for global identifiers (ISINs like `INE009A01021`, circular numbers like `NSE/CML/72961`, reference codes). These are indexed by exact match. At query time, if a user mentions one of these, the system resolves `identifier -> source_file` in one SQL lookup (O(log n)) before any semantic routing — this is the "Global Entity Trap."

---

### 4.3 NoSQLStore (`src/nosql_store.py`)

**Fallback only.** JSON-based document store that mirrors RowStore's API. Used when SQLite is unavailable or during legacy migration.

---

## 5. Ingestion Architecture

Two independent paths run per document. Either can fail without affecting the other.

```
PDF
 │
 ├── [STRUCTURED PATH] ──────────────────────────────────────────────────────┐
 │   raw_tables (list[RawTable])                                             │
 │   └── RowStore.upsert_rows()                                              │
 │       ├── _enrich_row() -> typed columns (isin, haircut_pct, scheme_name) │
 │       ├── table_headers storage                                           │
 │       └── document_identifiers storage                                   │
 │                                                                           │
 └── [SEMANTIC PATH] ─────────────────────────────────────────────────────┐  │
     pages (list[PageContent])                                            │  │
     └── build_toc()                                                      │  │
         ├── Layout-based strategy selection                              │  │
         ├── section_detector.detect_sections() (FRAMEWORK/MIXED/NOTICE) │  │
         ├── _build_page_nodes() (BULLETIN/TABLE_ONLY)                   │  │
         ├── Cleanup filters (repetitive headers, tiny sections, etc.)   │  │
         └── PageIndexStore.upsert_doc()                                 │  │
                                                                         │  │
     [OPTIONAL: VECTOR PATH]                                             │  │
     └── smart_chunker.chunk_text_blocks()                               │  │
         └── Embedder.embed()                                            │  │
             └── VectorStore.upsert_nodes()   ───────────────────────────┘  │
                                                                            │
                                              ──────────────────────────────┘
```

### Document Layout Classification

`LayoutDetector.detect()` in `pdf_extractor.py`:

| Layout | Condition | Strategy |
|--------|-----------|----------|
| `NOTICE` | `total_pages <= 3` AND `table_ratio < 0.4` | Section nodes (fallback: page nodes) |
| `BULLETIN` | `total_pages > 5` AND `table_ratio >= 0.6` | Page nodes only |
| `FRAMEWORK` | `total_pages > 10` AND `table_ratio < 0.15` | Section nodes |
| `TABLE_ONLY` | `table_ratio >= 0.85` | Page nodes only |
| `MIXED` | Everything else | Section nodes (fallback: page nodes) |

Where `table_ratio = pages_with_tables / total_pages`.

---

## 6. Query Architecture

### 6.1 Intent Classification (11 Types)

Every query enters `IntentClassifier.classify()`:
- deterministic regex traps run first for structured/meta intents
- optional model-based classification (offline/online) can refine semantic intents

```
STRUCTURED intents (bypass LLM entirely):
  COUNT         -> O(1) from RowStore.count()
  LIST_ALL      -> full row scan, RowStore.get_rows()
  LIST_PAGINATE -> paginated, RowStore.get_rows(limit, offset)
  LIST_PAGE     -> page-filtered, RowStore.get_rows(page_number=N)
  EXPORT        -> batch-fetch all rows, render as Markdown CSV or JSON code block
  LOOKUP        -> source-specific, RowStore.get_rows(source_file)
  SCHEMA_ENUM   -> RowStore.get_distinct_values(column)

SEMANTIC intents (enter 3-tier RAG):
  QA_TOPICAL    -> general factual question
  QA_EXPLAIN    -> explanation / analysis request
  SUMMARIZE     -> summary or overview request
  LOOKUP_DOC    -> find documents about a topic
```

### 6.2 Three-Tier Semantic Engine

`RAGEngine.query()` in `src/retrieval/engine.py` runs three tiers in sequence. In addition, `HybridRouter.execute_query()` provides deterministic pre-routing for strict doc-scoped and multi-doc flows before tier execution.

The `tier_used` field in `QueryResponse` indicates which tier produced the answer:

| tier_used | Name | Condition |
|-----------|------|-----------|
| 0 | Meta scan | Query is about the document corpus itself ("list all docs", "how many files") |
| 1 | Cache hit | Triage LLM answers from pinned facts with confidence >= 0.85 |
| 2 | Vector search | `ENABLE_EMBEDDINGS=true` and vector score >= 0.40 |
| 3 | PageIndex agent | All other semantic queries |
| -1 | Structured | Entity trap or structured intent (no LLM) |

```
User semantic query
       │
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ PRE-FLIGHT: Meta signal detection (tier_used=0)         │
  │  "list all documents", "how many files" etc.            │
  │  -> instant answer from PageIndexStore.stats()          │
  └─────────────────────────────────────────────────────────┘
       │ (not meta)
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ TIER 1: Triage (Context Cache)            tier_used=1   │
  │                                                         │
  │  Check ./data/processed/context_cache.json              │
  │  Gemini: "Can I answer from these pinned facts?"        │
  │                                                         │
  │  YES (confidence >= 0.85) -> return answer              │
  │  NO                       -> proceed to Tier 2          │
  └─────────────────────────────────────────────────────────┘
       │ (miss)
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ TIER 2: Vector Search (ENABLE_EMBEDDINGS=true only)     │
  │                                           tier_used=2   │
  │  Embed query -> BAAI/bge-large-en-v1.5                  │
  │  ChromaDB ANN retrieval (top_k=VECTOR_TOP_K)            │
  │  Hybrid score fusion (vector + BM25 + boosts)          │
  │  Gemini generates answer from chunks                    │
  │                                                         │
  │  top_score >= 0.40 -> return answer                     │
  │  top_score < 0.40  -> escalate to Tier 3               │
  │  ENABLE_EMBEDDINGS=false -> skip entirely               │
  └─────────────────────────────────────────────────────────┘
       │ (miss or disabled)
       ▼
  ┌─────────────────────────────────────────────────────────┐
  │ TIER 3: PageIndex Agent                   tier_used=3   │
  │                                                         │
  │  1. PageIndexStore.get_all_tocs_summary()               │
  │     -> compact ToC tree of ALL documents                │
  │                                                         │
  │  2. Gemini sees ToC summary + query                     │
  │     -> FORMAT 1: read_node (which doc, which node)      │
  │        PageIndexStore.get_node_text() fetches text      │
  │        Auto-follow internal refs ("See Annexure B")     │
  │        Context accumulates                              │
  │     -> FORMAT 2: answer (final response JSON)           │
  │                                                         │
  │  3. Repeat max PAGEINDEX_MAX_ITERATIONS (default: 8)    │
  │     After limit: force answer from accumulated context  │
  └─────────────────────────────────────────────────────────┘
       │
       ▼
  QueryResponse (answer, sources, tier_used, agent_steps, confidence)
```

> **Production note:** With `ENABLE_EMBEDDINGS=false`, queries go Tier 1 -> Tier 3 directly. Tier 2 requires `chromadb` and `fastembed` installed and `ENABLE_EMBEDDINGS=true` in `.env`.

### 6.2a Router-Orchestrated Strict Scope

`HybridRouter.execute_query(query)` now enforces:

- `route_query(query)` output as the first decision point.
- For doc-specific queries (`should_force_scope=True`):
  - scoped retrieval is executed first (`source_file` constrained to detected refs),
  - unscoped retrieval is not attempted before scoped passes,
  - broadened scope is attempted at most once and only on low-confidence/low-coverage conditions.
- For multi-doc scoped queries:
  - per-document scoped retrieval is executed,
  - retries per missing document are attempted once,
  - `partial_coverage=True` and `missing_docs=[...]` are attached when some docs fail.
- Query decomposition layer (`src/retrieval/query_decomposer.py`) runs before orchestration for complex prompts (compare / multi-doc / multi-step), generating sub-queries and merged results.
- `route_and_answer()` now also applies decomposition so CLI and API share the same behavior.

### 6.2b Confidence Calibration

For doc-specific semantic paths:

- Confidence threshold is calibrated at `>= 0.75` before accepting scoped results.
- In multi-doc mode, missing documents apply proportional confidence penalty.

### 6.2c Tier-2 Fusion Outputs

Tier 2 now returns component-aware scores per candidate:

- `vector_score`
- `bm25_score`
- `boost`
- `final_score`

while preserving compatibility fields:

- `score`
- `distance`

### 6.3 Citation Rendering

LLM answers contain inline citations in the format `[filename, p.N]`. These are converted at output time so consumers get clickable links:

| Output path | Conversion | Result |
|-------------|------------|--------|
| CLI (`cmd_query`) | `_answer_to_rich_markup()` in `main.py` | Rich OSC-8 hyperlink `[link=file:///…#page=N](p.N)` opens PDF in system viewer |
| API (`POST /query` etc.) | `_api_linkify_citations()` in `src/api/routes_common.py` | Standard Markdown `[p.N](/api/v1/documents/filename#page=N)` |

Both functions use the same two-regex approach:
1. `_CITE_OUTER_RE` — `\[([^\]]*\.pdf[^\]]*)\]` — grabs any `[…pdf…]` bracket whole.
2. `_SINGLE_CITE_RE` — `([^\[\]\s;,]+\.pdf),\s*p\.\s*([^\];,]+)` — extracts each `(filename, page)` pair inside, supporting compound citations `[f1.pdf, p.1; f2.pdf, p.3]`.

The API citation links point to `GET /api/v1/documents/{filename:path}`, which serves the PDF with `Content-Disposition: inline` so browsers open their built-in PDF viewer at the cited page (via the `#page=N` URL fragment handled client-side). Citation paths preserve relative source paths (for example `_uploads/<session_id>/...`) and still retain legacy filename fallback behavior.

---

### 6.4 Global Entity Trap (Post-Classification Scanner)

After `IntentClassifier.classify()` runs (Step 0), the router scans the query for financial identifiers:
- ISINs: `INE[A-Z0-9]{9}` pattern
- Circular numbers: `EXCHANGE/DEPT/NUMBER` pattern
- Reference codes: extracted from `Ref No.` / `Circular No.` patterns

If found, `RowStore.global_entity_search(identifier, restrict_to=intent.source_file)` runs:
1. Exact match on `document_identifiers.identifier` (indexed, O(log n))
2. LIKE match fallback
3. Raw row_data text scan fallback

The function returns `list[str]` of **all** matching source files (not just the first):
- **Single match:** inject as `{"source_file": "filename.pdf"}` filter
- **Multiple matches:** inject as `{"source_file": {"$in": ["a.pdf", "b.pdf"]}}` filter — the engine's `_extract_source_files_from_filter()` unpacks this for both the PageIndex ToC loader and the optional ChromaDB Tier 2 path

**State-guard (Fix 1):** If the classifier already extracted an explicit `source_file` from the query text, that value is passed as `restrict_to`. The entity search is then confined to that specific file — it can never widen scope to unrelated documents the user didn't ask about.

**Multi-document scope (Fix 2):** When an identifier appears in multiple documents (e.g., an ISIN referenced across several circulars), all matching files are returned and passed together as a `$in` filter. The structured path iterates each resolved file; the semantic path passes the `$in` filter to `_load_toc_docs()` which loads each resolved document's ToC individually and returns them all as a merged list.

**Engine-side `$in` support:** `_extract_source_files_from_filter()` is the canonical filter parser — it returns `list[str]` (0, 1, or many files). `_load_toc_docs()` iterates the list and loads each file's ToC from the PageIndex store. The old `_extract_source_file_from_filter()` (singular) is retained as a thin wrapper that returns `None` for `$in` filters, for call-sites that are inherently single-file.

---

### 6.5 Online/Offline Mode Isolation

Runtime mode behavior is now centralized under `src/retrieval/modes/`:

- `contracts.py`
  - Defines internal mode interfaces and typed decision payloads:
    - `ModeStrategy`
    - `ModeToggles`
    - `ModeBudgets`
    - `LLMProvider`
- `factory.py`
  - Single mode selector (`build_mode_strategy(settings)`) from `AI_MODE`.
- `online.py`
  - Owns online-specific gates and budgets (decomposition, triage/rewrite, online token/time caps).
- `offline.py`
  - Owns offline-specific gates and budgets (triage/rewrite skip, model-aware SLM prompt selection, 8GB/16GB budgets, single-shot gating).

### What stays shared

- Tier orchestration flow (Tier 1 -> Tier 2 -> Tier 3) in `src/retrieval/engine.py`.
- Retrieval, citation filtering, and response assembly behavior.
- API request/response contracts and env variable names.

### Provider split

`src/retrieval/llm_client.py` now routes through explicit provider types:

- `OnlineLLMProvider` (Gemini path)
- `OfflineLLMProvider` (local OpenAI-compatible path)
- `local_model_adapter.py` adds model-aware local message formatting (OpenAI-style vs Phi-style templates) and compact-prompt preference hints used by offline mode strategy.

`create_ai_service()` remains backward-compatible but now composes provider + mode strategy internally.

### 6.6 Offline Vector-Only Constraints (Phase 2)

When `AI_MODE=offline`, semantic retrieval is constrained to local vector-index context:

- Tier 2 uses local vector retrieval only for semantic context gathering.
- Tier 2 semantic augmentations from PageIndex keyword search / ToC injection / RowStore SQL handoff are disabled.
- Tier 3 PageIndex semantic fallback is disabled for offline semantic queries.
- Broad corpus survey bypass to PageIndex is disabled in offline semantic flow.
- Proper-noun semantic fallback expansions that rely on RowStore are disabled in offline semantic flow.

This makes offline behavior deterministic and prevents online/offline debugging ambiguity.

---

## 7. Key Design Decisions

### Decision 1: No Embeddings on the Primary Semantic Path

**Traditional RAG** embeds chunks into vector space and retrieves by cosine similarity. This system's primary semantic path skips embeddings entirely.

**Why:** Financial regulatory documents have strong hierarchical structure. A circular has sections like "Background", "Objective", "Requirements", "Effective Date". An agent that navigates this tree by reasoning is more accurate than one that matches a query to a flattened chunk — because the agent can:
- Start at the root, see the full structure
- Decide "the answer is in the Requirements section, node n4"
- Read exactly that section
- Follow internal references ("See Annexure B") automatically

ChromaDB vector search exists as an **optional gate** (set `ENABLE_EMBEDDINGS=true`) but is disabled in production. The PageIndex agent is the sole retrieval mechanism after a Tier 1 cache miss.

### Decision 2: Two Independent Ingestion Paths

Tables and prose have completely different optimal representations:
- **Tables** → SQL: enables `WHERE haircut_pct >= 9.0`, `COUNT(*)`, `ORDER BY scheme_name`
- **Prose + structure** → JSON ToC: enables section-aware agent navigation

Running both paths independently means a RowStore failure doesn't corrupt the PageIndex and vice versa.

### Decision 3: Pure Regex Intent Classification

Intent is classified by `IntentClassifier` with regex-first guardrails and optional model-based refinement.
Structured/meta intents are trapped deterministically before model classification.

**Why not LLM for routing?** A user asking "how many records" should never spend 500ms and 1000 tokens to get an answer that SQLite returns in 1ms. LLM routing would be slower, more expensive, and non-deterministic.

**The decision tree** (evaluated in order):
1. EXPORT (export/download/csv/json keyword detected → full dump as CSV or JSON)
2. EXPORT with warning (filter-like comparison operators detected → graceful "not supported" response)
3. COUNT (count words, no listing signals)
4. LIST_PAGE (page number + listing signals)
5. SCHEMA_ENUM (schemes/types under X)
6. LIST_ALL (all records)
7. NEXT_PAGE (continuation cursor)
8. LIST_PAGINATE (first/top N)
9. Semantic override (semantic verb + filename = semantic intent)
10. LOOKUP (filename detected, no other signals)
11. Semantic branch (SUMMARIZE / QA_EXPLAIN / QA_TOPICAL)

### Decision 4: SHA-256 Content-Based Deduplication

The registry keys on file content hash, not filename. This means:
- Renaming a file doesn't trigger re-ingestion
- Modifying a file content does trigger re-ingestion (different hash)
- Moving a file between directories doesn't trigger re-ingestion

### Decision 5: Physical Page Anchors in Text Blocks

Every page's text is prefixed with `--- [PHYSICAL PAGE N] ---` before storage in `text_blocks`. This means the PageIndex agent (Tier 3) can always tell which physical page a piece of information came from, enabling accurate `[filename, p.N]` citations in answers.

### Decision 6: Context Cache as Tier 1

A persistent JSON file (`context_cache.json`) holds the top 25 most representative facts across all documents. After every ingestion, Gemini samples random text blocks and extracts key facts. At query time, these facts are handed to a fast triage call — if the answer is in cache, it's returned instantly with zero document reads.

This is especially effective for recurring questions: "What is the margin requirement for X?" asked 100 times hits the cache 99 times after the first answer.

### Decision 8: Router Modularization

The `HybridRouter` (formerly a single large `router.py`) was split into a package with a `router_util/` subdirectory:

- **`router_util/extractors.py`** — regex-based entity and proper-noun extraction. `extract_global_identifiers()` finds ISINs, circular codes, year/slash references with word-boundary guards and digit-presence validation to prevent false positives. `extract_proper_nouns()` extracts multi-word and single-word capitalized names, filtered against a stop-word set.
- **`router_util/helpers.py`** — query helpers: `inject_source_filter()` / `inject_source_files_filter()` for safe `$and` filter merging, `format_records()` for human-readable row display, `rows_to_csv_answer()` for Markdown CSV export, `wants_count()` for count-augmentation detection.

This keeps `router.py` focused on routing logic while keeping extraction and formatting reusable and independently testable.

### Decision 9: Email Webhook for Automated PDF Ingestion

`POST /api/v1/fetch-circulars` accepts raw email text (paste of a forwarded exchange circular email) and:
1. Parses URLs out of the email body via regex
2. For each URL: headless Chrome (Selenium) downloads the PDF, handling:
   - Direct `.pdf` URLs via `requests` with cookie carryover
   - HTML wrapper pages with embedded PDF viewers (iframes, PDF.js)
   - Non-PDF pages saved via Chrome's print-to-PDF
3. Saved PDFs are dropped into `DOCUMENTS_DIR` and the ingestion pipeline runs in a `BackgroundTasks` coroutine
4. Endpoint returns HTTP 202 immediately while processing continues

This enables automated ingestion from exchange email digests without manual file drops.

### Decision 7: EXPORT Instead of Natural-Language SQL Filtering

The previous architecture had a `FilterParser` that converted natural-language filter expressions (e.g. `"haircut >= 9%"`) into parameterized SQL. This was removed because:
- Coverage was incomplete: only a fixed set of typed columns were supported
- False positives: many queries were misrouted as FILTER when they were actually semantic questions
- User confusion: failure mode was a silent empty result or a cryptic SQL error

**Replacement:** `Intent.EXPORT` dumps all rows from a document as a Markdown-fenced CSV or JSON block (fetched in batches of 500 rows). Users can then filter, sort, or pivot the data in Excel, Python, or any spreadsheet tool.

**Filter-like query handling:** Queries that look like filters (e.g. `"records where haircut >= 9%"`) are caught by `_PAT_FILTER_WARN` and routed to `Intent.EXPORT` with `filter_expr="filter_unsupported"`. The router returns a friendly message explaining the limitation and showing how to export or paginate instead.

The LLM is **never** allowed to generate raw SQL. All SQLite access uses parameterized queries with hardcoded column names.

---

## 8. Data Flow Diagrams

### Ingestion Flow

```
./rag_documents/**/*.pdf
    |
    v
pipeline._discover_files()
    |
    v
for each PDF:
    |
    +-- _compute_sha256(file_path)
    |       |
    |       +-- Registry.is_processed(sha256)? -> SKIP if yes
    |
    +-- pdf_extractor.extract_pdf(file_path)
    |       |
    |       +-- _extract_hybrid()
    |       |     Docling: extract table objects
    |       |     fitz: extract prose (avoiding table bboxes)
    |       |     tesseract: OCR if < 150 chars of prose
    |       |     -> list[PageContent], list[RawTable]
    |       |
    |       +-- LayoutDetector.detect() -> DocumentLayout
    |       |
    |       +-- _extract_global_identifiers_from_text(preamble)
    |             -> list[str] (ISINs, circular numbers, ref codes)
    |
    +-- chunker._infer_exchange(), _infer_doc_type()
    |
    +-- [STRUCTURED PATH]
    |   RowStore.upsert_rows(sha256, raw_tables, exchange, doc_type, global_identifiers)
    |       for each RawTable:
    |           _enrich_row() -> typed columns
    |           INSERT INTO rows
    |       INSERT INTO document_identifiers (per identifier)
    |
    +-- [SEMANTIC PATH]
    |   toc_builder.build_toc(doc, exchange, doc_type)
    |       per-page text with PHYSICAL PAGE anchors
    |       if BULLETIN/TABLE_ONLY -> _build_page_nodes()
    |       else -> _build_section_nodes()
    |                   detect_sections() -> list[Section]
    |                   cleanup filters (tiny, repetitive, numeric, long)
    |                   fallback to page nodes if < 2 sections
    |       always add root node (full text, 100k cap)
    |   PageIndexStore.upsert_doc(sha256, toc_json)
    |
    +-- [VECTOR PATH (optional, ENABLE_EMBEDDINGS=true)]
    |   smart_chunker.chunk_text_blocks(text_blocks)
    |   for each chunk: Embedder.embed() -> vector
    |   VectorStore.upsert_nodes(nodes, vectors)
    |
    +-- Registry.mark_processed(sha256, filename, ...)

Post-loop:
RAGEngine.refresh_cache()
    PageIndexStore.sample_text_blocks(n=25)
    Gemini extracts key facts
    -> ./data/processed/context_cache.json
```

### Query Flow

```
User query string
    |
    v
IntentClassifier.classify(query)
    |
    +--> STRUCTURED intent?
    |       |
    |       +-- IntentClassifier.classify() (Step 0 — before entity trap)
    |       |
    |       +-- Global Entity Trap (Step 1 — post-classification)
    |       |     RowStore.global_entity_search(identifier, restrict_to=intent.source_file)
    |       |     -> list[str] of matching source files
    |       |     single file  -> inject {"source_file": "file.pdf"} filter
    |       |     multi files  -> inject {"source_file": {"$in": [...]}} filter
    |       |
    |       +-- COUNT  -> RowStore.count(source_file) -> int
    |       |
    |       +-- LIST_PAGINATE -> RowCache.get()?
    |       |                       miss -> RowStore.get_rows(limit, offset)
    |       |                       -> RowPage, save cursor
    |       |
    |       +-- EXPORT (csv/json) -> batch-fetch all rows (_ALL_BATCH_SIZE=500)
    |       |                         -> Markdown-fenced CSV or JSON code block
    |       |
    |       +-- EXPORT (filter_unsupported) -> graceful "not supported" message
    |       |                                   with pagination / export instructions
    |       |
    |       +-- LOOKUP -> RowStore.get_rows(source_file)
    |       |
    |       +-- [other structured intents...]
    |
    +--> SEMANTIC intent?
            |
            +-- LLMCache.get(query, filters)?
            |       hit -> return cached answer
            |       miss -> continue
            |
            +-- RAGEngine.query(question, filters)
                    |
                    +-- [TIER 1] ContextCache.facts (tier_used=1)
                    |     Gemini triage: "can I answer from cache?"
                    |     YES (>= 0.85) -> return answer (0 doc reads)
                    |     NO -> Tier 2 or Tier 3
                    |
                    +-- [TIER 2] Vector Search (tier_used=2, ENABLE_EMBEDDINGS=true only)
                    |     Embedder.embed(query) -> query vector
                    |     VectorStore.search(vector, top_k=VECTOR_TOP_K)
                    |     BM25 RRF re-rank
                    |     Gemini generate from chunks
                    |     top_score >= 0.40 -> return answer
                    |     top_score < 0.40  -> fall through to Tier 3
                    |
                    +-- [TIER 3] PageIndex Agent (tier_used=3)
                          _run_pageindex_agent(question, original_question, filters)
                          PageIndexStore.get_all_tocs_summary()
                          context = []
                          for i in range(PAGEINDEX_MAX_ITERATIONS):
                              Gemini(PAGEINDEX_NAVIGATOR prompt + toc + context + query)
                              -> FORMAT 1: {action: read_node, source, node_id}
                                  text = PageIndexStore.get_node_text(source, node_id)
                                  context.append(text)
                                  scan for internal refs -> auto-queue
                              -> FORMAT 2: {action: answer, answer, confidence, sources}
                                  return QueryResponse
                          # After max iterations:
                          Gemini(GENERATION_SYSTEM + accumulated context)
                          -> forced final answer

            LLMCache.set(query, answer)
            -> QueryResponse
```

### Skill-Routed Query Flow (Current API Layer)

`POST /query` now follows a skill-based execution pipeline in the API/service layer:

1. **User Input** (`query/question`, `workspace_id/workspace`, `session_id`)
2. **Skill Router** (slash command parser: `/summarize`, `/compare`, `/get_records`, default `query`)
3. **Retrieval Factory** (intent-specific context strategy)
4. **SLM Skill Executor** (registry-driven prompt + decoding params)
5. **QueryResponse**

Skill behaviors:

- `query`: standard semantic top-k retrieval.
- `summarize`: wider/evenly distributed context; prefers summary-tagged chunks when available.
- `compare`: extracts target documents and enforces balanced per-document retrieval.
- `get_records`: routes to existing tabular CSV/Excel pipeline (`pandasai` path), bypassing semantic retrieval.

Design note:

- New skills are added through registry entries (`intent + prompt + retrieval mapping`) with no route-handler branching growth.
- Frontend can discover the active registry via `GET /api/v1/skills`.

---

## 9. Configuration & Thresholds

### Critical Thresholds

| Threshold | Variable | Default | Effect |
|-----------|----------|---------|--------|
| Tier 1 confidence gate | `AGENT_CONFIDENCE_THRESHOLD` | 0.85 | Cache answer returned if Gemini confidence >= this |
| Tier 2 confidence gate | `VECTOR_CONFIDENCE_THRESHOLD` | 0.45 | Vector answer returned if >= this; else Tier 3 |
| Tier 3 loop limit | `PAGEINDEX_MAX_ITERATIONS` | 8 | Max agent steps; then forced answer |
| Standard LLM output cap | `LLM_MAX_TOKENS` | 2048 | Max tokens for per-query answers |
| Corpus survey output cap | `LLM_SURVEY_MAX_TOKENS` | 8192 | Higher cap for 82-doc synthesis calls — prevents mid-sentence truncation |
| Root node text cap | hardcoded | 100,000 chars | Prevents enormous JSON blobs |
| Section node text cap | hardcoded | 40,000 chars | Generous for long regulatory sections |
| OCR threshold | hardcoded | 150 chars | Below this, page is treated as scanned |
| Section min size | `min_section_tokens` | 50 tokens | Sections smaller than this merge with previous |

### Intent Confidence Values

| Intent | Confidence | Meaning |
|--------|-----------|---------|
| COUNT | 0.95 | Extremely high — unambiguous pattern |
| EXPORT (csv/json) | 0.95 | Very high — explicit export/download/csv/json keyword |
| EXPORT (filter_unsupported) | 0.90 | High — filter-like comparison operators detected; returns graceful warning |
| LIST_PAGE | 0.92 | Very high — page number + list context |
| LIST_PAGINATE | 0.90 | High — "first N" pattern |
| LIST_ALL | 0.90 | High — "all records" pattern |
| LOOKUP (with semantic verb) | 0.92 | Bumped when filename + semantic verb both present |
| LOOKUP | 0.85 | Filename detected, no other signals |
| SCHEMA_ENUM | 0.82 | "schemes under X" pattern |
| SUMMARIZE | 0.85 | Summarize keyword detected |
| QA_EXPLAIN | 0.85 | Explain/describe keyword detected |
| QA_TOPICAL | 0.70 | Default fallback for semantic queries |

Intents with confidence >= 0.90 are hard-routed (structured path is not reconsidered even on empty result unless explicitly configured). Intents with 0.70-0.89 may soft-fallback to semantic if RowStore returns 0 rows.

---

*Last updated: 2026-04-18*
