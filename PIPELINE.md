# Pipeline Deep Dive

This document traces every byte of data from a raw PDF on disk to a stored node in PageIndex, and from a typed query string to a final answer. Every function, every file, every design choice is explained.

---

## Table of Contents

**Part 1 — Ingestion Pipeline**

1. [File Discovery](#1-file-discovery)
2. [SHA-256 Hashing & Dedup Registry](#2-sha-256-hashing--dedup-registry)
3. [PDF Extraction — Hybrid Strategy](#3-pdf-extraction--hybrid-strategy)
   - 3a. [Table Extraction (pdfplumber)](#3a-table-extraction-pdfplumber)
   - 3b. [Prose Extraction (PyMuPDF / fitz)](#3b-prose-extraction-pymupdf--fitz)
   - 3c. [OCR Fallback (Tesseract)](#3c-ocr-fallback-tesseract)
   - 3d. [Continuation Row Merging](#3d-continuation-row-merging)
   - 3e. [Preamble Table Filter](#3e-preamble-table-filter)
   - 3f. [Layout Detection](#3f-layout-detection)
   - 3g. [Global Identifier Extraction](#3g-global-identifier-extraction)
4. [Structured Path — RowStore](#4-structured-path--rowstore)
   - 4a. [Row Enrichment (Typed Columns)](#4a-row-enrichment-typed-columns)
   - 4b. [Document Identifiers Table](#4b-document-identifiers-table)
5. [Semantic Path — PageIndex ToC Builder](#5-semantic-path--pageindex-toc-builder)
   - 5a. [Physical Page Anchors](#5a-physical-page-anchors)
   - 5b. [Layout-Based Strategy Selection](#5b-layout-based-strategy-selection)
   - 5c. [Section Detection](#5c-section-detection)
   - 5d. [Section Cleanup Filters](#5d-section-cleanup-filters)
   - 5e. [Page Nodes (Fallback)](#5e-page-nodes-fallback)
   - 5f. [Root Node](#5f-root-node)
   - 5g. [Text Block Storage](#5g-text-block-storage)
6. [Email Webhook Ingestion — downloader.py](#6-email-webhook-ingestion--downloaderpy)
7. [Context Cache Refresh](#7-context-cache-refresh)

**Part 2 — Query Pipeline**

8. [Entry Points](#8-entry-points)
9. [Intent Classification — 9-Step Decision Tree](#9-intent-classification--9-step-decision-tree)
10. [Global Entity Trap (Pre-Flight Scanner)](#10-global-entity-trap-pre-flight-scanner)
11. [Structured Path — Zero LLM Queries](#11-structured-path--zero-llm-queries)
    - 11a. [COUNT](#11a-count)
    - 11b. [LIST_PAGINATE / LIST_ALL / LIST_PAGE](#11b-list_paginate--list_all--list_page)
    - 11c. [EXPORT](#11c-export)
    - 11d. [LOOKUP](#11d-lookup)
    - 11e. [SCHEMA_ENUM](#11e-schema_enum)
12. [Semantic Path — 3-Tier RAG Engine](#12-semantic-path--3-tier-rag-engine)
    - 12a. [LLM Cache Check](#12a-llm-cache-check)
    - 12b. [Tier 1: Triage (Context Cache)](#12b-tier-1-triage-context-cache)
    - 12c. [Tier 2: Vector Search (Optional)](#12c-tier-2-vector-search-optional)
    - 12d. [Tier 3: PageIndex Agent Loop](#12d-tier-3-pageindex-agent-loop)
    - 12e. [Internal Reference Auto-Following](#12e-internal-reference-auto-following)
    - 12f. [Forced Final Answer](#12f-forced-final-answer)
13. [Response Assembly](#13-response-assembly)
14. [LLM Cache Write](#14-llm-cache-write)
15. [Known Bugs & Fixes (2026-03-06)](#15-known-bugs--fixes-2026-03-06)
16. [Quality & API Fixes (2026-03-07)](#16-quality--api-fixes-2026-03-07)
17. [Router Modularization & Email Ingestion (2026-03-08)](#17-router-modularization--email-ingestion-2026-03-08)

---

# Part 1 — Ingestion Pipeline

---

## 1. File Discovery

**File:** `src/ingestion/pipeline.py`
**Function:** `_discover_files(documents_dir: Path) -> list[Path]`

The function walks `DOCUMENTS_DIR` recursively and collects all `.pdf` files, sorted alphabetically for deterministic processing order across runs.

```python
def _discover_files(documents_dir: Path) -> list[Path]:
    return sorted(documents_dir.rglob("*.pdf"))
```

`rglob("*.pdf")` is case-sensitive on Linux (will miss `.PDF`). On Windows this is handled by the filesystem.

**Called by:** `run_ingestion()`, the main ingestion loop in `pipeline.py`.

---

## 2. SHA-256 Hashing & Dedup Registry

**File:** `src/ingestion/pdf_extractor.py`
**Function:** `_compute_sha256(file_path: Path) -> str`

```python
def _compute_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
```

Reads in 64 KB chunks to avoid loading large PDFs into memory. Returns a 64-character hex string.

**Why content hash, not filename hash:** If a file is renamed or moved, the SHA-256 is unchanged, so it won't be re-ingested. If the file content changes (even by one byte), the hash changes and re-ingestion is triggered.

**Registry check — File:** `src/ingestion/registry.py`
**Class:** `ProcessedRegistry`
**Method:** `is_processed(sha256: str) -> bool`

```python
def is_processed(self, sha256: str) -> bool:
    return sha256 in self._registry
```

The registry is a JSON file at `PROCESSED_REGISTRY` (default: `./data/processed/registry.json`). It is loaded into memory at startup and updated after every successful ingestion.

Registry entry format:
```json
{
  "sha256hex": {
    "filename": "bu240226.pdf",
    "chunk_count": 79,
    "ingestion_date": "2026-02-28T10:30:45.123Z",
    "exchange": "SEBI",
    "doc_type": "BULLETIN",
    "layout": "bulletin",
    "total_pages": 78,
    "row_count": 1240
  }
}
```

Failed ingestions are recorded separately with key `"FAILED::sha256hex"` so they can be diagnosed without re-attempting them on every run.

---

## 3. PDF Extraction — Hybrid Strategy

**File:** `src/ingestion/pdf_extractor.py`
**Entry function:** `extract_pdf(file_path: Path) -> ExtractedDocument`

The extraction strategy uses three libraries in a coordinated pipeline:

```
pdfplumber  -> finds table bounding boxes, extracts structured table data
fitz        -> extracts prose text (text blocks NOT inside table bboxes)
tesseract   -> OCR fallback for pages with < 150 chars of embedded text
```

**Why three libraries?** No single library does all three well:
- pdfplumber has the best table detection using line strategies
- PyMuPDF (fitz) has the most robust prose extraction with block-level coordinates
- Neither handles scanned pages — Tesseract fills that gap

**Fallback chain:**
1. `_extract_hybrid()` (pdfplumber + fitz + optional OCR)
2. If hybrid fails: `_extract_with_pymupdf()` (fitz only)
3. If both fail: `ExtractedDocument(error=...)` returned, file marked `FAILED::` in registry

---

### 3a. Table Extraction (pdfplumber)

**File:** `src/ingestion/pdf_extractor.py`
**Called inside:** `_extract_hybrid()`

For each page, pdfplumber attempts to find tables using two strategies:

**Strategy 1 — Line-based (primary):**
```python
_TABLE_SETTINGS_PRIMARY = {
    "vertical_strategy":   "lines",
    "horizontal_strategy": "lines",
    "intersection_y_tolerance": 5
}
found_tables = plum_page.find_tables(_TABLE_SETTINGS_PRIMARY)
```
Works on tables with visible grid lines (most financial regulatory tables).

**Strategy 2 — Text-based (fallback):**
```python
_TABLE_SETTINGS_WHITESPACE = {
    "vertical_strategy":   "text",
    "horizontal_strategy": "text",
    "intersection_y_tolerance": 5
}
```
Used only if primary strategy yields zero usable tables (tables with no visible borders, aligned purely by whitespace).

**Usability filter:** A table is "usable" only if it has more than 1 row (otherwise it's just a header row or a lone cell).

For each usable table:
1. Extract raw cell data via `table.extract()`
2. Run `_is_preamble_table()` — skip if this is letterhead/metadata
3. If whitespace strategy: run `_is_oversized_whitespace_table()` — skip tables that cover 80%+ of the page (false positive: page-spanning whitespace alignment)
4. Save bounding box `table.bbox` to `valid_bboxes`
5. Build `RawTable(page_number, table_index, headers, rows)`

**Header inference:** If all column names in extracted row 0 start with `Column_N` (pdfplumber couldn't detect headers), the system checks if row 1 looks like real headers (non-empty, non-numeric). If so, row 1 is promoted to headers and extraction starts from row 2.

---

### 3b. Prose Extraction (PyMuPDF / fitz)

**File:** `src/ingestion/pdf_extractor.py`
**Called inside:** `_extract_hybrid()`

After pdfplumber identifies table bounding boxes, fitz extracts prose by reading all text blocks and **filtering out blocks whose center falls inside a table bbox**:

```python
blocks = fitz_page.get_text("blocks") or []
for b in blocks:
    if b[6] == 0:  # type 0 = text block (type 1 = image)
        bx0, by0, bx1, by1 = b[:4]
        cx = (bx0 + bx1) / 2
        cy = (by0 + by1) / 2
        in_table = any(
            tx0 <= cx <= tx1 and ttop <= cy <= tbottom
            for tx0, ttop, tx1, tbottom in valid_bboxes
        )
        if not in_table:
            prose_clean += b[4] + "\n"
```

**Why center-point check, not overlap check?** A text block may partially overlap a table bbox (e.g., a table caption). Center-point is a simpler heuristic that avoids removing captions while still excluding table cells.

**Why fitz for prose, not pdfplumber?** fitz's block-level API gives coordinates per text block, making bbox filtering possible. pdfplumber's text extraction doesn't easily expose block-level bounding boxes for filtering.

**Result:** `prose_clean` — raw prose text with table content removed. This is stored as `PageContent.prose_only_text`.

The `PageContent.text` field contains both prose AND table cell text (table cells were added as pipe-delimited text via `page_text_parts.append(...)` in the table loop). This dual storage is intentional:
- `prose_only_text` → used for embedding (cleaner signal)
- `text` (full) → used for PageIndex ToC (table values preserved)

---

### 3c. OCR Fallback (Tesseract)

**File:** `src/ingestion/pdf_extractor.py`
**Trigger condition:** `extracted_prose_chars < 150`

```python
if extracted_prose_chars < 150 and _HAS_OCR:
    pix = fitz_page.get_pixmap(dpi=150)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    ocr_text = pytesseract.image_to_string(img)
    ocr_clean = _clean_text(ocr_text)
    if len(ocr_clean) > len(prose_clean):
        prose_clean = ocr_clean
```

**Why 150 chars threshold?** A typical page of financial regulatory text has 1,000-5,000 characters. Under 150 strongly suggests the page has no embedded text layer (scanned image). The threshold is conservative enough to not trigger on pages that are mostly tables (where prose is legitimately short).

**Why 150 DPI?** Tesseract accuracy peaks around 200-300 DPI for document text. 150 DPI is chosen as a balance between OCR quality and speed — higher DPI creates larger pixel maps and slower OCR.

**Replacement logic:** OCR text replaces fitz prose only if OCR yields more characters. This prevents OCR noise from overwriting genuinely extracted text.

`_HAS_OCR` is set at module import time by checking if `pytesseract` and `PIL` are importable. If not installed, the OCR branch is silently skipped.

---

### 3d. Continuation Row Merging

**File:** `src/ingestion/pdf_extractor.py`
**Function:** `_merge_continuation_rows(rows, headers) -> list[dict]`

Many financial tables have wrapped cell content split across multiple rows by the PDF renderer:

```
| Scheme Name          | ISIN        | Haircut |
| SBI Mutual Fund      | INE009A0102 | 7.5%    |
|   Growth - Regular   |             |         |  <-- continuation
|   Plan               |             |         |  <-- continuation
```

The merger identifies a "continuation row" by checking:
1. Non-empty cells <= 40% of total column count (most cells are blank)
2. AND the text looks like a continuation: starts lowercase, starts with `&`, `(`, `-`, `+`, `/`, or short digit sequence, or starts with `"of "` or `"and "`

If both conditions met, the continuation row's values are appended to the parent row's matching columns:
- If parent ends with a letter and child starts lowercase: concatenate directly (no space)
- Otherwise: append with a space

This prevents scheme names and addresses from being split across rows in the stored data.

---

### 3e. Preamble Table Filter

**File:** `src/ingestion/pdf_extractor.py`
**Function:** `_is_preamble_table(extracted: list[list]) -> bool`

Financial regulatory PDFs always start with a header block (letterhead) that looks like a table to pdfplumber but isn't:

```
To:     | NSE Members
From:   | NSE Limited
Date:   | February 24, 2026
Ref:    | CML/72972
```

This function detects and rejects these preamble "tables" using three heuristics:

**H1 — Single column:** If the table has only 1 column, it's not a real table.

**H2 — All colon keys:** If a 2-column table has ALL first-column values ending with `:`, it's a key-value metadata block.
```python
if all(v.endswith(':') for v in first_col) and len(first_col) >= 2:
    return True
```

**H3 — Letterhead keyword density:** Check what fraction of first-column values match letterhead keywords (`to`, `from`, `date`, `ref`, `subject`, `no.`, `circular`, `notice`, `through`, `attention`, `dear`, `regards`, `copy`, `enclosure`, and corporate titles like `general manager`, `director`). If >= 75% match, it's preamble.

This filter only applies to 1-2 column tables — wider tables (3+ columns) with actual data are never rejected.

---

### 3f. Layout Detection

**File:** `src/ingestion/pdf_extractor.py`
**Class:** `LayoutDetector`
**Method:** `detect(total_pages, pages) -> DocumentLayout`

```python
table_pages = sum(1 for p in pages if p.has_tables)
table_ratio = table_pages / max(total_pages, 1)

if total_pages <= 3 and table_ratio < 0.4:    -> NOTICE
if total_pages > 5 and table_ratio >= 0.6:    -> BULLETIN
if total_pages > 10 and table_ratio < 0.15:   -> FRAMEWORK
if table_ratio >= 0.85:                        -> TABLE_ONLY
else:                                          -> MIXED
```

**NOTICE:** Short documents (1-3 pages) with mostly prose. Examples: individual circulars, notices. Strategy: attempt section detection, fallback to page nodes.

**BULLETIN:** Long data-heavy documents with tables on most pages. Examples: SEBI weekly bulletins with hundreds of scheme entries. Strategy: page-level nodes (section detection is unreliable on table-heavy pages).

**FRAMEWORK:** Long prose documents (10+ pages) with few tables. Examples: regulatory frameworks, SEBI guidelines. Strategy: section detection.

**TABLE_ONLY:** Documents that are almost entirely tables. Strategy: page-level nodes.

**MIXED:** Default for anything that doesn't fit the above. Strategy: section detection with page-node fallback.

**Why this matters for PageIndex:** The layout determines the node structure the Tier 3 agent navigates. A BULLETIN with 78 pages creates 78 page-level nodes (p1 through p78). A FRAMEWORK with 30 pages creates 8-15 named section nodes. The agent's navigation strategy is fundamentally different for each.

---

### 3g. Global Identifier Extraction

**File:** `src/ingestion/pdf_extractor.py`
**Function:** `_extract_global_identifiers_from_text(text: str) -> list[str]`

Run on the text of the **first 3 pages only** (preamble). Four regex patterns:

**1. ISIN (`_GIDENT_ISIN`):**
```python
_GIDENT_ISIN = re.compile(r'\bINE[A-Z0-9]{9}\b')
```
Matches Indian ISIN codes: `INE` + 9 alphanumeric characters. Word boundary ensures no partial matches.

**2. Circular/Circular Number (`_GIDENT_CIRC`):**
```python
_GIDENT_CIRC = re.compile(r'\b[A-Za-z0-9]{2,6}/[A-Za-z0-9_-]+/\d{4,}\b')
```
Matches patterns like `NSE/CML/72961` or `SEBI/HO/MRD/2026/123`. The `2,6` left segment matches exchange prefixes; `4,` minimum digits on the right ensures genuine serial numbers.

**3. Year-Slash Reference (`_GIDENT_YEAR_SLASH`):**
```python
_GIDENT_YEAR_SLASH = re.compile(r'\b\d{3,4}/\d{4}\b')
```
Matches patterns like `0307/2026` (file number / year format common in SEBI documents).

**4. Explicit Reference Keywords (`_GIDENT_REF`):**
```python
_GIDENT_REF = re.compile(
    r'(?<!\w)(?:Ref(?:erence)?|Notice|Circular|No)(?!\w)[\s.:]*(?:No\.?)?\s*'
    r'([A-Za-z0-9][A-Za-z0-9/_-]{5,})',
    re.IGNORECASE,
)
```
Matches "Ref No. CML72972" or "Circular No. SEBI/HO/2026/45" — captures the alphanumeric code after the keyword.

**Post-filter (`_validate_ref_candidate`):** Rejects candidates that:
- Are shorter than 5 characters
- Contain no digits (prevents words like "mentioned" from being captured)
- Are all-lowercase (prevents common words)

**Why only preamble?** The global identifier table is for pre-flight lookup — given a query like "explain INE009A01021", the system needs to know which document contains that ISIN. Identifiers appear in the document header/preamble, not buried in body text. Scanning only 3 pages keeps ingestion fast.

---

## 4. Structured Path — RowStore

**File:** `src/storage/row_store.py`
**Method:** `RowStore.upsert_rows(sha256, source_file, raw_tables, exchange, doc_type, layout, total_pages, ingestion_date, global_identifiers) -> int`

The structured path stores every data row from every table in SQLite.

**Idempotency:** Before inserting, the method deletes all existing rows for this SHA-256. This makes `upsert_rows` safe to call multiple times on the same document (e.g., on `--force` reingest).

```python
conn.execute("BEGIN")
conn.execute("DELETE FROM rows WHERE sha256 = ?", (sha256,))
conn.execute("DELETE FROM table_headers WHERE sha256 = ?", (sha256,))
conn.execute("DELETE FROM document_identifiers WHERE source_file = ?", (source_file,))
conn.execute("DELETE FROM documents WHERE sha256 = ?", (sha256,))
```

**Processing loop:** For each `RawTable` in `raw_tables`:
1. Store headers in `table_headers` table
2. For each row dict: call `_enrich_row()` to extract typed columns
3. Batch-insert into `rows` via `executemany`

**Thread safety:** Uses `threading.local()` for connection management — each thread gets its own SQLite connection, preventing concurrency issues.

---

### 4a. Row Enrichment (Typed Columns)

**File:** `src/storage/row_store.py`
**Function:** `_enrich_row(row_data: dict, headers: list[str]) -> dict`

At ingestion time, each row is scanned to extract typed values that enable fast SQL filtering at query time. Without pre-extraction, filtering would require parsing JSON blobs at runtime (slow and unreliable).

**Column matching strategy:** Case-insensitive header matching against named sets.

**ISIN extraction:**
```python
_ISIN_COLS = {"isin", "security code", "scrip code", "isin code"}
_ISIN_PAT  = re.compile(r'\bIN[A-Z0-9]{10}\b')
```
First tries exact column name match. If column name is not in the set, scans the cell value for ISIN pattern. This handles cases where the ISIN appears in a general "Code" or "Identifier" column.

**Haircut extraction:**
```python
_HAIRCUT_COL_RE = re.compile(r'haircut|hair\s*cut|margin|vhm|var.*margin', re.I)
_HAIRCUT_PAT    = re.compile(r'(\d+(?:\.\d+)?)\s*%?')
```
Fuzzy column name matching (handles "Haircut (%)", "Applicable Haircut", "VaR + Margin Haircut", "Hair Cut"). The percentage value is extracted as a `REAL` for numeric SQL comparisons. This is what makes `haircut_pct >= 9.0` work without LLM.

**Scheme name, subject, notice number:** Similar pattern — named column sets + regex fallback.

---

### 4b. Document Identifiers Table

**File:** `src/storage/row_store.py`
**Inside:** `upsert_rows()`

```python
if global_identifiers:
    ident_inserts = [(source_file, ident.strip()) for ident in global_identifiers if ident]
    conn.executemany(
        "INSERT OR IGNORE INTO document_identifiers (source_file, identifier) VALUES (?,?)",
        ident_inserts,
    )
```

This creates a direct mapping from identifier strings (ISINs, circular numbers, ref codes) to their source documents. The `document_identifiers` table has an index on `identifier`:

```sql
CREATE INDEX idx_docident_identifier ON document_identifiers(identifier);
```

At query time, `global_entity_search("NSE/CML/72961")` does an indexed lookup that returns a `list[str]` of all matching `source_file` values in O(log n). This eliminates the need for any semantic search to resolve "which document is this circular from". Multiple matches are handled via a `$in` filter (see Section 10).

---

## 5. Semantic Path — PageIndex ToC Builder

**File:** `src/ingestion/toc_builder.py`
**Entry function:** `build_toc(doc: ExtractedDocument, exchange: str, doc_type: str) -> dict`

The ToC builder converts an `ExtractedDocument` into a hierarchical JSON document for PageIndex storage. This is the core of the vectorless semantic path.

---

### 5a. Physical Page Anchors

**File:** `src/ingestion/toc_builder.py`
**Inside:** `build_toc()`

Before any structuring, every page's text is prefixed with a physical page marker:

```python
for page in doc.pages:
    text = getattr(page, "text", "") or ""
    if text.strip():
        anchored_text = f"\n\n--- [PHYSICAL PAGE {page.page_number}] ---\n{text.strip()}"
        page_texts.append((page.page_number, anchored_text))
```

**Why `page.text` and not `page.prose_only_text`?** The full `text` field includes table cell content (rendered as pipe-separated text). This is intentional — the PageIndex agent needs to see table values to answer questions like "what is the haircut for SBI MF in this bulletin?". Using `prose_only_text` would erase all table data from the semantic index.

**Why physical page anchors?** The Tier 3 agent accumulates context from multiple `get_node_text()` calls. When the context contains text from multiple sections spanning multiple pages, the `--- [PHYSICAL PAGE N] ---` markers allow the final `GENERATION_SYSTEM` prompt to extract accurate page citations for the `[filename, p.N]` format in answers.

---

### 5b. Layout-Based Strategy Selection

**File:** `src/ingestion/toc_builder.py`
**Inside:** `build_toc()`

```python
force_page_nodes = layout in (DocumentLayout.BULLETIN, DocumentLayout.TABLE_ONLY)

if force_page_nodes:
    nodes, text_blocks = _build_page_nodes(page_texts)
else:
    nodes, text_blocks = _build_section_nodes(full_text, page_texts)
```

**BULLETIN / TABLE_ONLY -> page nodes:**
These layouts have tables on most pages. Section detection on table-heavy text produces noisy results (table headers get mistaken for section headers). Page-level nodes are reliable and sufficient — the agent navigates by page number.

**FRAMEWORK / MIXED / NOTICE -> section nodes first:**
These documents have meaningful prose sections that the agent can navigate semantically. "Tell me about the Requirements section" is far more useful than "Tell me about pages 5-7".

For NOTICE: Since 2026-03-01, NOTICE also attempts section detection first (regulatory notices frequently have explicit `Background`, `Objective`, `Requirements` sections). Page nodes remain as fallback if fewer than 2 sections are found.

---

### 5c. Section Detection

**File:** `src/ingestion/section_detector.py`
**Function:** `detect_sections(full_text: str, min_section_tokens: int = 50) -> list[Section]`

Five regex patterns evaluated in priority order, each scanning the full document text:

**Pattern 1 — Numbered sections (level 1):**
```python
_NUMBERED_SECTION = re.compile(
    r'^(\d{1,2}(?:\.\d{1,2}){0,2})\.?\s+([A-Z][A-Za-z\s\-\/]{3,80})\s*[:\-]?\s*$',
    re.MULTILINE
)
```
Matches: `1. Introduction`, `4.1 Eligibility Criteria`, `1.2.3 Sub-Clause`

The number group allows up to 3 levels of nesting (e.g., `1.2.3`). The title group requires starting with uppercase and being 3-80 chars. Trailing `:` or `-` is allowed (common in Indian regulatory documents). Trailing dot after number is optional (both `1. Title` and `1.1 Title` match).

**Pattern 2 — Part/Chapter/Section headers (level 1):**
```python
_PART_CHAPTER = re.compile(
    r'^(PART|SECTION|CHAPTER|CLAUSE|SCHEDULE|ANNEXURE|APPENDIX)[ \t]+([A-Z0-9][A-Z0-9 \t\-]{0,39})\s*$',
    re.MULTILINE
)
```
Uses `[ \t]` not `\s` in the name group — this prevents matching across newlines in MULTILINE mode, which would otherwise capture multiple lines as a single heading.

**Pattern 3 — Lettered sections (level 2):**
```python
_LETTERED_SECTION = re.compile(
    r'^([A-Z])\.\s+([A-Z][A-Za-z\s\-\/]{3,60})\s*[:\-]?\s*$',
    re.MULTILINE
)
```
Matches: `A. Objective`, `B. Background`. Minimum 3 chars after the letter prevents matching abbreviations like "U.S.".

**Pattern 4 — Roman numeral sections (level 2):**
```python
_ROMAN_SECTION = re.compile(
    r'^([IVXLCivxlc]{1,6})\.\s+([A-Z][A-Za-z\s\-]{4,60})\s*$',
    re.MULTILINE
)
```
Matches: `I. Objective`, `II. Scope`, `III. Provisions`.

**Pattern 5 — ALL-CAPS headings (level 3):**
```python
_CAPS_HEADING = re.compile(
    r'^([A-Z][A-Z\s,\-]{9,80})(?::)?\s*$',
    re.MULTILINE
)
```
Matches: `ELIGIBILITY CRITERIA`, `EFFECTIVE DATE`. Minimum 10 chars prevents single-word false positives.

**Deduplication:** Boundaries within 100 chars of each other are deduplicated (keep first). This prevents a numbered section header and a CAPS version of the same heading from creating two boundaries at nearly the same position.

**Small section merging:** Sections with fewer than `min_section_tokens` (50 tokens) are merged into the previous section rather than stored as separate nodes. Prevents stub nodes from cluttering the ToC.

**Fallback — Fixed-size windows:** If fewer than 2 section boundaries are detected (text has no recognizable headers), the document is split into 2000-token windows with 100-token overlap. This ensures every document gets some structure even if it's completely headerless.

---

### 5d. Section Cleanup Filters

**File:** `src/ingestion/toc_builder.py`
**Inside:** `_build_section_nodes()`

After `detect_sections()` runs, raw sections go through 5 cleanup filters:

**Filter 1 — Minimum length (< 4 chars):**
```python
if len(clean_title) < 4:
    continue
```
Removes: `RD`, `NCD`, `CP`, `Yes` — single-cell table content misidentified as headings.

**Filter 2 — Highly repetitive titles (> 5 occurrences):**
```python
title_counts = Counter(s.title.strip().lower() for s in raw_sections)
if title_counts[clean_title.lower()] > 5:
    continue
```
In a BULLETIN, the same column header like "Scheme Name" might appear 60+ times as pdfplumber text. Counter catches these and removes them all.

**Filter 3 — Purely numeric / punctuation:**
```python
if re.fullmatch(r'^[\W_0-9]+$', clean_title):
    continue
```
Removes: `1.1.`, `12345`, `----`. Real section headers contain letters.

**Filter 4 — Table column smush:**
```python
if len(words) >= 3:
    unique_words = set(w.lower() for w in words)
    if len(unique_words) <= 2:
        continue
```
Removes repeated column values that end up as section headers: `"ISIN ISIN ISIN"`, `"Yes Yes No"`. If a multi-word title uses only 1-2 unique words, it's table noise.

**Filter 5 — Length cap (> 15 words):**
```python
if len(words) > 15:
    continue
```
Real section headers are concise. A 20-word "heading" is almost certainly a sentence fragment or table cell content.

**Graceful fallback:** If cleanup eliminates enough sections that fewer than 2 remain, the code falls back to `_build_page_nodes()` for this document. The cleanup cannot make the ToC worse than page-level nodes.

---

### 5e. Page Nodes (Fallback)

**File:** `src/ingestion/toc_builder.py`
**Function:** `_build_page_nodes(page_texts) -> (list[dict], dict[str, str])`

Creates one node per physical page:

```python
for page_num, text in page_texts:
    node_id = f"p{page_num}"
    nodes.append({
        "node_id": node_id,
        "title": f"Page {page_num}",
        "level": 1,
        "pages": [page_num],
        "children": [],
    })
    text_blocks[node_id] = text[:_MAX_NODE_CHARS]
```

Node IDs are `p1`, `p2`, ..., `p78`. In a 78-page BULLETIN, this creates 78 nodes.

**Why keep page-level nodes for BULLETINs?** BULLETINs contain hundreds of scheme entries across many pages. The Tier 3 agent can navigate: "this is about SBI MF haircuts, so let me check page 12" based on the ToC summary showing which exchanges/schemes are on which pages.

---

### 5f. Root Node

**File:** `src/ingestion/toc_builder.py`
**Inside:** `build_toc()`

```python
text_blocks["root"] = full_text[:_MAX_ROOT_CHARS]  # 100,000 char cap
```

The `root` node always exists and contains the entire document text (truncated to 100,000 chars if needed). It is a special node the Tier 3 agent can request when it wants to "read the whole document."

**Why 100,000 chars?** A typical 10-page regulatory circular is 30,000-50,000 chars. A 78-page BULLETIN is 400,000+ chars. 100k is a generous cap that covers most notices completely and gives a representative excerpt of larger documents.

**Why store the full text at all?** For short NOTICEs and CIRCULARs, reading the root node in a single step is much faster than navigating section-by-section. The agent learns to request "root" for small documents.

---

### 5g. Text Block Storage

**File:** `src/pageindex/store.py`
**Method:** `PageIndexStore.upsert_doc(sha256, source_file, toc_json)`

```python
def upsert_doc(self, sha256: str, source_file: str, toc_json: dict) -> None:
    sf_lower = source_file.lower()
    doc_path = self._docs_dir / f"{sha256}.json"
    doc_path.write_text(
        json.dumps(toc_json, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    with self._lock:
        self._index[sha256] = meta
        self._file_map[sf_lower] = sha256
        self._save_index()
```

The full `toc_json` (including all `text_blocks`) is written as a single JSON file. The index (`index.json`) is updated under lock.

**Why one file per document?** Avoids lock contention for concurrent FastAPI reads — each document file is read independently. The only shared resource is `index.json`, which is written under a threading lock.

---

## 6. Email Webhook Ingestion — downloader.py

**File:** `src/ingestion/downloader.py`
**API endpoint:** `POST /api/v1/fetch-circulars` (routes.py — runs in BackgroundTasks)

Enables automated ingestion triggered by forwarding exchange email digests to the API. No manual file drops required.

**Step 1 — URL extraction:**
`process_daily_circulars(email_text)` scans the email body for URLs using regex. Any `http/https` link is a candidate.

**Step 2 — Per-URL download strategy:**

| URL type | Handler |
|----------|---------|
| Direct `.pdf` URL | `download_direct_file()` — requests GET with Selenium session cookies |
| HTML page with embedded PDF | `extract_embedded_pdf_url()` — scans iframes, `<embed>`, `<object>`, PDF.js viewer patterns; then `download_direct_file()` on the extracted PDF URL |
| Non-PDF HTML page | `save_webpage_as_pdf()` — Chrome headless print-to-PDF fallback |

**Step 3 — Headless Chrome setup (`setup_headless_chrome()`):**
- `webdriver.Chrome` with `--headless=new`, `--disable-gpu`, custom user-agent
- CDP commands to mask `navigator.webdriver` (anti-bot)
- Selenium cookies carried over to `requests.Session` so authenticated exchange portals don't return 403

**Step 4 — Ingestion:**
Saved PDFs land in `DOCUMENTS_DIR`. The background task then calls `run_ingestion()` (pipeline.py), invalidates row/LLM caches, and calls `engine.refresh_cache()`.

**Optional vector path (ENABLE_EMBEDDINGS=true):**
When enabled, `src/ingestion/smart_chunker.py` sub-splits large ToC nodes into ~2000-char chunks, embeds them with `BAAI/bge-large-en-v1.5` via FastEmbed, and stores in ChromaDB. This adds a fast vector pre-filter step before the PageIndex agent in the query path. Disabled by default — the PageIndex agent handles retrieval without embeddings.

---

## 7. Context Cache Refresh

**File:** `src/retrieval/engine.py`
**Method:** `RAGEngine.refresh_cache()`

Called automatically after every ingestion (unless `--no-cache-refresh` flag).

**Step 1:** `PageIndexStore.sample_text_blocks(n=25)`
- Iterates through all documents
- Skips the `root` node (too large, too general)
- Randomly samples up to 3 named section/page nodes per document
- Returns up to 25 text samples (1,200 chars each) across the corpus

**Step 2:** Feed samples to Gemini with a prompt asking it to extract concise factual statements ("The margin requirement for X is Y", "SEBI Circular dated Z covers W").

**Step 3:** Dedup (first 60 chars used as key) and save to `./data/processed/context_cache.json`.

The cache persists across process restarts. At startup, the engine loads this file into memory as `self._context_cache.facts`.

---

# Part 2 — Query Pipeline

---

## 8. Entry Points

**CLI:** `main.py cmd_query()` -> reads from stdin REPL -> calls `QueryRouter.route_and_answer(question, top_k, filters, similarity_threshold, session_id)`

**API (core fallback path):** `src/api/routes_query.py POST /api/v1/query` -> skill router + policy gates -> core router fallback calls `QueryRouter.route_and_answer(...)` when needed.

CLI path converges on `HybridRouter.route_and_answer()` in `src/retrieval/router.py`.  
API path first executes skill routing (`parse_skill_request` + `SkillQueryService.execute`) and may fallback to the same core router path.

Additionally, the router exposes `execute_query(query)` and now applies the same decomposition orchestration in `route_and_answer()` so interactive CLI and API requests both use sub-query planning for complex prompts.

---

## 9. Intent Classification — 9-Step Decision Tree

**File:** `src/retrieval/intent_classifier.py`
**Method:** `IntentClassifier.classify(query, pagination_cursor=None) -> IntentResult`

Pure regex, zero LLM, O(n_patterns). The decision tree is evaluated strictly in order — the first matching rule wins.

**Step 0 (pre-check): Filename extraction**

Before any intent rules, the classifier tries to extract a source filename from the query:
1. Explicit `.pdf` extension (`_PAT_PDF_EXPLICIT`: `\S+?\.pdf`) — highest priority
2. If match is purely numeric (e.g., `"2.pdf"`): look back one word and prepend if not a stop word → reconstructs `"annexure 2.pdf"`
3. Long name with dots (`_PAT_LONG_NAME`): date-embedded names like `24.02.2026_report`
4. Short code style (`_PAT_CODE_STYLE`): `bu240226`, `CML72972`, `20260224-25`

The extracted `source_file` is attached to `IntentResult.source_file` and used by both the structured and semantic paths to scope the query to a specific document.

**Step 1 — EXPORT (confidence: 0.95)**
```python
if _PAT_EXPORT.search(q):
    fmt = "json" if re.search(r'\bjson\b', q, re.I) else "csv"
    return IntentResult(intent=Intent.EXPORT, confidence=0.95, filter_expr=fmt, ...)
```
Matches: `export bu240226.pdf to csv`, `download CML72972.pdf as json`, `csv`, `json`.

Triggered by explicit export/download keywords or format keywords. `filter_expr` carries the format (`"csv"` or `"json"`) that tells the router which output format to produce.

**Step 1b — EXPORT filter_unsupported (confidence: 0.90)**
```python
if _PAT_FILTER_WARN.search(q):
    return IntentResult(intent=Intent.EXPORT, confidence=0.90,
                        filter_expr="filter_unsupported", ...)
```
Matches: `where haircut >= 9%`, `margin above 7.5`, `filtered by exchange`, `greater than`, `at least 5`.

These queries look like SQL filter requests. Rather than attempting brittle natural-language SQL parsing, the router routes them to `_handle_export()` with `filter_expr="filter_unsupported"`, which returns a friendly explanation and instructs the user to paginate or export instead.

**Step 2 — COUNT (confidence: 0.95)**
```python
if _PAT_COUNT.search(q) and not _PAT_LISTING_SIGNALS.search(q):
    return IntentResult(intent=Intent.COUNT, confidence=0.95, ...)
```
Matches: `how many records`, `total schemes`, `count of entries`.

The `_PAT_LISTING_SIGNALS` guard prevents `"give me all records, how many total?"` from being routed as COUNT when the user actually wants a list.

**Step 3 — LIST_PAGE (confidence: 0.92)**
```python
page_m = _PAT_PAGE_N.search(q)
if page_m and (source_file or _PAT_LIST_ALL.search(q)):
    return IntentResult(intent=Intent.LIST_PAGE, ...)
```
Matches: `records on page 1`, `page 2`, `pg. 3`. Requires a source_file or listing signal to avoid false positives on `"what page does the framework start on?"`.

**Step 4 — SCHEMA_ENUM (confidence: 0.82)**
```python
schema_m = _PAT_SCHEMA_ENUM.search(q)
if schema_m:
    path_raw = re.sub(r'.*(?:under|in|within|for|of|from)\s+', '', q).strip()
    return IntentResult(intent=Intent.SCHEMA_ENUM, schema_path=path_raw, ...)
```
Matches: `schemes under OMF non-cash`, `categories in SEBI circular`, `funds belonging to BSE`. Evaluated before LIST_ALL to prevent `"list all schemes under X"` from becoming LIST_ALL.

**Step 5 — LIST_ALL (confidence: 0.90)**
```python
if _PAT_LIST_ALL.search(q):
    return IntentResult(intent=Intent.LIST_ALL, ...)
```
Matches: `give me all records`, `show everything`, `full list`, `complete data`, `everything`.

**Step 6 — NEXT_PAGE (confidence: 0.92)**
```python
next_m = _PAT_NEXT_N.search(q)
if next_m:
    cursor = pagination_cursor or {}
    offset = cursor.get("offset", 0)
    sf = source_file or cursor.get("source_file")
    return IntentResult(intent=Intent.LIST_PAGINATE, is_next_page=True, offset=offset, ...)
```
`is_next_page=True` signals the router to use the session cursor. The cursor carries `{offset, source_file, limit}` from the previous paginated query. This is how `"next 50"` continues from record 51 without the user re-specifying the source file.

**Step 7 — LIST_PAGINATE (confidence: 0.90)**
```python
first_m = _PAT_FIRST_N.search(q)
if first_m:
    limit = int(first_m.group(1) or first_m.group(2))
    return IntentResult(intent=Intent.LIST_PAGINATE, limit=limit, offset=0, ...)
```
Matches: `first 50 records`, `top 100`, `initial 25`.

**Step 8 — Semantic Override (confidence: 0.92)**
```python
if source_file and (_PAT_SUMMARIZE.search(q) or _PAT_EXPLAIN.search(q) or _PAT_PURPOSE.search(q)):
    if _PAT_SUMMARIZE.search(q):
        return IntentResult(intent=Intent.SUMMARIZE, confidence=0.92, source_file=source_file)
    return IntentResult(intent=Intent.QA_EXPLAIN, confidence=0.92, source_file=source_file)
```
**Critical rule:** When both a filename AND a semantic verb are present, semantic intent takes priority over LOOKUP. Without this rule, `"summarize bu240226.pdf"` would hit step 9 (LOOKUP) and return a raw row dump instead of a summary. The `source_file` is preserved so the semantic engine filters to that document.

**Step 9 — LOOKUP (confidence: 0.85)**
```python
if source_file:
    return IntentResult(intent=Intent.LOOKUP, confidence=0.85, source_file=source_file)
```
Filename detected but none of the above conditions matched. Default: show rows from that document.

**Steps 10-12 — Semantic branch (no filename)**

```python
if _PAT_SUMMARIZE.search(q): -> SUMMARIZE (0.85)
if _PAT_EXPLAIN.search(q) or _PAT_PURPOSE.search(q): -> QA_EXPLAIN (0.85)
default: -> QA_TOPICAL (0.70)
```

QA_TOPICAL at 0.70 is the default fallback for any question that doesn't match a more specific pattern.

---

## 10. Global Entity Trap (Post-Classification Scanner)

**File:** `src/retrieval/router.py`
**Inside:** `HybridRouter.route_and_answer()`

**Ordering (Fix 1):** `IntentClassifier.classify()` runs at **Step 0**, before the entity trap. This makes `intent.source_file` available to the entity trap as a scope guard.

After classification, the router checks if the query contains financial identifiers:

```python
_GLOBAL_IDENT_RE = re.compile(
    r'\bINE[A-Z0-9]{9}\b'               # ISIN
    r'|\b[A-Za-z]{2,6}/[A-Za-z0-9_-]+/\d{4,}\b'  # circular
    r'|\b\d{3,4}/\d{4}\b',              # year-slash ref
    re.IGNORECASE
)
```

If a match is found, `RowStore.global_entity_search(identifier, restrict_to=intent.source_file)` is called:
1. **Exact match** on `document_identifiers.identifier` (indexed, O(log n))
2. **LIKE match** on `document_identifiers.identifier` (partial code fallback)
3. **Raw text scan** on `rows.row_data` LIKE pattern (catches table-embedded identifiers)

The function returns `list[str]` of **all** matching `source_file` values (Fix 2).

**State-guard (Fix 1):** If the classifier already extracted a `source_file` from the query (e.g. `"explain NSE/CML/72961 from bu240226.pdf"`), the entity search is restricted to that file via `restrict_to`. The entity trap can never silently widen scope to unrelated documents.

**Single match:** The resolved file is injected as `{"source_file": "file.pdf"}` into the existing `where` filter.

**Multiple matches (Fix 2):** When an identifier spans multiple documents, all matching files are collected and injected as `{"source_file": {"$in": ["a.pdf", "b.pdf"]}}`. On the semantic path, `_load_toc_docs()` in the engine iterates the list and loads each file's ToC from PageIndex individually — the agent then sees both trees and can read nodes from either. On the Tier 2 vector path, the `$in` dict is passed directly to ChromaDB's metadata filter. On the structured path, the router iterates each resolved file separately and returns the first that has rows. (See Section 17 — Fix 5 for the engine-side `$in` bug that was fixed alongside this.)

The **semantic override check** (`_SEMANTIC_OVERRIDE_RE`) runs alongside the entity trap: if a semantic verb AND an entity identifier are both present, the query is routed to `RAGEngine` with the resolved source filter. This prevents the router from doing a LOOKUP row-dump when the user wants an explanation.

---

## 11. Structured Path — Deterministic Retrieval

**File:** `src/retrieval/router.py`
Structured intents return `QueryResponse` objects from RowStore/NoSQL deterministic retrieval (no retrieval-time LLM calls).

**CLI formatting note:** `main.py` can optionally apply a post-formatting LLM cleanup pass (`--clean-records`, enabled by default) after structured retrieval. This does not change retrieval behavior and is bounded to a capped row payload.

---

### 11a. COUNT

```python
total = row_store.count(source_file)
return QueryResponse(
    answer=f"{source_file} contains {total:,} records.",
    tier_used=0,
    ...
)
```

`RowStore.count()` reads from the `documents.total_rows` column (stored at ingestion time), not from `COUNT(*)` on the rows table. This is O(1) — a single indexed row lookup.

---

### 11b. LIST_PAGINATE / LIST_ALL / LIST_PAGE

```python
page = row_store.get_rows(
    source_file=intent.source_file,
    limit=intent.limit,
    offset=intent.offset,
    page_number=intent.page_number,  # for LIST_PAGE only
)
save_cursor(session_id, offset=page.next_offset, source_file=source_file, limit=intent.limit)
```

**RowCache:** Before calling `RowStore.get_rows()`, the router checks `RowCache.get(source_file, limit, offset)`. On cache hit, the stored `RowPage` is returned instantly. On miss, the RowStore is queried and the result cached.

**Session cursor (`save_cursor`):** After returning a page, the current offset + limit are saved keyed to `session_id`. The next `"next 50"` query reads this cursor via `get_cursor(session_id)` and passes the saved offset to the next `get_rows()` call.

**LIST_ALL** never uses RowCache (results may be too large to cache) and is flagged `never_cached=True` in the router.

---

### 11c. EXPORT

Two sub-cases, distinguished by `intent.filter_expr`:

**Case A — filter_unsupported** (triggered by filter-like queries):
```python
if intent.filter_expr == "filter_unsupported":
    answer = (
        "Applying specific record filters (e.g. 'where haircut is 9%') "
        "is not supported directly.\n\n"
        "**What you can do instead:**\n"
        "- Paginate through records: *\"show first 50 records from [filename]\"*\n"
        "- Export all records: *\"export [filename] to CSV\"* ...\n"
        "  and then filter them manually in Excel, Python, or any spreadsheet tool."
    )
    return self._build_row_response(answer=answer, ..., action="export_filter_unsupported")
```

**Case B — csv / json** (triggered by explicit export keyword):
```python
all_rows = []
offset = 0
while True:
    _, batch = self._fetch_rows(store, source_file, limit=_ALL_BATCH_SIZE, offset=offset)
    all_rows.extend(batch)
    offset += len(batch)
    if len(batch) < _ALL_BATCH_SIZE:
        break

if fmt == "json":
    content = json.dumps(export_data, indent=2, ensure_ascii=False)
    answer = f"**JSON export of {source_file}** ({total:,} records):\n\n```json\n{content}\n```"
else:
    answer = _rows_to_csv_answer(all_rows, total, source_file)
```

`_rows_to_csv_answer()` uses `csv.DictWriter` to produce a Markdown-fenced ` ```csv ``` ` block with a header row derived from the union of all `row_data` keys. `_ALL_BATCH_SIZE = 500` — rows are fetched in 500-record batches to avoid loading an entire large document into memory at once.

---

### 11d. LOOKUP

```python
page = row_store.get_rows(source_file=intent.source_file, limit=50, offset=0)
```

Basic paginated row fetch from a specific document. If 0 rows returned AND intent confidence < 0.90 (soft routing), the router falls back to the semantic path (the document may be prose-only with no tables).

---

### 11e. SCHEMA_ENUM

```python
values = row_store.get_distinct_values(
    column="scheme_name",  # or isin, notice_number, etc.
    source_file=intent.source_file,
    contains=intent.schema_path,
)
```

`get_distinct_values()` runs `SELECT DISTINCT column FROM rows WHERE column LIKE ?` on a typed column. The `schema_path` (e.g., `"OMF non-cash"`) is used as a LIKE filter on the value.

---

## 12. Semantic Path — 3-Tier RAG Engine

**File:** `src/retrieval/engine.py`
**Method:** `RAGEngine.query(question, top_k=None, filters=None, similarity_threshold=None) -> QueryResponse`

The `tier_used` field in the returned `QueryResponse` tells you which path answered: `0`=meta scan, `1`=cache hit, `2`=vector search (optional), `3`=PageIndex agent. Structured intents routed by the router return `tier_used=-1`.

---

### 12a. LLM Cache Check

**File:** `src/cache/llm_cache.py`
**Method:** `LLMCache.get(query, exchange, doc_type, source_file) -> Optional[str]`

Before any LLM call, the router checks the LLM answer cache:

```python
cache_key = hashlib.sha256(
    f"{query}|{exchange or ''}|{doc_type or ''}|{source_file or ''}".encode()
).hexdigest()
```

Cache entries are JSON files at `LLM_CACHE_DIR/{cache_key}.json`. Each entry has:
- `answer: str`
- `timestamp: float`
- `registry_version: str` (SHA-256 of the registry file at cache time)

**Invalidation:** An entry is invalid if:
1. `time.time() - timestamp > LLM_CACHE_TTL` (expired, default 24 hours), OR
2. The current registry file's SHA-256 differs from `registry_version` (new documents were ingested)

The registry version check ensures cached answers are invalidated when the document corpus changes — the answer to "how many schemes does SEBI have?" becomes stale the moment new documents are ingested.

The cache only stores answers for semantic intents (SUMMARIZE, QA_EXPLAIN, QA_TOPICAL, LOOKUP_DOC). Structured intents (COUNT, EXPORT, etc.) have their own RowCache and never enter the LLM cache.

---

### 12b. Tier 1: Triage (Context Cache)

**File:** `src/retrieval/engine.py`
**Prompt:** `TRIAGE_SYSTEM + TRIAGE_TEMPLATE` from `src/retrieval/prompts.py`

```python
triage_prompt = TRIAGE_TEMPLATE.format(
    cache_facts="\n".join(self._context_cache.facts),
    question=question,
)
response = self._gemini_triage.generate_content(triage_prompt)
result = json.loads(response.text)
```

**Triage JSON output schema:**
```json
{
  "can_answer_from_cache": true,
  "confidence": 0.92,
  "reasoning": "The cache contains the margin requirement for NSE equity derivatives.",
  "cache_answer": "The margin requirement is 7.5% as per NSE/CML/72961.",
  "suggested_filters": {"exchange": "NSE"}
}
```

If `can_answer_from_cache = true` AND `confidence >= AGENT_CONFIDENCE_THRESHOLD (0.85)`:
- Return immediately with `tier_used=1`
- Zero document reads
- Typical latency: 500-800ms (one fast Gemini call)

**What the triage prompt tells Gemini:** "You have these N pinned facts. Can you answer this question with high confidence from these facts alone? If yes, give the answer. If not, say so — do NOT guess." The prompt explicitly instructs Gemini to refuse "meta/inventory" queries like "what documents do you have?" from cache (the answer would be stale).

---

### 12c. Tier 2: Vector Search (Optional)

**File:** `src/retrieval/engine.py` — `_tier2_vector_search(question, merged_filters)`

**Activated when:** `ENABLE_EMBEDDINGS=true` AND `self._vector_store is not None` AND NOT a broad corpus survey (online mode path).

**Step 1 — Embed query:**
```python
query_vector = self._embedder.embed(question)  # 1024-dim float32
```

**Step 2 — ANN retrieval:**
```python
chunks = self._vector_store.search(query_vector, top_k=cfg.vector_top_k,
                                   filter_metadata=where_filter)
```
ChromaDB returns the top-k chunks by cosine similarity. If `source_file` filter is `{"$in": [...]}`, the engine builds the ChromaDB `$in` filter and passes it directly.

**Step 3 — Hybrid score fusion:**
Tier 2 fuses normalized vector and BM25 signals, then applies lightweight boosts/penalties and diversity control on a bounded rerank set:

```
base_score  = 0.6 * vector_score + 0.4 * bm25_score
final_score = base_score * (1 + boost_factor) - diversity_penalty
```

Where:
- normalization uses stable z-score + sigmoid scaling,
- document-scope matches and exact-term matches increase `boost_factor`,
- missing key-term coverage reduces `boost_factor`,
- repeated section/page candidates receive a small diversity penalty,
- low-quality candidates are dropped before return.

**Step 4 — Generation + confidence gate:**
LLM generation runs on bounded candidate context.  
Online mode: weak/empty Tier-2 can escalate to Tier-3.  
Offline vector-only mode: weak/empty Tier-2 returns a constrained response and does not perform semantic Tier-3 fallback.

**If disabled:** `ENABLE_EMBEDDINGS=false` skips directly to Tier 3.

### Offline semantic constraint (current)

- Offline semantic flow is vector-only:
  - no PageIndex keyword augmentation in Tier-2,
  - no ToC outline injection in Tier-2,
  - no RowStore SQL handoff augmentation in Tier-2,
  - no semantic Tier-3 fallback.

---

### 12d. Tier 3: PageIndex Agent Loop

**File:** `src/retrieval/engine.py` — `_run_pageindex_agent(question, original_question, merged_filters)`
**Prompt:** `PAGEINDEX_NAVIGATOR_SYSTEM + PAGEINDEX_NAVIGATOR_TEMPLATE` from `src/retrieval/prompts.py`

The primary semantic path. An iterative loop where Gemini navigates the document structure.

**Initialization:**
```python
toc_summaries = self._toc_store.get_all_tocs_summary()
# Returns list of ToC dicts WITHOUT text_blocks (lightweight)
# Example: [{"source_file": "bu240226.pdf", "toc": {...}, "total_pages": 78, ...}, ...]

accumulated_context: list[str] = []
agent_steps: list[AgentStep] = []
```

`get_all_tocs_summary()` returns all documents' tree structures but no text content — the agent sees the skeleton of every document and decides which flesh to read.

**Agent loop (max `PAGEINDEX_MAX_ITERATIONS` = 8 iterations):**

```python
for iteration in range(max_iterations):
    nav_prompt = PAGEINDEX_NAVIGATOR_TEMPLATE.format(
        toc_summary=json.dumps(toc_summaries, indent=2),
        accumulated_context="\n\n---\n\n".join(accumulated_context),
        question=question,
        iteration=iteration + 1,
        max_iterations=max_iterations,
    )
    response = self._gemini_nav.generate_content(nav_prompt)
    parsed = json.loads(response.text)
    action = parsed.get("action")
```

**FORMAT 1 — `read_node`:** Gemini wants to read a specific document section.

```json
{
  "action": "read_node",
  "source_file": "CML72972.pdf",
  "node_id": "n3",
  "reasoning": "Section 3 covers eligibility criteria which directly answers the question."
}
```

The engine calls:
```python
text = self._toc_store.get_node_text(source_file, node_id)
accumulated_context.append(
    f"[From {source_file}, node {node_id}]\n{text}"
)
```

`get_node_text()` reads the SHA-256-named JSON file and returns `text_blocks[node_id]`. This is a disk read — no LLM call.

**FORMAT 2 — `answer`:** Gemini has enough context to answer.

```json
{
  "action": "answer",
  "answer": "The margin requirement for equity derivatives is 7.5%...",
  "confidence": 0.91,
  "sources": [
    {"source_file": "CML72972.pdf", "pages": [2, 3], "node_id": "n3"}
  ]
}
```

The loop breaks immediately. **Important:** the `sources` field inside FORMAT 2 comes from the LLM and can be hallucinated or incomplete. The engine does **not** use this field for the final `QueryResponse.sources`. Instead it rebuilds sources from `read_context` (what was actually fetched from disk), then filters to those explicitly cited in the answer text via `_filter_cited_sources()`. This ensures the Sources footer is authoritative, not LLM-fabricated.

**What the navigator prompt shows Gemini:**
1. Full ToC tree of all documents (JSON, node titles + page ranges)
2. Accumulated context so far (text read from previous nodes)
3. The user's question
4. Current iteration number and maximum (so Gemini knows when to stop deliberating and commit to an answer)

**Why iterative?** A regulatory question like "what are the margin requirements for equity futures under NSE?" may require reading a section heading first, then a sub-section, then an annexure reference. One-shot retrieval can't follow this chain. The agent can.

**Typical agent behavior for a 3-page CIRCULAR:**
- Iteration 1: Requests `root` node (reads entire document)
- Iteration 2: Outputs FORMAT 2 answer (full context was available)

**Typical agent behavior for a 78-page BULLETIN:**
- Iteration 1: Requests `p15` (page 15, based on ToC title "Equity Margin - Haircuts")
- Iteration 2: Reads more context, requests `p16`
- Iteration 3: Has enough, outputs FORMAT 2 answer

---

### 12e. Internal Reference Auto-Following

**File:** `src/retrieval/engine.py`
**Regex:** `_INTERNAL_REF_RE`

After every `read_node` response, the accumulated text is scanned for internal cross-references:

```python
_INTERNAL_REF_RE = re.compile(
    r'(?:see|refer\s+to|as\s+(?:per|mentioned\s+in)|refer\s+(?:also\s+)?to|'
    r'detailed\s+in|specified\s+in|as\s+set\s+out\s+in)\s+'
    r'(Annexure|Appendix|Schedule|Section|Part|Clause)\s+([A-Z0-9][A-Z0-9\-]*)',
    re.IGNORECASE
)
```

Matches: `See Annexure B`, `as per Schedule 2`, `refer to Section 4.1`, `detailed in Appendix C`.

When a match is found:
1. The referenced node title is searched in the current document's ToC
2. If found, the node text is fetched immediately (without consuming an iteration)
3. The fetched text is appended to `accumulated_context`

**Why auto-follow?** Regulatory documents are heavily cross-referential. "The requirements are as specified in Annexure 2" is a dead end if the agent can only read one node per iteration. Auto-following turns this into a single iteration that delivers both the section text and the annexure content.

---

### 12f. Forced Final Answer

**File:** `src/retrieval/engine.py`

After `PAGEINDEX_MAX_ITERATIONS` iterations, if FORMAT 2 has not been output, the engine forces an answer:

```python
if not answered:
    forced_context = "\n\n---\n\n".join(accumulated_context)
    final_prompt = GENERATION_SYSTEM + GENERATION_TEMPLATE.format(
        context=forced_context,
        question=question,
    )
    response = self._gemini_gen.generate_content(final_prompt)
    answer = response.text
    confidence = 0.65  # hardcoded reduced confidence for forced answers
```

**Why force instead of returning "I don't know"?** After 8 iterations, the agent has read multiple sections and accumulated substantial context. A forced generation from that context is usually still useful — it's just less precisely targeted than a self-directed FORMAT 2 answer. The reduced confidence (0.65) signals downstream that this was a forced answer.

---

## 13. Response Assembly

**File:** `src/retrieval/engine.py`, `src/retrieval/router.py`

After the 3-tier pipeline resolves, `QueryResponse` is assembled:

```python
@dataclass
class QueryResponse:
    answer: str                   # Final answer text
    sources: list[Source]         # Cited documents with page numbers
    tier_used: int                # -1=structured/entity trap, 0=meta, 1=cache, 2=vector, 3=pageindex agent
    agent_steps: list[AgentStep]  # Iteration trace (Tier 3 PageIndex agent only)
    confidence_score: float       # LLM-assessed confidence (0.0-1.0)
    chunks_retrieved: int         # Number of nodes/chunks read
    cursor_token: Optional[str]   # Session cursor for next page (structured only)
    total_rows: Optional[int]     # Total matching rows (structured only)
```

Each `Source`:
```python
@dataclass
class Source:
    filename: str
    pages: list[int]
    exchange: str
    doc_type: str
    relevance_score: float
    ingestion_date: str
```

### 13a. Citation Rendering at Output Time

The raw `answer` string contains citations in the format `[filename.pdf, p.N]`. These are converted at output time — **before the result is delivered to the caller** — so consumers never have to parse raw citation markers:

**CLI path (`cmd_query` in `main.py`):**
```python
# _answer_to_rich_markup() converts [f.pdf, p.N] -> Rich OSC-8 hyperlink
Panel(_answer_to_rich_markup(result.answer, cfg.documents_dir), ...)
```
Produces `[link=file:///…/f.pdf#page=N][cyan](p.N)[/cyan][/link]` — a compact OSC-8 terminal hyperlink that opens the PDF at the cited page in the system viewer. `**bold**` Markdown is also preserved.

**API path (`_engine_result_to_response()` in `src/api/routes_common.py`):**
```python
answer=_api_linkify_citations(result.answer)
```
Converts `[f.pdf, p.N]` to `[p.N](/api/v1/documents/f.pdf#page=N)` — standard Markdown. Any Markdown-aware frontend renders this as a clickable link to the `/documents` serving endpoint. Compound citations (`[f1.pdf, p.1; f2.pdf, p.3]`) produce one link per source.

Both functions use the same two-regex design:
- Outer regex captures any `[…pdf…]` bracket wholesale.
- Inner regex iterates over `(filename, page)` pairs inside the bracket.

---

## 14. LLM Cache Write

**File:** `src/cache/llm_cache.py`
**Method:** `LLMCache.set(query, answer, intent, exchange, doc_type, source_file)`

After a successful semantic answer:

```python
registry_version = hashlib.sha256(
    open(registry_path, "rb").read()
).hexdigest()

cache_entry = {
    "answer": answer,
    "timestamp": time.time(),
    "registry_version": registry_version,
    "intent": intent.value,
    "exchange": exchange,
    "doc_type": doc_type,
    "source_file": source_file,
}
cache_path.write_text(json.dumps(cache_entry, indent=2, ensure_ascii=False))
```

The registry version is snapshotted at write time. Future reads compare the current registry SHA-256 to this stored value — if they differ, the cache entry is considered stale.

**What is not cached:**
- Structured intents (COUNT, LIST_*, EXPORT, LOOKUP, SCHEMA_ENUM) — these always go to SQLite
- LIST_ALL — results may be very large and change with every ingest
- Forced answers (confidence <= 0.65) — quality may be too low to cache

**Directory robustness:** `set()` calls `self._dir.mkdir(parents=True, exist_ok=True)` inside the try-block before every `path.write_text()`. This guards against the directory being deleted after `__init__` ran (e.g., `rm -rf data/cache/llm_cache` by an operator). Without this guard the write silently fails and a `WARNING LLMCache set failed: [Errno 2]` appears in the log. The `app.py` lifespan also pre-creates both cache directories at startup so the first request never races against directory creation.

---

## 15. Known Bugs & Fixes (2026-03-06)

Three bugs were identified from live query logs and fixed in the codebase. All three are documented here so the next developer knows where to look and why each decision was made.

---

### Bug 1 — Generative Repetition

**Symptom:** The LLM repeated the exact same bullet point twice consecutively in a summarization answer. Example:
```
- Haircut: For Open Ended Mutual Funds, the haircut is '9% or VaR, whichever is higher'
- Haircut: For Open Ended Mutual Funds, the haircut is '9% or VaR, whichever is higher'
```

**Root cause:** The `GENERATION_SYSTEM` prompt in `src/retrieval/prompts.py` had no explicit instruction preventing duplicate content. The LLM's softmax sampling at low temperature (0.1) can still produce repeated spans when similar bullet points are contextually probable after one another — for example, a section with two slightly different haircut rules that the model conflates.

**Fix — File:** `src/retrieval/prompts.py`

A new rule 16 was added to `GENERATION_SYSTEM`:
```
16. NEVER repeat the same bullet point, sentence, or fact twice in your response.
    Before writing each bullet or sentence, check whether an identical or
    near-identical point has already appeared earlier in your answer. If it has,
    skip it entirely. Every piece of information must appear exactly once.
```

**Why a prompt rule and not post-processing deduplication?** Post-processing would need to compare sentences semantically (expensive, adds latency). An LLM told explicitly not to repeat generally obeys at low temperature. If repetition recurs despite the prompt fix, a simple post-processing pass that deduplicates adjacent identical lines can be added to `_build_response()` as a hard safeguard.

---

### Bug 2 — Source Clutter on Corpus Surveys

**Symptom:** For broad queries like "which document mentions Gujarat Lease Financing?", the system ran a corpus survey (reads all 88 root excerpts), correctly cited `surv72963.pdf` in the answer, but printed all 88 documents in the Sources footer.

**Root cause — two parts:**

**Part A (corpus survey):** `_run_corpus_survey()` in `engine.py` builds `agent_sources` by appending every document it reads a root excerpt from. It returns all of them regardless of whether the generated answer mentions them. The call-site passed this full list directly to `_agent_sources_to_chunks()` which feeds into `_build_response()` → `QueryResponse.sources`.

**Part B (Tier 3 FORMAT 2):** When the PageIndex agent returns FORMAT 2, the code was doing:
```python
agent_sources = decision.get("sources", [])  # LLM-generated field
```
The LLM-provided `sources` list in FORMAT 2 is unreliable — the LLM may hallucinate sources it did not actually read, or may list sources that do not appear cited in the answer text.

**Fix — File:** `src/retrieval/engine.py`

**New helper function** added just before `_agent_sources_to_chunks()`:
```python
def _filter_cited_sources(answer: str, agent_sources: list[dict]) -> list[dict]:
    """
    Return the subset of agent_sources whose source_file is explicitly mentioned
    in the answer text.

    Falls back to the full list when no citation matches are found.
    """
    answer_lower = answer.lower()
    cited = [
        src for src in agent_sources
        if src.get("source_file", "").lower() in answer_lower
    ]
    return cited if cited else agent_sources
```

**Applied in three places:**

1. **Corpus survey call-site** (after `_run_corpus_survey()` returns):
   ```python
   cited_survey_sources = _filter_cited_sources(answer, agent_sources)
   pseudo_chunks = _agent_sources_to_chunks(cited_survey_sources, self._store)
   ```

2. **FORMAT 2 inside `_run_pageindex_agent()`** — replaced the LLM-generated sources with `read_context`-derived sources, then filtered:
   ```python
   actual_sources = [
       {"source_file": ctx["source_file"], "node_id": ctx["node_id"],
        "pages": ctx.get("pages", [])}
       for ctx in read_context   # authoritative: what was actually fetched
   ]
   agent_sources = (
       _filter_cited_sources(answer, actual_sources)
       if actual_sources
       else decision.get("sources", [])   # fallback only when nothing was read
   )
   ```

3. **Regular Tier 3 call-site** as a safety net:
   ```python
   cited_agent_sources = _filter_cited_sources(answer, agent_sources)
   pseudo_chunks = _agent_sources_to_chunks(cited_agent_sources, self._store)
   ```

**Fallback rule:** `_filter_cited_sources` returns the full list if no filenames are detected in the answer. This prevents a Sources section with zero entries when the answer doesn't happen to mention filenames by name (e.g., conversational answers that summarize without inline citations).

**Log change:** The corpus survey log now emits both `docs_read` and `cited` counts:
```
[SURVEY] Corpus Survey | docs_read=88 | cited=1 | confidence=0.82 | 4320ms
```

---

### Bug 3 — Footer Label Discrepancy (`tier_used=2` shown as PageIndex Agent)

**Symptom:** Query logs clearly showed `[T2-VEC] Vector search answered`, confirming the answer came from Tier 2 (vector search). But the CLI footer printed:
```
Engine: PageIndex Agent - ToC Navigation
```

**Root cause — File:** `main.py`, inside `cmd_query()`.

The `_TIER_LABELS` dictionary mapped both tier 2 and tier 3 to the same label:
```python
_TIER_LABELS = {
    -1: "Structured Engine (0 LLM tokens)",
     0: "PageIndex - Meta/Entity Scan",
     1: "Cache Hit",
     2: "PageIndex Agent - ToC Navigation",   # ← WRONG
     3: "PageIndex Agent - ToC Navigation",   # compat label (also wrong)
}
```

Tier 2 is the **Vector Search** path (`_run_tier2_vector_search()` in engine.py which calls ChromaDB + BM25 RRF + Gemini generation). It is not the PageIndex agent at all. The compat label on tier 3 was a copy-paste artifact from a previous refactor.

**Fix — File:** `main.py`
```python
_TIER_LABELS = {
    -1: "Structured Engine (0 LLM tokens)",
     0: "PageIndex - Meta/Entity Scan",
     1: "Cache Hit",
     2: "Vector Search (Semantic Retrieval)",   # ← corrected
     3: "PageIndex Agent - ToC Navigation",     # ← already correct, compat note removed
}
```

The footer and the verbose agent-trace panel now correctly identify which engine produced the answer. This is important for debugging: if you see "Vector Search" in the footer but the answer is poor, you know to check ChromaDB / embedding quality. If you see "PageIndex Agent", you know to look at the agent iteration trace.

**Follow-up fix applied:** `src/api/models.py` `tier_used` field description updated to: `-1=Structured Engine, 0=Meta scan, 1=Cache hit, 2=Vector search, 3=PageIndex agent`. The old description `2=standard RAG, 3=exhaustive RAG` was inaccurate.

---

## 16. Quality & API Fixes (2026-03-07)

Four issues from live logs, plus new API capabilities.

---

### Fix 1 — SQL Handoff State Bleed

**Symptom:** Querying `bu240226.pdf` injected 40 SQL rows from a completely unrelated file (`scheme_of_deposit_...pdf`) into the semantic prompt. The RowStore data in the answer was wrong because it came from the wrong document.

**Root cause — File:** `src/retrieval/engine.py`, inside `_tier2_vector_search()`.

Vector search for `bu240226.pdf` returned a hit in `scheme_of_deposit_...pdf` because that document contained a `table_circuit_breaker_summary` node that scored highly. That file was then added to `table_summary_files` — the dict that controls which SQL rows are injected into the semantic prompt. The scope guard on `where_filter["source_file"]` was only applied to node retrieval, not to the SQL injection step.

**Fix:**
```python
# In _tier2_vector_search(), before DYNAMIC SQL DATA INJECTION block:
if where_filter and "source_file" in where_filter:
    _sf_scope = where_filter["source_file"]
    table_summary_files = {
        sf: meta for sf, meta in table_summary_files.items()
        if sf == _sf_scope
    }
```

---

### Fix 2 — Survey Output Truncation

**Symptom:** Corpus survey answers (82-doc synthesis) were cut off mid-sentence.

**Root cause:** `_generate()` was called with `max_output_tokens=LLM_MAX_TOKENS` (2048). An 82-document synthesis naturally produces much longer output.

**Fix — Files:** `src/config.py`, `src/retrieval/engine.py`

Added `LLM_SURVEY_MAX_TOKENS=8192` config key. `_generate()` now accepts an optional `max_tokens` override; `_run_corpus_survey()` passes `llm_survey_max_tokens` to it.

---

### Fix 3 — Citation Formatting Bugs

**Two sub-bugs from the same root:**

**Sub-bug A — Double bracket `[[file.pdf, p.1]]`:**
`GENERATION_SYSTEM` had two conflicting citation rules: rule 2 asked for `[f, p.X]` and rule B asked for `[[f, p.X]](url)` (Markdown link). The LLM mixed both. Fix: removed rule B entirely.

**Sub-bug B — Index citations `[6, p.1]`:**
`build_context_string()` in `prompts.py` labelled chunks as `[1] file.pdf`, `[6] file.pdf`. The LLM used the bracket number as the citation instead of the filename. Fix: changed label format to `SOURCE {i}: filename` (no surrounding brackets on the number).

---

### Fix 4 — LLMCache Directory Missing

**Symptom:** `WARNING LLMCache set failed: [Errno 2] No such file or directory: 'data\\cache\\llm_cache\\<hash>.json'` on first query after serve start.

**Root cause:** `data/cache/llm_cache/` was never created before the first write attempt (common on a fresh checkout before any `ingest` run).

**Fix — Files:** `src/cache/llm_cache.py`, `src/api/app.py`

- `LLMCache.set()` now calls `self._dir.mkdir(parents=True, exist_ok=True)` inside the try-block before `path.write_text()`.
- `app.py` lifespan pre-creates both `llm_cache_dir` and `row_cache_dir` at startup before accepting requests.

---

### New Feature — Citation Links in API Mode

**Problem:** `_answer_to_rich_markup()` (CLI citation renderer in `main.py`) only ran in `cmd_query`. API consumers got raw `[filename.pdf, p.N]` text with no linkification.

**Solution — File:** `src/api/routes_common.py`

Added `_api_linkify_citations(text)` using the same two-regex design as the CLI renderer. Called inside `_engine_result_to_response()` so all query endpoints benefit automatically.

Output format: `[p.N](/api/v1/documents/filename.pdf#page=N)` — standard Markdown, renders as a link in any frontend.

Also added `GET /api/v1/documents/{filename}` (`FileResponse`, `content_disposition_type="inline"`) so those links point to a real serving endpoint. The resolver now performs safe filename-only lookup across standard document folders (`DOCUMENTS_DIR`, `processed_documents`, `daily_circulars`, `rag_documents`) so deployments only need a base URL change, not per-folder link updates.

---

## 17. Routing & Engine Fixes (2026-03-07 — post-session)

---

### Fix 5 — Multi-File `$in` Filter Not Understood by PageIndex Engine

**Symptom:** Querying `"What information do you have for ISIN INE670K01029"` returned "No relevant documents were found" even though the triage log correctly showed:
```
EntityTrap+SemanticVerb: 'INE670K01029' -> ['dispnewnoticescirculars_page_20260224-13.pdf', 'cml72968.pdf']
```

**Root cause — File:** `src/retrieval/engine.py`, `_extract_source_file_from_filter()` + `_load_toc_docs()`.

When the GlobalEntityTrap resolves an identifier to multiple files, the router builds a filter:
```python
{"source_file": {"$in": ["dispnewnoticescirculars_page_20260224-13.pdf", "cml72968.pdf"]}}
```

`_extract_source_file_from_filter()` then called `str(f["source_file"])` which produced a garbage string `"{'$in': ['file1.pdf', 'file2.pdf']}"`. `_load_toc_docs()` passed this garbage string to `self._store.get_toc(garbage)`, got `None`, and returned `[]`. With empty `toc_docs`, `_run_pageindex_agent()` hit the "No ToC documents found" early-exit and returned an empty answer.

**Fix — File:** `src/retrieval/engine.py`

1. New function `_extract_source_files_from_filter(f) -> list[str]` that returns `[]` (no filter), `["single.pdf"]` (equality), or `["a.pdf", "b.pdf"]` (`$in`). Handles `$and` wrapping too.

2. Old `_extract_source_file_from_filter` (singular) updated to call `_extract_source_files_from_filter` and return `None` if the result has zero or multiple entries — so single-file call-sites continue to work.

3. `_load_toc_docs()` now uses `_extract_source_files_from_filter` and iterates the list:
   ```python
   source_files = _extract_source_files_from_filter(merged_filters)
   if source_files:
       summaries = []
       for sf in source_files:
           toc = self._store.get_toc(sf)
           if toc is not None:
               summaries.append({k: v for k, v in toc.items() if k != "text_blocks"})
       return summaries, source_files
   ```
   Both documents are loaded and the agent sees both ToC trees in a single loop.

4. `_run_tier2_vector_search()` now passes the correct ChromaDB filter:
   ```python
   _sf_list = _extract_source_files_from_filter(merged_filters)
   if len(_sf_list) == 1:
       where_filter = {"source_file": _sf_list[0]}
   elif len(_sf_list) > 1:
       where_filter = {"source_file": {"$in": _sf_list}}  # ChromaDB native $in
   ```

### Fix 5b — `AttributeError: 'dict' object has no attribute 'lower'` in `_tier2_vector_search`

**Symptom:** After Fix 5, the same multi-file query crashed immediately:
```
AttributeError: 'dict' object has no attribute 'lower'
engine.py:1049 in _tier2_vector_search
    if sf.lower() != where_filter["source_file"].lower():
```

**Root cause:** Fix 5 made `_run_tier2_vector_search()` correctly build `where_filter = {"source_file": {"$in": [...]}}` for multi-file queries, but three other places inside `_tier2_vector_search` still assumed `where_filter["source_file"]` was always a plain string:

1. **Line ~1049 (keyword hits filter):** `sf.lower() != where_filter["source_file"].lower()` — called `.lower()` on a dict.
2. **Lines ~1084-1117 (first ToC injection block):** `sf_target = where_filter["source_file"]` then `self._store.get_toc(sf_target)` — passed a dict to `get_toc()`.
3. **Lines ~1216-1221 (SQL scope guard):** `_sf_scope = where_filter["source_file"]` then `sf == _sf_scope` — compared a string filename to a dict.

**Fix — File:** `src/retrieval/engine.py`

1. **Keyword hits filter** — replaced single-string comparison with `$in`-aware check:
   ```python
   if where_filter and "source_file" in where_filter:
       _sf_val = where_filter["source_file"]
       if isinstance(_sf_val, dict) and "$in" in _sf_val:
           if sf.lower() not in [x.lower() for x in _sf_val["$in"]]:
               continue
       elif sf.lower() != str(_sf_val).lower():
           continue
   ```

2. **ToC injection block** — extracted a `_sf_targets` list and wrapped the existing block in a `for` loop:
   ```python
   if where_filter and "source_file" in where_filter:
       _sf_val = where_filter["source_file"]
       _sf_targets = _sf_val["$in"] if isinstance(_sf_val, dict) and "$in" in _sf_val else ([_sf_val] if _sf_val else [])
       for sf_target in _sf_targets:
           toc_data = self._store.get_toc(sf_target)
           if toc_data and "toc" in toc_data:
               # ... inject ToC for each file ...
   ```
   For multi-file queries, each file's structural outline is now injected as a separate pseudo-chunk.

3. **SQL scope guard** — added `$in`-aware set membership check:
   ```python
   if isinstance(_sf_scope, dict) and "$in" in _sf_scope:
       _sf_set = {x.lower() for x in _sf_scope["$in"]}
       table_summary_files = {sf: meta for sf, meta in table_summary_files.items() if sf.lower() in _sf_set}
   else:
       table_summary_files = {sf: meta for sf, meta in table_summary_files.items() if sf == _sf_scope}
   ```

---

## 17. Router Modularization & Email Ingestion (2026-03-08)

### Change 1 — router_util/ subpackage

`src/retrieval/router.py` was growing too large. Shared utilities were extracted into `src/retrieval/router_util/`:

**`extractors.py`**
- `extract_global_identifiers(text)` — finds ISINs (`INE[A-Z0-9]{9}`), circular reference codes (`EXCHANGE/DEPT/NUMBER`), year/slash refs. Uses `(?<!\w)` / `(?!\w)` word-boundary guards and `_validate_ref_candidate()` post-filter (must contain at least one digit; must not be all-lowercase) to prevent false positives like `'tified'` or `'n-Convertible'` from polluting the entity trap.
- `extract_proper_nouns(text)` — multi-word capitalized phrases first, then single-word. Filters interrogatives and stop words. Returns sorted by length desc then word-count desc so longer phrases match before sub-phrases.

**`helpers.py`**
- `inject_source_filter(filters, source_file)` — wraps existing filter in `{"$and": [original, {"source_file": sf}]}` if filter already exists, otherwise returns `{"source_file": sf}` directly.
- `inject_source_files_filter(filters, source_files)` — same but for `$in` multi-file case.
- `format_records(rows, source_file, offset, limit, total)` — human-readable paged table display.
- `rows_to_csv_answer(rows, source_file)` — Markdown-fenced CSV for EXPORT intent.
- `wants_count()` — regex detect phrases like "how many", "total number", "count of" for count augmentation.
- `NOT_FOUND_PHRASES` — compiled regex of LLM "not found" signals used to trigger Proper Noun Fallback.

### Change 2 — llm_client.py

All raw Gemini API calls unified into `src/retrieval/llm_client.py`:

- `call_gemini(client, model, system_instruction, user_prompt, temperature, max_output_tokens)` — handles both standard models and thinking models (gemini-2.5-pro returns content via `candidates[0].content.parts[0].text`).
- `parse_json_response(text)` — extracts JSON from response: tries raw parse first, then markdown fence strip, then regex fallback. Returns `{}` on failure rather than raising.

### Change 3 — cache.py standalone

`ContextCache` was previously embedded inside `engine.py`. It now lives in `src/retrieval/cache.py` and is imported by `engine.py`. No behaviour changes — this is purely a structural split for independent reuse.

### Change 4 — util.py agent helpers

PageIndex agent utilities extracted to `src/retrieval/util.py`:
- `build_toc_summary(toc_docs, max_chars=30000)` — compact text representation of all ToC trees for the navigator prompt.
- `build_read_context_str(read_sections)` — formats already-read sections into the agent's accumulated context string.
- `extract_internal_refs(text, toc_nodes)` — regex detects "See Annexure B", "Refer to Section 3" patterns and matches them against ToC node titles to auto-queue reads without an extra LLM call.
- `filter_cited_sources(answer, sources)` — keeps only sources actually mentioned in the final answer text.
- `agent_sources_to_chunks(agent_sources, toc_store)` — converts agent source refs to pseudo-chunk format for API response assembly.
- `flatten_toc_nodes(toc)` — recursively flattens a ToC tree to a flat list for searching.

### Change 5 — /fetch-circulars endpoint + BackgroundTasks fix

`POST /api/v1/fetch-circulars` added to `routes.py`. The route handler `trigger_fetch_and_ingest()` requires `BackgroundTasks` as a FastAPI dependency.

**Bug:** `BackgroundTasks` was not imported from `fastapi` in `routes.py`. Pydantic treated it as an unresolved `ForwardRef` and then annotated it with `Query(PydanticUndefined)`, causing `GET /openapi.json` (and `/docs`) to crash with `PydanticUserError: TypeAdapter not fully defined`.

**Fix:** Added `BackgroundTasks` to the fastapi import line:
```python
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
```

---

---

## 18. API Service Orchestration Split (2026-04-16)

Route-handler orchestration responsibilities were moved into dedicated service modules without changing endpoint contracts:

- `src/api/services/history_service.py`
  - centralizes query/template/due-diligence history payload construction and storage
- `src/api/services/cache_service.py`
  - centralizes cache refresh/read/delete and runtime cache invalidation helpers
- `src/api/services/workspace_cleanup_service.py`
  - centralizes workspace/file deletion orchestration and context-cache eviction

Where this is now wired:

- `src/api/routes_query.py` delegates history append/read behavior to `history_service`
- `src/api/routes_templates.py` delegates template history versioning/persistence to `history_service`
- `src/api/routes_due_diligence.py` delegates due-diligence history persistence to `history_service`
- `src/api/routes_admin.py` delegates cache and delete operations to service modules
- `src/api/routes_common.py` delegates cache/history helper behavior to service modules

Validation additions:

- `tests/integration/test_workspace_session_isolation_integration.py`
- `tests/integration/test_ingestion_query_flow_integration.py`
- `tests/integration/test_tier_fallback_behavior_integration.py`

These additions strengthen end-to-end coverage for workspace/session isolation, ingestion-to-query flow, and tier fallback behavior.

---

## 19. Structured Query Guardrails + Page Windows (2026-04-16)

Behavior now enforced across online/offline modes:

- Structured list/enrichment display is capped at 50 rows (`STRUCTURED_MAX_DISPLAY_ROWS`).
- Requests above cap return raw dump output (JSON/CSV) with explicit guidance.
- Structured paths remain local-first; optional language polish is config-gated via `STRUCTURED_POLISH_ENABLED=false` by default.
- Page-window routing is supported for both semantic and structured intents:
  - semantic scope examples: `summarize page 5 of X.pdf`, `explain pages 5 to 10 of X.pdf`
  - structured scope example: `show records of page 5 to 10 from X.pdf`
- Tier-2 mixed-document summary context now includes up to first 50 structured rows for theory+records summaries when scoped.

## 20. Offline Latency Budgeting (2026-04-16)

To keep offline mode usable on CPU-first systems (Core i3 + 8/16 GB), semantic generation now applies deterministic profile caps:

- Tier-2 prompt budget in offline mode:
  - hard cap on chunks (`OFFLINE_TIER2_MAX_CHUNKS_*`)
  - hard cap on per-chunk text (`OFFLINE_CHUNK_TEXT_MAX_CHARS_*`)
- Generation token budget in offline mode:
  - `OFFLINE_GENERATION_MAX_TOKENS_8GB` / `OFFLINE_GENERATION_MAX_TOKENS_16GB`
- PageIndex navigation budget in offline mode:
  - `OFFLINE_NAV_MAX_TOKENS_8GB` / `OFFLINE_NAV_MAX_TOKENS_16GB`
  - `OFFLINE_PAGEINDEX_MAX_ITERATIONS_8GB` / `OFFLINE_PAGEINDEX_MAX_ITERATIONS_16GB`
- Broad survey budget in offline mode:
  - document cap: `OFFLINE_CORPUS_MAX_DOCS_*`
  - token cap: `OFFLINE_SURVEY_MAX_TOKENS_*`

These controls are profile-aware (`SLM_PROFILE=8gb|16gb`).

## 21. Online Latency + Cost Budgeting (2026-04-16)

Online mode now also uses deterministic budget controls so Gemini quality remains strong while tail latency and token spend stay bounded:

- Generation token cap: `ONLINE_GENERATION_MAX_TOKENS`
- PageIndex navigation cap: `ONLINE_NAV_MAX_TOKENS`
- Online PageIndex loop cap: `ONLINE_PAGEINDEX_MAX_ITERATIONS`
- Corpus survey scope cap: `ONLINE_CORPUS_MAX_DOCS`
- Survey output token cap: `ONLINE_SURVEY_MAX_TOKENS`
- Tier-2 prompt shaping:
  - max chunks: `ONLINE_TIER2_MAX_CHUNKS`
  - per-chunk text cap: `ONLINE_CHUNK_TEXT_MAX_CHARS`

Defaults are set to preserve existing answer quality while providing production guardrails.

*Last updated: 2026-04-16*
