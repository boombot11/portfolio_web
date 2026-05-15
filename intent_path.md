# Intent Classification Path

How a user query travels from raw text to either a structured handler or the semantic LLM.

---

## High-level flow

```
User query
    │
    ▼
routes_query.py  ──  intent classifier called (mode controlled by ENV)
    │
    ├─ INSTANT intent (regex fired, high confidence structured)
    │       └──► route_target = "core"  ──► _execute_structured()  ──► handler returns answer
    │                                                                    (zero LLM for the data)
    │
    └─ non-instant / ambiguous
            │
            ├─ [hybrid / slm mode]  SLM arbitration call
            │       └── SLM returns intent + confidence
            │               ├─ confidence ≥ floor  ──► use SLM result
            │               └─ confidence < floor  ──► fall back to regex result
            │
            └─ [regex mode]  regex result used as-is
                    │
                    ├─ is_structured = True  ──► route_target = "core"  ──► _execute_structured()
                    └─ is_semantic   = True  ──► route_target = "skill" or "core"  ──► LLM answer
```

---

## ENV setting: `INTENT_CLASSIFIER_MODE`

Controls whether the SLM is called for non-instant queries.

| Value | Behaviour |
|-------|-----------|
| `regex` | Pure regex, zero LLM calls for classification (**default** if unset) |
| `hybrid` | Regex fast-path for INSTANT intents; SLM for ambiguous queries; fallback to regex if SLM confidence < `intent_classifier_confidence_threshold` (default 0.60) or SLM fails |
| `slm` | Same as hybrid but accepts any SLM confidence ≥ 0.0; only falls back to regex on parse error or exception |

Online vs offline in `routes_query.py`:
```
_ENTRY_INTENT_CLASSIFIER = IntentClassifier()            # reads INTENT_CLASSIFIER_MODE
_FAST_INTENT_CLASSIFIER  = IntentClassifier(enable_slm=False)  # always regex-only

if _is_offline_mode():
    classified_intent = _FAST_INTENT_CLASSIFIER.classify(...)   # forced regex
else:
    classified_intent = _ENTRY_INTENT_CLASSIFIER.classify(...)  # honours mode setting
```

Related settings:
- `intent_classifier_model` — override which model the SLM call uses (default: `llm_triage_model` → `llm_model`)
- `intent_classifier_timeout_s` — SLM call timeout (default 20 s)
- `intent_classifier_max_tokens` — SLM response cap (default 96)
- `intent_classifier_confidence_threshold` — minimum confidence to accept SLM result in hybrid mode (default 0.60)
- `intent_classifier_failure_cooldown_s` — seconds to skip SLM after a failure (default 90)

---

## Stage 1 — Regex (always runs first)

`IntentClassifier._classify_regex()` evaluates patterns in priority order and returns the **first match**:

| Priority | Intent | Pattern / Rule |
|----------|--------|----------------|
| 0 | `META_LISTING` | "list all documents", "what files do you have" |
| 1 | `EXPORT` | `export`, `download`, `to csv/json`, `as csv/json`, bare `csv`, bare `json` |
| 1b | `EXPORT (filter_unsupported)` | Conditional row-filter phrasing ("records where haircut > 9%") |
| 2 | `COUNT` | "how many", "total records", "count of" — only when no listing signals present |
| 3 | `LIST_PAGE` | Page number + structured row hints ("records on page 3") |
| 4 | `SCHEMA_ENUM` | "schemes under X", "types in Y", "categories within Z" |
| 5 | `LIST_ALL` | "give all records", "show everything", "full table", "dump all rows" |
| 6 | `LIST_PAGINATE` (next) | "next 50" — reads offset from session cursor |
| 7 | `LIST_PAGINATE` (first) | "first 50 records", "top 100 rows" |
| 8 | Semantic override | Semantic verb + filename present → `SUMMARIZE` / `QA_EXPLAIN` (filename kept as filter) |
| 9 | `LOOKUP` | Filename detected, no other signal |
| — | `SUMMARIZE` | Summarize keywords |
| — | `QA_EXPLAIN` | Explain / purpose keywords |
| — | `QA_TOPICAL` | Default fallback |

`INSTANT_INTENTS` = META_LISTING, COUNT, LIST_ALL, LIST_PAGINATE, LIST_PAGE, EXPORT, SCHEMA_ENUM, LOOKUP.
When the regex result is one of these, **`classify()` returns immediately — no SLM call**.

---

## Stage 2 — SLM arbitration (hybrid / slm mode only, non-instant queries)

If regex did not hit an INSTANT intent and SLM is enabled:

```
SLM system prompt:
  "Return only strict JSON: {\"intent\":\"<allowed>\",\"confidence\":<0-1>}"
  "Prefer structured intents only when user explicitly asks records/rows/list/count/export."
  "For summaries/explanations/general questions, prefer semantic intents."

User prompt:
  {"query": "<text>", "allowed_intents": [...all Intent values...]}
```

SLM result is accepted unless:
- confidence < floor (hybrid mode only) → regex result used instead
- SLM returns a structured intent but regex found no structured signals (`_has_structured_request_signals` check) → regex result wins (safety guard against hallucinated structure)
- SLM call fails / times out → failure cooldown starts, regex result used for the remainder of the cooldown window

---

## Stage 3 — Router

`IntentResult.is_structured` drives `route_target`:

```python
if classified_intent.is_structured:
    route_target = "core"         # → _execute_structured() → handler (no LLM for data)
else:
    route_target = "skill" / "core"  # → skill router or core router → LLM answer
```

Inside `route_and_answer()` (router.py), structured path:

```
intent.is_structured
    │
    ├─ source_file missing for EXPORT/LIST_*/LOOKUP/SCHEMA_ENUM
    │       ├─ infer default source  ──► continue
    │       └─ no sources available  ──► _build_no_source_records_response()
    │
    ├─ _execute_structured() returns QueryResponse  ──► return to caller (done)
    │
    ├─ _execute_structured() returns None for hard-structured intents
    │       └──► _build_no_source_records_response()   ← guard prevents LLM fallthrough
    │
    └─ META_LISTING / other structured returning None  ──► continues to Entity Trap
```

Hard-structured intents (EXPORT, LIST_ALL, LIST_PAGE, LIST_PAGINATE, SCHEMA_ENUM, COUNT, LOOKUP) **never reach the semantic LLM** — if the handler returns nothing, the router returns a "no records" message instead of falling through.

---

## What `_execute_structured()` does

Dispatches by intent to a zero-LLM handler:

| Intent | Handler | Data source |
|--------|---------|-------------|
| `COUNT` | `_handle_count` | Row store `.total_count()` |
| `EXPORT` | `_handle_export` | Row store full scan → CSV / JSON |
| `LIST_ALL` | `_handle_list_all` | Row store full scan |
| `LIST_PAGINATE` | `_handle_list_paginate` | Row store paginated fetch |
| `LIST_PAGE` | `_handle_list_page` | Row store by PDF page |
| `SCHEMA_ENUM` | `_handle_schema_enum` | Row store schema index |
| `LOOKUP` | `_handle_lookup` | Row store filtered fetch |
| `META_LISTING` | `_handle_meta_listing` | In-memory file index |

Returns `None` only when the backing store is unavailable or the file is not found.

---

## Summary: your described architecture, mapped to code

> **input → (regex OR SLM, ENV-controlled) → intent + params → handler fires directly OR falls through to SLM + core router**

| Your step | Code |
|-----------|------|
| Input | `normalized_question` in `routes_query.py` |
| Regex selection | `IntentClassifier._classify_regex()` |
| ENV toggle | `INTENT_CLASSIFIER_MODE=regex\|hybrid\|slm` |
| Instant result (handler fires, no LLM) | INSTANT_INTENTS → `is_structured=True` → `_execute_structured()` → handler |
| SLM arbitration for ambiguous | `IntentClassifier._classify_with_slm()` in hybrid/slm mode |
| Core router + LLM for semantic | `is_semantic=True` → skill router → `rag_service.process_query()` → LLM |
