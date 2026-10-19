# AI-CODER v0.6.0-rc.2 GUI Convergence

## Goal

Bring the real Code-OSS UI in line with the combined AI-CODER design without reintroducing the old Workbench prototype's simulated backend. Native Code-OSS owns normal IDE surfaces; AI-CODER owns AI task control and evidence.

## Final combined layout

```text
Native Explorer / AI Tasks | Native Editor / Diff | AI Task Workbench
---------------------------------------------------------------
Problems / Terminal / AI-CODER Evidence (Verification / Activity / Checkpoints)
```

The AI Task Workbench can be moved to the Code-OSS Secondary Side Bar to match the intended left-editor-right composition.

## Implemented surfaces

### Task
- active task/status/worktree
- conversation
- context sources with reason/score/clipping evidence
- pending reviewed changes
- native Open Diff
- Apply-to-Main and Undo
- compact Chat/Plan/Agent/Review composer

### Models
- provider selection
- model and effort selection
- grouped provider-backed model cards
- capability provenance (`supported`, `unsupported`, `unknown`)
- provider catalog refresh
- Codex/OpenAI-compatible connection controls

### Architecture
- lifecycle timeline
- route/provider/model/effort/reason
- context evidence summary
- checkpoint/action history
- runtime qualification report

### Native Explorer
- AI Tasks tree contributed beside the real project tree
- selecting a task activates it in the AI Task Workbench

### AI-CODER Evidence panel
- Verification results
- AI Activity
- Checkpoints

## Explicit non-goals

- The HTML workbench does not recreate the native editor, Explorer, Git, Terminal, Problems, or diff editor.
- The legacy `reference/workbench/` remains reference-only and is not an execution authority.
- Model cards display real provider/catalog capability evidence; they do not invent AI Model Selector benchmark ratings.
- Native Windows packaged-app qualification is still pending.

## Recommended placement

1. Keep Explorer in the Primary Side Bar.
2. Keep `AI Tasks` visible in Explorer.
3. Move `AI-CODER / AI Task Workbench` to the Secondary Side Bar.
4. Open `AI-CODER Evidence` in the bottom Panel when verification/recovery detail is needed.

This produces the intended simple three-panel coding layout while preserving native Code-OSS behavior.
