# RAG / VDR / Template — State & Behavior Reference

This document describes the complete state management, initialization, navigation, streaming, recovery, and edge-case behaviors for the Data Room (RAG Chat), VDR (Due Diligence Run), and Template features. All logic lives in `lib/widgets/rag_chat/rag_chat_page.dart` unless otherwise noted.

---

## 1. Modes and Top-Level State

The widget tracks three operational modes via the `RagMode` enum:

| Mode | Enum value | Description |
|---|---|---|
| RAG Chat | `RagMode.localChat` | Per-session document Q&A via SSE streaming |
| VDR | `RagMode.dueDiligence` | Full due-diligence runs with follow-up chat |
| Template | `RagMode.template` | Templated report generation runs |

Active mode: `_currentMode`  
Active workspace id: `_activeWorkspaceId`  
Active session id: `_activeSessionId`

---

## 2. Per-Session State Maps

All runtime state is keyed by `sessionKey = "$workspaceId::$sessionId"` (or just `workspaceId` for VDR/Template workspace-level keys). This guarantees that background async updates for one session never corrupt another session's state.

### RAG Chat
| Map | Type | Purpose |
|---|---|---|
| `_ragChatsBySessionKey` | `Map<String, RagChatSession>` | Full message history + session metadata per session |
| `_ragStreamingBySessionKey` | `Map<String, bool>` | Whether SSE is actively streaming for that session |
| `_ragRecoveryLoopActiveSessionKeys` | `Set<String>` | Sessions currently running a recovery polling loop (prevents duplicates) |

### VDR (Due Diligence)
| Map | Type | Purpose |
|---|---|---|
| `_dueDiligenceChatsBySessionKey` | `Map<String, RagChatSession>` | VDR follow-up chat messages per session |
| `_vdrActiveRunIdBySessionKey` | `Map<String, String?>` | Active VDR run ID for each session |
| `_vdrRunSnapshotBySessionKey` | `Map<String, VdrRunSnapshot?>` | Latest VDR run status snapshot per session |
| `_isDueDiligenceRunning` | `bool` | Derived — true if the currently viewed VDR session has an active run |
| `_dueDiligenceRunSnapshot` | `VdrRunSnapshot?` | Derived — snapshot for the currently viewed VDR session |

### Template
| Map | Type | Purpose |
|---|---|---|
| `_templateChatsBySessionKey` | `Map<String, RagChatSession>` | Template run messages per session |
| `_templateActiveRunIdBySessionKey` | `Map<String, String?>` | Active template run ID per session |
| `_templateRunSnapshotBySessionKey` | `Map<String, TemplateRunSnapshot?>` | Latest template run status snapshot per session |
| `_templateRunSnapshot` | `TemplateRunSnapshot?` | Derived — snapshot for the currently viewed template session |

### Shared
| Field | Type | Purpose |
|---|---|---|
| `_workspaces` | `List<RagWorkspace>` | All workspaces loaded from backend |
| `_sessions` | `List<RagSession>` | Sessions for active workspace |
| `_isStreaming` | `bool` | Derived — true if currently-viewed RAG session is streaming |
| `_ingestionGeneration` | `int` | Incremented on mode/workspace switch to invalidate stale ingestion SSE contexts |

---

## 3. Initialization Flow

```
initState()
  └─ _loadWorkspaces()
       ├─ fetch all workspaces from backend
       ├─ restore last active workspaceId + sessionId from SharedPreferences
       ├─ select first workspace if none persisted
       ├─ _loadSessionsForWorkspace(workspaceId)
       │    └─ fetch sessions list from backend
       └─ _hydrateActiveSessionFromBackend()
            ├─ fetch message history for active session
            ├─ populate _ragChatsBySessionKey (or VDR/template equivalent)
            └─ _recoverInProgressRagQuery() if RAG mode
                 └─ kick off recovery polling loop if backend reports active query
```

After init, `_reconcileAllModesWithBackend()` runs to start background recovery for all modes:
- `_recoverInProgressRagQueriesAcrossSessions()` — RAG
- `_recoverInProgressVdrRuns()` — VDR
- `_recoverInProgressTemplateRuns()` — Template

---

## 4. Mode / Workspace / Session Change Flows

### Mode Switch (`_setMode`)
1. Persist previous session state.
2. Set `_currentMode`.
3. Increment `_ingestionGeneration` (invalidates any in-flight ingestion SSE).
4. Reload workspaces and sessions for the new mode.
5. Call `_hydrateActiveSessionFromBackend()` for the new active session.
6. Call `_syncActiveSessionRunFlags()` to derive `_isStreaming`, `_isDueDiligenceRunning`, etc. for the newly active session.

### Workspace Switch (`_selectWorkspace`)
1. Persist `_activeWorkspaceId` to SharedPreferences.
2. Load sessions list for the new workspace.
3. Restore or default the active session.
4. Call `_hydrateActiveSessionFromBackend()`.
5. Call `_syncActiveSessionRunFlags()`.

### Session Switch (`_selectSession`)
1. Persist `_activeSessionId`.
2. Call `_hydrateActiveSessionFromBackend()` (loads message history if not already in map).
3. Call `_syncActiveSessionRunFlags()`.

### Navigation Away and Back (tab switches)
The widget **remains mounted** throughout navigation (it is kept in the widget tree). All per-session state maps retain their values. When the user returns:
- `_syncActiveSessionRunFlags()` is called to refresh derived booleans from the maps.
- Any in-progress recovery loops continue running silently in the background.
- If streaming completed while away, `updateTargetSession` (see §6) already updated `_ragStreamingBySessionKey` and called `setState(_syncActiveSessionRunFlags)`, so the UI reflects the correct state on return.

---

## 5. `_syncActiveSessionRunFlags` — Derived Flag Sync

Called after any state change that could affect what the current view should show. Reads from the per-session maps and writes the derived scalar booleans used by the UI.

```
_syncActiveSessionRunFlags()
  if mode == localChat:
    streamKey = "$_activeWorkspaceId::$_activeSessionId"
    chatStreaming = _ragStreamingBySessionKey[streamKey] ?? false
    lastMsg = active session's last message (if any)
    lastMsgTerminal = lastMsg.status == done || lastMsg.status == error
    _isStreaming = chatStreaming && !lastMsgTerminal   ← terminal-message guard
  if mode == dueDiligence:
    vdrKey = "$_activeWorkspaceId::$_activeSessionId"
    _isDueDiligenceRunning = _vdrActiveRunIdBySessionKey[vdrKey] != null
    _dueDiligenceRunSnapshot = _vdrRunSnapshotBySessionKey[vdrKey]
  if mode == template:
    tKey = "$_activeWorkspaceId::$_activeSessionId"
    _templateRunSnapshot = _templateRunSnapshotBySessionKey[tKey]
```

**Terminal-message guard (bug fix):** The backend's "active queries" list can briefly lag behind the frontend completing or failing a query. Without the guard, a stale `true` in `_ragStreamingBySessionKey` from the recovery poller would cause `_isStreaming = true` even when the last message already showed `done` or `error`. The guard forces `_isStreaming = false` in that case, making the streaming indicator derived from the actual message state rather than from the streaming map alone.

---

## 6. Message Send / Streaming Flow (RAG Chat)

```
User submits question
  └─ _sendRagMessage(question)
       ├─ append optimistic Message(status: sending) to session
       ├─ capture closure: targetMode, targetWorkspaceId, targetSessionId
       ├─ set _ragStreamingBySessionKey[streamKey] = true
       ├─ setState(_syncActiveSessionRunFlags)   → _isStreaming = true → loader appears
       │
       ├─ call RagService.streamRagResponse(question)   (SSE)
       │    emit: token | final | error | done
       │
       ├─ token event:
       │    updateTargetSession(append token to last message, status: streaming)
       │
       ├─ final event:
       │    updateTargetSession(set full answer text, status: done)
       │    _ragStreamingBySessionKey[streamKey] = false
       │    setState(_syncActiveSessionRunFlags)   → _isStreaming = false → loader clears
       │
       ├─ error event:
       │    updateTargetSession(set error text, status: error)
       │    _ragStreamingBySessionKey[streamKey] = false
       │    setState(_syncActiveSessionRunFlags)
       │
       └─ done event (stream closed without final):
            _ragStreamingBySessionKey[streamKey] = false
            setState(_syncActiveSessionRunFlags)
```

If SSE fails entirely, a fallback non-streaming API call is attempted. On failure, the last message is updated to `status: error` with a retry-able error message.

### `updateTargetSession` Closure Pattern

The closure captures `targetMode`, `targetWorkspaceId`, `targetSessionId` at **send time**. Every background async update (token, final, error, recovery) goes through this closure:

```dart
void updateTargetSession(Function(RagChatSession) updater, {bool updateStreamingFlag = false}) {
  final target = getSessionMap()[targetMode]?["$targetWorkspaceId::$targetSessionId"];
  if (target == null) return;

  if (isTargetSessionActiveView()) {
    // User is looking at this exact session → update and sync UI flags
    setState(() {
      updater(target);
      if (updateStreamingFlag) _syncActiveSessionRunFlags();
    });
  } else {
    // User is on a different tab/session → update silently, still sync flags
    updater(target);
    if (updateStreamingFlag && mounted) setState(_syncActiveSessionRunFlags);
  }
}
```

The `else` branch (user on different tab) also calls `setState(_syncActiveSessionRunFlags)` so that when streaming finishes on a background session, the *currently viewed* mode's loader correctly clears — this is critical for the scenario where the user leaves the RAG tab mid-stream.

---

## 7. RAG Recovery Flows

### `_recoverInProgressRagQueriesAcrossSessions`
Runs at startup and after mode switches. Iterates all known sessions and calls `_recoverInProgressRagQuery` for any session the backend reports as having an active query. Skips sessions already in `_ragRecoveryLoopActiveSessionKeys`.

### `_recoverInProgressRagQuery(workspaceId, sessionId)`
Polling recovery loop for a single session:

```
1. Check backend: fetchActiveRagQueries(workspaceId, sessionId)
2. If empty:
     set _ragStreamingBySessionKey[key] = false
     if this is the currently active session: setState(_syncActiveSessionRunFlags)
     else: setState(() {})   ← safe no-op rebuild
     return
3. If non-empty (query still running):
     set _ragStreamingBySessionKey[key] = true
     if this is active session: setState(_syncActiveSessionRunFlags)  → loader shows
     poll every 3s:
       if query finishes:
         set _ragStreamingBySessionKey[key] = false
         if active: setState(_syncActiveSessionRunFlags) + _hydrateActiveSessionFromBackend()
         else: setState(() {})
         break
4. On exception:
     set _ragStreamingBySessionKey[key] = false
     if active: setState(_syncActiveSessionRunFlags)
     else: setState(() {})
```

The conditional `isTargetSessionStillActive` check (not `isTargetSessionActiveView`) is used here because this runs across sessions. Using `setState(_syncActiveSessionRunFlags)` unconditionally would re-derive VDR/Template flags from the wrong session's data when the user is on a different mode tab.

---

## 8. VDR (Due Diligence) Run Flow

### Starting a Run
```
_startDueDiligenceRun()
  ├─ POST to backend: start VDR run for activeWorkspaceId + activeSessionId
  ├─ get runId from response
  ├─ set _vdrActiveRunIdBySessionKey[vdrKey] = runId
  ├─ setState(_syncActiveSessionRunFlags)  → _isDueDiligenceRunning = true
  └─ _pollVdrRunStatus(runId, vdrKey)   (polling loop)
```

### VDR Status Polling
```
_pollVdrRunStatus(runId, vdrKey)
  loop every 5s:
    fetch run status from backend
    update _vdrRunSnapshotBySessionKey[vdrKey]
    if active session: setState(_syncActiveSessionRunFlags)  → updates snapshot display
    if status == completed || failed:
      _vdrActiveRunIdBySessionKey[vdrKey] = null
      setState(_syncActiveSessionRunFlags)  → _isDueDiligenceRunning = false
      if active: _hydrateActiveSessionFromBackend()   (loads completed run results)
      break
```

### VDR Recovery (`_recoverInProgressVdrRuns`)
Runs at startup. For each workspace+session with a stored `_vdrActiveRunIdBySessionKey`, re-attaches the polling loop. Prevents duplicate loops via a local tracking set (similar to RAG recovery).

### VDR Follow-up Chat
After a run completes, the user can send follow-up messages. These go through the same `_sendRagMessage` → SSE → `updateTargetSession` flow but target `_dueDiligenceChatsBySessionKey` instead of `_ragChatsBySessionKey`. The `_isStreaming` flag is NOT used for VDR follow-up; the VDR panel has its own loading indicator derived from `_isDueDiligenceRunning`.

---

## 9. Template Run Flow

### Starting a Run
```
_startTemplateRun()
  ├─ POST to backend: start template run
  ├─ set _templateActiveRunIdBySessionKey[tKey] = runId
  ├─ setState(_syncActiveSessionRunFlags)
  └─ _pollTemplateRunStatus(runId, tKey)
```

### Template Status Polling
```
_pollTemplateRunStatus(runId, tKey)
  loop every 5s:
    fetch run status
    update _templateRunSnapshotBySessionKey[tKey]
    if active session: setState(_syncActiveSessionRunFlags)  → _templateRunSnapshot updated
    if completed || failed:
      _templateActiveRunIdBySessionKey[tKey] = null
      setState(_syncActiveSessionRunFlags)
      if active: _hydrateActiveSessionFromBackend()
      break
```

### Template Recovery (`_recoverInProgressTemplateRuns`)
Identical pattern to VDR recovery — re-attaches polling loops for any in-progress template runs found in `_templateActiveRunIdBySessionKey` at startup.

---

## 10. Workspace Persistence

`_saveWorkspaces()` writes to `SharedPreferences`. **Only metadata is persisted**, never message history:
- Active workspace ID
- Active session ID
- Session list (IDs, names, timestamps)

Message history is always re-fetched from the backend via `_hydrateActiveSessionFromBackend()`. This means:
- App restart: previous session is restored, messages are re-fetched
- Workspace/session switch: messages are re-fetched on demand (cached in the per-session maps once loaded)
- Background sessions: message history stays in memory but is NOT written to disk

---

## 11. Chat Panel UI Controls

`lib/widgets/rag_chat/chat_panel.dart` renders the message list and input.

| State | Visual |
|---|---|
| `messages.isEmpty` | Empty state placeholder (no chat started) |
| `isStreaming == true` | Three-dot animated loader appended after last message |
| Last message `status == error` | Inline retry button on that message |
| `isStreaming == true` | Input field and send button disabled |
| Token limit approaching | Warning banner in input area |

The `isStreaming` prop passed to `ChatPanel` is the derived `_isStreaming` scalar — it never directly reads from `_ragStreamingBySessionKey`. This means the terminal-message guard in `_syncActiveSessionRunFlags` is the single source of truth for whether the loader appears.

### Retry Flow
1. User taps retry on a failed message.
2. The failed message is removed from the session.
3. `_sendRagMessage` is called again with the original question text.
4. Normal send/stream flow resumes.

---

## 12. Edge Cases and Peculiar Behaviors

### Stale SSE Context (Ingestion)
`_ingestionGeneration` is an integer counter. Each ingestion SSE listener captures the generation value at start time. If `_ingestionGeneration` changes (mode/workspace switch) before the ingestion SSE completes, the listener's captured value no longer matches the current value, and it discards all subsequent events silently. This prevents stale ingestion progress from appearing after a workspace switch.

### Duplicate Recovery Loop Prevention
`_ragRecoveryLoopActiveSessionKeys` is checked before starting a recovery loop. If the key is already present, the new call returns immediately. This prevents multiple concurrent polling loops for the same session that would each try to set streaming flags and call setState.

### Session ID Aliasing
After creating a new session, the backend may return a canonical session ID that differs from a client-generated temporary ID. A remapping pass updates all map keys from the temporary ID to the canonical ID. Any in-flight async closures that captured the old ID will update the wrong (now-absent) map key, producing a safe no-op rather than corrupting state.

### Blocked Session IDs
Certain session IDs are reserved or blocked at the backend. Attempting to start a run on a blocked session shows an inline error; the streaming/running flags are never set, so no loader appears.

### Background Session Completing While on Different Tab
Scenario: user sends a RAG question on Session A, switches to VDR tab, RAG answer arrives.

1. SSE `final` event fires → `updateTargetSession` else-branch runs.
2. Message in Session A updated to `status: done`.
3. `_ragStreamingBySessionKey["ws::sessionA"] = false`.
4. `setState(_syncActiveSessionRunFlags)` runs — but `_currentMode == dueDiligence`, so it syncs VDR flags (not RAG flags). `_isStreaming` is not touched (it's only set in the `localChat` branch).
5. User returns to RAG tab → `_syncActiveSessionRunFlags()` is called on tab re-entry → sees `_ragStreamingBySessionKey["ws::sessionA"] = false` + last message `status: done` → `_isStreaming = false`. Loader never appears.

### Recovery Poller Sees Stale Backend Active-Query Entry
Scenario: frontend completed/failed a query (message is `done`/`error`), but the backend's active-query list still shows it as running.

1. `_recoverInProgressRagQuery` sets `_ragStreamingBySessionKey[key] = true`.
2. `_syncActiveSessionRunFlags` runs: `chatStreaming = true`, but `lastMsgTerminal = true` (message is already done/error).
3. Terminal-message guard: `_isStreaming = chatStreaming && !lastMsgTerminal = true && !true = false`.
4. Loader does NOT appear despite the stale backend data.
5. On the next polling tick, the backend catches up and returns empty active queries → `_ragStreamingBySessionKey[key] = false` → steady state restored.

---

## 13. Key Helper Functions

| Function | Purpose |
|---|---|
| `isTargetSessionActiveView()` | Returns true only if `_currentMode`, `_activeWorkspaceId`, `_activeSessionId` all match the closure's captured targets |
| `isTargetSessionStillActive(sessionId, workspaceRef)` | Similar check for localChat mode only (used in recovery to decide whether to call `_syncActiveSessionRunFlags` or safe `setState(() {})`) |
| `_syncActiveSessionRunFlags()` | Derive `_isStreaming`, `_isDueDiligenceRunning`, `_dueDiligenceRunSnapshot`, `_templateRunSnapshot` from per-session maps |
| `_hydrateActiveSessionFromBackend()` | Fetch and cache message history for the active session; trigger recovery if needed |
| `_reconcileAllModesWithBackend()` | Entry point for all startup recovery loops across all three modes |
| `_saveWorkspaces()` | Persist workspace/session metadata to SharedPreferences |

---

## 14. File Locations

| File | Role |
|---|---|
| `lib/widgets/rag_chat/rag_chat_page.dart` | All state management (5700+ lines) |
| `lib/widgets/rag_chat/chat_panel.dart` | Message list + input UI |
| `lib/models/chat_models.dart` | `MessageStatus` enum, `RagChatSession`, `Message` models |
| `lib/services/rag_service.dart` | Backend API calls: SSE streaming, `fetchActiveRagQueries`, `fetchWorkspaceContent` |
| `lib/models/workspace_models.dart` | `RagWorkspace`, `RagSession`, `VdrRunSnapshot`, `TemplateRunSnapshot` |
