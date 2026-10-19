from __future__ import annotations

import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog, ttk

from . import __version__
from .application.verification import VerificationService
from .application.api import ApplicationApi
from .application.agent_lifecycle import AgentLifecycleService
from .application.changes import (
    AppliedHistoryPersistenceError, ChangeApplicationService, AppliedAgentChanges,
    UndoHistoryPersistenceError, WorktreeApplyConflictError,
)
from .core.activity import ActivityStore
from .core.checkpoints import Change, CheckpointStore
from .core.codex_provider import CodexProvider
from .core.models import ModelRegistry
from .core.policy import (
    classify_command, decode_text_bytes, is_control_path, is_sensitive_path, read_workspace_bytes,
    read_workspace_text, resolve_workspace_path, write_workspace_bytes, write_workspace_text,
)
from .core.project_profile import create_profile, load_profile
from .core.providers import CredentialBroker
from .core.settings import SettingsStore
from .core.skills import SkillStore
from .core.threads import ThreadStore
from .core.worktrees import WorktreeManager, is_git_repository
from .core.windows_safe_io import register_workspace as register_windows_workspace

APP_TITLE = f"AI-CODER {__version__}"
EDITOR_MAX_BYTES = 2 * 1024 * 1024


class AICoderApp(tk.Tk):
    """Codex-style command center MVP with AI-CODER multi-model routing."""

    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1560x940")
        self.minsize(1180, 720)

        self.project_root: Path | None = None
        self.current_file: Path | None = None
        self.current_file_line_ending = "\n"
        self.current_file_utf8_bom = False
        self.current_thread_id: str | None = None
        self.running_threads: set[str] = set()
        self.codex_boundary_acknowledged = False

        self.settings_store = SettingsStore()
        self.settings = self.settings_store.load()
        self.credentials = CredentialBroker()
        self.registry = ModelRegistry()
        self.verification = VerificationService()
        self.agent_lifecycle: AgentLifecycleService | None = None
        self.change_service: ChangeApplicationService | None = None
        self.application_api: ApplicationApi | None = None

        self.activity: ActivityStore | None = None
        self.project_checkpoints: CheckpointStore | None = None
        self.thread_store: ThreadStore | None = None
        self.skill_store: SkillStore | None = None
        self.worktrees: WorktreeManager | None = None

        self._build_style()
        self._build_menu()
        self._build_ui()
        self._set_status("Open a project folder to begin.")

    # ---------- shell ----------
    def _build_style(self):
        style = ttk.Style(self)
        try:
            style.theme_use("clam")
        except Exception:
            pass

        self.configure(bg="#f4f6f9")
        style.configure("TFrame", background="#f4f6f9")
        style.configure("TLabel", background="#f4f6f9", foreground="#1f2937")
        style.configure("TButton", padding=(8, 5))
        style.configure("Accent.TButton", font=("Segoe UI", 10, "bold"), padding=(12, 6))
        style.configure("Title.TLabel", font=("Segoe UI", 16, "bold"))
        style.configure("Section.TLabel", font=("Segoe UI", 9, "bold"))
        style.configure("Sidebar.Treeview", background="#1f2937", fieldbackground="#1f2937", foreground="#dce6f2", borderwidth=0, rowheight=27)
        style.configure("Sidebar.Treeview.Heading", background="#17212f", foreground="#dce6f2", relief="flat")
        style.map("Sidebar.Treeview", background=[("selected", "#244f7a")], foreground=[("selected", "#ffffff")])
        style.configure("Editor.TNotebook", background="#eef2f7", borderwidth=0)
        style.configure("Editor.TNotebook.Tab", padding=(12, 6))
        style.configure("Bottom.TNotebook", background="#f4f6f9", borderwidth=0)
        style.configure("Bottom.TNotebook.Tab", padding=(10, 5))

    def _build_menu(self):
        bar = tk.Menu(self)

        project = tk.Menu(bar, tearoff=False)
        project.add_command(label="Open Project...", command=self.open_folder)
        project.add_command(label="New Task", command=self.new_thread)
        project.add_separator()
        project.add_command(label="Project Profile", command=self.open_project_profile)
        project.add_command(label="Skills", command=self.manage_skills)
        project.add_separator()
        project.add_command(label="Exit", command=self.destroy)
        bar.add_cascade(label="Project", menu=project)

        ai = tk.Menu(bar, tearoff=False)
        ai.add_command(label="AI Connections", command=self.ai_connections)
        ai.add_command(label="Refresh Changes", command=self.refresh_changes)
        ai.add_command(label="Apply Worktree Changes to Project", command=self.apply_worktree_to_project)
        ai.add_command(label="Undo Last AI Change", command=self.undo_last_change)
        bar.add_cascade(label="AI", menu=ai)

        help_menu = tk.Menu(bar, tearoff=False)
        help_menu.add_command(
            label="About",
            command=lambda: messagebox.showinfo(
                "About AI-CODER",
                f"{APP_TITLE}\n\nStandalone multi-AI coding command center MVP.\n"
                "Projects • persistent threads • parallel agents • worktrees • review • routing",
            ),
        )
        bar.add_cascade(label="Help", menu=help_menu)
        self.config(menu=bar)
        self.bind_all("<Control-s>", lambda _e: self.save_current())
        self.bind_all("<Control-n>", lambda _e: self.new_thread())

    def _build_ui(self):
        # Core task controls exist independently of where they are shown.
        self.mode = tk.StringVar(value="Agent")
        self.routing = tk.StringVar(value=self.settings.get("routingMode", "balanced"))
        self.provider = tk.StringVar(value=self.settings.get("provider", "auto"))
        self.model = tk.StringVar(value=self.settings.get("model", "auto"))
        self.effort = tk.StringVar(value=self.settings.get("effort", "auto"))
        self.include_workspace = tk.BooleanVar(value=True)
        self.use_worktree = tk.BooleanVar(value=True)

        # VS Code-like dark title bar.
        header = tk.Frame(self, bg="#17212f", height=48)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="◆  AI-CODER", bg="#17212f", fg="#f8fafc", font=("Segoe UI", 15, "bold")).pack(side="left", padx=(14, 12))
        self.project_label = tk.Label(header, text="No project open", bg="#17212f", fg="#cbd5e1", font=("Segoe UI", 9))
        self.project_label.pack(side="left")
        self.connection_label = tk.Label(header, text="●  AI: not checked", bg="#17212f", fg="#94a3b8", font=("Segoe UI", 9))
        self.connection_label.pack(side="right", padx=(8, 14))
        tk.Button(header, text="AI Connections", command=self.ai_connections, bg="#eef2f7", fg="#1f2937", relief="flat", padx=10, pady=3).pack(side="right", padx=4)
        tk.Button(header, text="Open Project", command=self.open_folder, bg="#eef2f7", fg="#1f2937", relief="flat", padx=10, pady=3).pack(side="right", padx=4)

        # The root has one left navigation area and one IDE workspace. The workspace
        # itself is split into editor + AI prompt, with a shared bottom panel.
        shell = ttk.Panedwindow(self, orient=tk.HORIZONTAL)
        shell.pack(fill="both", expand=True)

        left_host = tk.Frame(shell, bg="#17212f", width=330)
        workspace = ttk.Panedwindow(shell, orient=tk.VERTICAL)
        self.left_panel = left_host
        self.workspace_panel = workspace
        shell.add(left_host, weight=0)
        shell.add(workspace, weight=1)

        # --- Left: Activity Bar + one sidebar view at a time ---
        activity_bar = tk.Frame(left_host, bg="#111827", width=74)
        activity_bar.pack(side="left", fill="y")
        activity_bar.pack_propagate(False)

        sidebar = tk.Frame(left_host, bg="#1f2937", width=270)
        sidebar.pack(side="left", fill="both", expand=True)
        sidebar.pack_propagate(False)

        self.activity_buttons = {}
        self.activity_buttons["explorer"] = self._activity_button(activity_bar, "▣", "Explorer", lambda: self._show_sidebar("explorer"), active=True)
        self.activity_buttons["search"] = self._activity_button(activity_bar, "⌕", "Search", lambda: self._show_sidebar("search"))
        self.activity_buttons["source"] = self._activity_button(activity_bar, "⑂", "Source", lambda: self._show_sidebar("source"))
        self.activity_buttons["tasks"] = self._activity_button(activity_bar, "✦", "AI Tasks", lambda: self._show_sidebar("tasks"))
        self.activity_buttons["run"] = self._activity_button(activity_bar, "▷", "Run", lambda: self._show_sidebar("run"))
        tk.Frame(activity_bar, bg="#111827").pack(fill="both", expand=True)
        tk.Button(activity_bar, text="⚙\nSettings", command=self.ai_connections, bg="#111827", fg="#cbd5e1", activebackground="#243244", activeforeground="#ffffff", relief="flat", bd=0, font=("Segoe UI", 8), pady=8).pack(fill="x")

        self.sidebar_frames = {}
        for name in ("explorer", "tasks", "search", "source", "run"):
            frame = tk.Frame(sidebar, bg="#1f2937")
            frame.place(relx=0, rely=0, relwidth=1, relheight=1)
            self.sidebar_frames[name] = frame

        # Explorer sidebar.
        explorer = self.sidebar_frames["explorer"]
        explorer_header = tk.Frame(explorer, bg="#1f2937")
        explorer_header.pack(fill="x", padx=10, pady=(10, 6))
        tk.Label(explorer_header, text="EXPLORER", bg="#1f2937", fg="#f8fafc", font=("Segoe UI", 9, "bold")).pack(side="left")
        tk.Button(explorer_header, text="+", command=self.open_folder, bg="#1f2937", fg="#dbeafe", activebackground="#29384b", activeforeground="#ffffff", relief="flat", bd=0, font=("Segoe UI", 13)).pack(side="right")
        self.repo_info = tk.Label(explorer, text="No project", bg="#1f2937", fg="#94a3b8", anchor="w", justify="left", font=("Segoe UI", 9))
        self.repo_info.pack(fill="x", padx=10, pady=(0, 4))
        self.file_tree = ttk.Treeview(explorer, show="tree", style="Sidebar.Treeview", selectmode="browse")
        self.file_tree.pack(fill="both", expand=True, padx=4, pady=4)
        self.file_tree.bind("<Double-1>", self._tree_open)
        explorer_footer = tk.Frame(explorer, bg="#1f2937")
        explorer_footer.pack(fill="x", padx=8, pady=8)
        tk.Button(explorer_footer, text="Project Profile", command=self.open_project_profile, bg="#273548", fg="#e5edf7", activebackground="#33465f", activeforeground="#ffffff", relief="flat", bd=0, pady=5).pack(fill="x")

        # AI Tasks sidebar.
        tasks = self.sidebar_frames["tasks"]
        task_header = tk.Frame(tasks, bg="#1f2937")
        task_header.pack(fill="x", padx=10, pady=(10, 6))
        tk.Label(task_header, text="AI TASKS", bg="#1f2937", fg="#f8fafc", font=("Segoe UI", 9, "bold")).pack(side="left")
        tk.Button(task_header, text="+", command=self.new_thread, bg="#1f2937", fg="#dbeafe", activebackground="#29384b", activeforeground="#ffffff", relief="flat", bd=0, font=("Segoe UI", 13)).pack(side="right")
        task_toolbar = tk.Frame(tasks, bg="#1f2937")
        task_toolbar.pack(fill="x", padx=8, pady=(0, 4))
        tk.Button(task_toolbar, text="+ New Task", command=self.new_thread, bg="#1473e6", fg="#ffffff", activebackground="#0f62c4", activeforeground="#ffffff", relief="flat", bd=0, pady=6).pack(side="left", fill="x", expand=True)
        tk.Button(task_toolbar, text="Rename", command=self.rename_thread, bg="#273548", fg="#e5edf7", activebackground="#33465f", activeforeground="#ffffff", relief="flat", bd=0, padx=7, pady=6).pack(side="left", padx=(5, 0))
        self.thread_tree = ttk.Treeview(tasks, columns=("status",), show="tree headings", selectmode="browse", style="Sidebar.Treeview")
        self.thread_tree.heading("#0", text="Task")
        self.thread_tree.heading("status", text="Status")
        self.thread_tree.column("status", width=70, anchor="center", stretch=False)
        self.thread_tree.pack(fill="both", expand=True, padx=4, pady=4)
        self.thread_tree.bind("<<TreeviewSelect>>", self._on_thread_select)
        tasks_footer = tk.Frame(tasks, bg="#1f2937")
        tasks_footer.pack(fill="x", padx=8, pady=8)
        tk.Button(tasks_footer, text="Skills", command=self.manage_skills, bg="#273548", fg="#e5edf7", activebackground="#33465f", activeforeground="#ffffff", relief="flat", bd=0, pady=5).pack(fill="x")

        # Lightweight placeholders keep the Activity Bar familiar without adding
        # duplicate permanent panes.
        placeholders = {
            "search": ("SEARCH", "Project search will live here in the Code-OSS shell."),
            "source": ("SOURCE CONTROL", "Git state remains separate from AI-reviewed task changes."),
            "run": ("RUN / VERIFICATION", "Use the bottom Verification panel for approved test commands."),
        }
        for name, (title, message) in placeholders.items():
            frame = self.sidebar_frames[name]
            tk.Label(frame, text=title, bg="#1f2937", fg="#f8fafc", font=("Segoe UI", 9, "bold")).pack(anchor="w", padx=10, pady=(10, 8))
            tk.Label(frame, text=message, bg="#1f2937", fg="#94a3b8", wraplength=235, justify="left", font=("Segoe UI", 9)).pack(anchor="w", padx=10)

        # --- Workspace: center editor + right prompt ---
        top = ttk.Panedwindow(workspace, orient=tk.HORIZONTAL)
        workspace.add(top, weight=5)

        center = ttk.Frame(top)
        prompt_panel = tk.Frame(top, bg="#ffffff", width=470, highlightbackground="#d8dee9", highlightthickness=1)
        self.editor_panel = center
        self.prompt_panel = prompt_panel
        top.add(center, weight=3)
        top.add(prompt_panel, weight=2)

        # Center editor and changes live as editor tabs, like VS Code.
        self.center_notebook = ttk.Notebook(center, style="Editor.TNotebook")
        self.center_notebook.pack(fill="both", expand=True)
        self.editor_tab = ttk.Frame(self.center_notebook)
        self.changes_tab = ttk.Frame(self.center_notebook)
        self.center_notebook.add(self.editor_tab, text="Editor")
        self.center_notebook.add(self.changes_tab, text="Changes")
        # Compatibility alias for older code/tests that referred to the former right notebook.
        self.right_notebook = self.center_notebook

        editor_header = ttk.Frame(self.editor_tab, padding=(8, 5))
        editor_header.pack(fill="x")
        self.file_label = ttk.Label(editor_header, text="No file open")
        self.file_label.pack(side="left")
        ttk.Button(editor_header, text="Save", command=self.save_current).pack(side="right")
        self.editor = tk.Text(
            self.editor_tab, undo=True, wrap="none", font=("Consolas", 11), tabs=("2c",),
            bg="#ffffff", fg="#1f2937", insertbackground="#1f2937", relief="flat", bd=0,
            padx=10, pady=8,
        )
        self.editor.pack(fill="both", expand=True)

        changes_header = ttk.Frame(self.changes_tab, padding=(8, 5))
        changes_header.pack(fill="x")
        self.changes_label = ttk.Label(changes_header, text="No changes")
        self.changes_label.pack(side="left")
        ttk.Button(changes_header, text="Refresh", command=self.refresh_changes).pack(side="right")
        self.apply_btn = ttk.Button(changes_header, text="Apply to Main", style="Accent.TButton", command=self.apply_worktree_to_project)
        self.apply_btn.pack(side="right", padx=5)
        self.diff_view = tk.Text(
            self.changes_tab, wrap="none", font=("Consolas", 10), state="disabled",
            bg="#ffffff", fg="#1f2937", relief="flat", bd=0, padx=10, pady=8,
        )
        self.diff_view.pack(fill="both", expand=True)

        # --- Right: one dedicated AI Prompt panel ---
        prompt_header = tk.Frame(prompt_panel, bg="#f8fafc", height=42)
        prompt_header.pack(fill="x")
        prompt_header.pack_propagate(False)
        tk.Label(prompt_header, text="✦  AI Prompt", bg="#f8fafc", fg="#17212f", font=("Segoe UI", 11, "bold")).pack(side="left", padx=12)
        tk.Button(prompt_header, text="⋯", command=self._prompt_options, bg="#f8fafc", fg="#475569", activebackground="#e8edf4", relief="flat", bd=0, font=("Segoe UI", 13)).pack(side="right", padx=8)

        task_identity = tk.Frame(prompt_panel, bg="#ffffff")
        task_identity.pack(fill="x", padx=12, pady=(10, 5))
        self.thread_title = tk.Label(task_identity, text="No task selected", bg="#ffffff", fg="#17212f", font=("Segoe UI", 12, "bold"), anchor="w")
        self.thread_title.pack(side="left", fill="x", expand=True)
        self.thread_status = tk.Label(task_identity, text="", bg="#ffffff", fg="#15803d", font=("Segoe UI", 9, "bold"))
        self.thread_status.pack(side="right")
        self.ai_meta_label = tk.Label(prompt_panel, text="Agent • Auto routing", bg="#ffffff", fg="#64748b", font=("Segoe UI", 8), anchor="w")
        self.ai_meta_label.pack(fill="x", padx=12, pady=(0, 4))

        self.transcript = tk.Text(
            prompt_panel, wrap="word", state="disabled", font=("Segoe UI", 10),
            bg="#ffffff", fg="#243244", relief="flat", bd=0, padx=12, pady=8,
        )
        self.transcript.pack(fill="both", expand=True)

        changes_summary = tk.Frame(prompt_panel, bg="#f8fafc", highlightbackground="#dbe2ea", highlightthickness=1)
        changes_summary.pack(fill="x", padx=12, pady=(4, 8))
        self.ai_changes_summary = tk.Label(changes_summary, text="No pending reviewed changes", bg="#f8fafc", fg="#475569", font=("Segoe UI", 9), anchor="w")
        self.ai_changes_summary.pack(side="left", fill="x", expand=True, padx=9, pady=7)
        self.review_changes_btn = ttk.Button(changes_summary, text="Review Changes", command=self._open_changes_view)
        self.review_changes_btn.pack(side="right", padx=6, pady=5)

        composer = tk.Frame(prompt_panel, bg="#ffffff")
        composer.pack(fill="x", padx=12, pady=(0, 10))
        self.prompt = tk.Text(
            composer, height=5, wrap="word", font=("Segoe UI", 10), bg="#ffffff", fg="#1f2937",
            insertbackground="#1f2937", relief="solid", bd=1, highlightthickness=0, padx=8, pady=7,
        )
        self.prompt.pack(fill="x", pady=(0, 6))
        composer_controls = ttk.Frame(composer)
        composer_controls.pack(fill="x")
        ttk.Checkbutton(composer_controls, text="@codebase", variable=self.include_workspace).pack(side="left")
        ttk.Combobox(composer_controls, textvariable=self.mode, values=["Agent", "Review", "Plan", "Chat"], state="readonly", width=9).pack(side="left", padx=(6, 4))
        self.route_summary_var = tk.StringVar(value="Auto")
        ttk.Button(composer_controls, textvariable=self.route_summary_var, command=self._prompt_options).pack(side="left", padx=2)
        self.send_btn = ttk.Button(composer_controls, text="Send ▶", style="Accent.TButton", command=self.submit_ai)
        self.send_btn.pack(side="right")
        ttk.Button(composer_controls, text="Undo", command=self.undo_last_change).pack(side="right", padx=(0, 5))
        self._update_route_summary()

        # Shared bottom observability panel spans editor + AI prompt, not the sidebar.
        bottom = ttk.Notebook(workspace, height=165, style="Bottom.TNotebook")
        workspace.add(bottom, weight=1)
        self.terminal = tk.Text(bottom, height=8, wrap="word", font=("Consolas", 9), bg="#ffffff", fg="#1f2937", relief="flat", bd=0, padx=8, pady=6)
        self.verification_view = tk.Text(bottom, height=8, wrap="word", font=("Consolas", 9), bg="#ffffff", fg="#1f2937", relief="flat", bd=0, padx=8, pady=6)
        self.verification_view.insert("1.0", "Approved verification command output appears in Terminal.\n")
        self.verification_view.config(state="disabled")
        self.activity_view = tk.Text(bottom, height=8, wrap="word", font=("Consolas", 9), bg="#ffffff", fg="#1f2937", relief="flat", bd=0, padx=8, pady=6)
        bottom.add(self.terminal, text="Terminal")
        bottom.add(self.verification_view, text="Verification")
        bottom.add(self.activity_view, text="AI Activity")

        self.status = tk.Label(self, text="", anchor="w", bg="#e8edf4", fg="#334155", font=("Segoe UI", 8), padx=8, pady=3)
        self.status.pack(fill="x", side="bottom")

        self._show_sidebar("explorer")

    def _activity_button(self, parent: tk.Widget, symbol: str, label: str, command, *, active: bool = False):
        bg = "#1f3b5b" if active else "#111827"
        button = tk.Button(
            parent, text=f"{symbol}\n{label}", command=command, bg=bg, fg="#dbeafe",
            activebackground="#243c58", activeforeground="#ffffff", relief="flat", bd=0,
            font=("Segoe UI", 8), pady=8,
        )
        button.pack(fill="x")
        return button

    def _show_sidebar(self, name: str):
        frame = getattr(self, "sidebar_frames", {}).get(name)
        if frame is not None:
            frame.tkraise()
        for key, button in getattr(self, "activity_buttons", {}).items():
            button.config(bg="#1f3b5b" if key == name else "#111827")

    def _open_changes_view(self):
        self.refresh_changes()
        self.center_notebook.select(self.changes_tab)

    def _update_route_summary(self):
        if not hasattr(self, "route_summary_var"):
            return
        provider = self.provider.get().strip() or "auto"
        model = self.model.get().strip() or "auto"
        if provider == "auto" and model == "auto":
            text = "Auto ▾"
        elif model == "auto":
            text = f"{provider} ▾"
        else:
            text = f"{model} ▾"
        self.route_summary_var.set(text)

    def _prompt_options(self):
        win = tk.Toplevel(self)
        win.title("AI Prompt Options")
        win.geometry("430x355")
        win.transient(self)
        win.grab_set()
        body = ttk.Frame(win, padding=14)
        body.pack(fill="both", expand=True)
        ttk.Label(body, text="AI Prompt Options", font=("Segoe UI", 13, "bold")).grid(row=0, column=0, columnspan=2, sticky="w", pady=(0, 12))

        fields = [
            ("Routing", self.routing, ["balanced", "quality", "fast", "low-cost", "local-only"]),
            ("Provider", self.provider, ["auto", "codex", "openai-compatible", "ollama"]),
            ("Effort", self.effort, ["auto", "low", "medium", "high", "extra-high"]),
        ]
        row = 1
        for label, var, values in fields:
            ttk.Label(body, text=label).grid(row=row, column=0, sticky="w", pady=5)
            ttk.Combobox(body, textvariable=var, values=values, state="readonly").grid(row=row, column=1, sticky="ew", pady=5)
            row += 1
        ttk.Label(body, text="Model").grid(row=row, column=0, sticky="w", pady=5)
        ttk.Entry(body, textvariable=self.model).grid(row=row, column=1, sticky="ew", pady=5)
        row += 1
        ttk.Checkbutton(body, text="Include @codebase context", variable=self.include_workspace).grid(row=row, column=0, columnspan=2, sticky="w", pady=(10, 3))
        row += 1
        ttk.Checkbutton(body, text="Use isolated Git worktree for Agent", variable=self.use_worktree).grid(row=row, column=0, columnspan=2, sticky="w", pady=3)
        row += 1
        ttk.Label(body, text="Use @skill:name in your prompt to attach an explicit project skill.", wraplength=360).grid(row=row, column=0, columnspan=2, sticky="w", pady=(8, 12))
        row += 1
        ttk.Button(body, text="Done", style="Accent.TButton", command=lambda: (self._update_route_summary(), win.destroy())).grid(row=row, column=1, sticky="e")
        body.columnconfigure(1, weight=1)

    def _set_status(self, text: str):
        self.status.config(text=text)
        self.update_idletasks()

    def _set_text(self, widget: tk.Text, text: str):
        widget.config(state="normal")
        widget.delete("1.0", "end")
        widget.insert("1.0", text)
        widget.config(state="disabled")

    def _append_terminal(self, text: str):
        self.terminal.insert("end", text.rstrip() + "\n")
        self.terminal.see("end")

    # ---------- project ----------
    def open_folder(self):
        chosen = filedialog.askdirectory(title="Open AI-CODER Project")
        if not chosen:
            return
        candidate_root = Path(chosen).absolute()
        try:
            # On Windows this captures the selected directory's stable file identity
            # before AI-CODER creates or reads project control data.
            register_windows_workspace(candidate_root, force=True)
        except Exception as exc:
            messagebox.showerror("Unsafe workspace", str(exc))
            return
        self.project_root = candidate_root
        self.project_label.config(text=self.project_root.name)
        self.activity = ActivityStore(self.project_root)
        self.project_checkpoints = CheckpointStore(self.project_root)
        self.thread_store = ThreadStore(self.project_root)
        self.skill_store = SkillStore(self.project_root)
        self.worktrees = WorktreeManager(self.project_root)
        self.agent_lifecycle = AgentLifecycleService(
            registry=self.registry,
            credentials=self.credentials,
            thread_store=self.thread_store,
            skill_store=self.skill_store,
            worktrees=self.worktrees,
            activity=self.activity,
        )
        self.change_service = ChangeApplicationService(
            thread_store=self.thread_store,
            project_checkpoints=self.project_checkpoints,
            worktrees=self.worktrees,
            activity=self.activity,
            verification=self.verification,
        )
        self.application_api = ApplicationApi(
            thread_store=self.thread_store,
            changes=self.change_service,
        )

        git = is_git_repository(self.project_root)
        self.repo_info.config(text=f"{self.project_root.name}\n{'Git repository' if git else 'Folder (no Git worktrees)'}")
        self._populate_files()
        self._refresh_threads()
        threads = self.thread_store.list()
        if not threads:
            record = self.thread_store.create("New task")
            self.current_thread_id = record["id"]
        else:
            self.current_thread_id = threads[0]["id"]
        self._refresh_threads(select_id=self.current_thread_id)
        self._load_current_thread()
        self._refresh_activity()
        self._set_status(f"Project opened: {self.project_root}")

    def _populate_files(self):
        self.file_tree.delete(*self.file_tree.get_children())
        if not self.project_root:
            return
        root_id = self.file_tree.insert("", "end", text=self.project_root.name, open=True, values=("",))
        self._insert_dir(root_id, self.project_root, 0)

    def _insert_dir(self, parent_id, path: Path, depth: int):
        if depth > 8:
            return
        excluded = {"node_modules", ".git", ".ai-coder", ".venv", "venv", "dist", "build", "__pycache__", ".next", "coverage"}
        try:
            entries = sorted(path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        except Exception:
            return
        for child in entries[:600]:
            if child.name in excluded:
                continue
            rel = child.relative_to(self.project_root).as_posix() if self.project_root else child.name
            try:
                resolve_workspace_path(self.project_root, rel, allow_sensitive=True)
            except ValueError:
                continue
            node = self.file_tree.insert(parent_id, "end", text=child.name, values=(rel,))
            if child.is_dir() and not child.is_symlink():
                self._insert_dir(node, child, depth + 1)

    def _tree_open(self, _event=None):
        item = self.file_tree.focus()
        vals = self.file_tree.item(item, "values")
        if not vals or not self.project_root:
            return
        rel = vals[0]
        if not rel:
            return
        path = self.project_root / rel
        if path.is_file():
            self.open_file(path)

    @staticmethod
    def _editor_decode_bytes(data: bytes, rel: str) -> tuple[str, str, bool]:
        text = decode_text_bytes(data, source=rel, max_bytes=EDITOR_MAX_BYTES, reject_nul=True)
        had_bom = text.startswith("\ufeff")
        if had_bom:
            text = text[1:]
        crlf = "\r\n" in text
        without_crlf = text.replace("\r\n", "")
        lone_lf = "\n" in without_crlf
        lone_cr = "\r" in without_crlf
        styles = sum(bool(x) for x in (crlf, lone_lf, lone_cr))
        if styles > 1:
            raise ValueError(f"{rel} uses mixed line endings. AI-CODER's desktop editor refuses it to avoid silently rewriting bytes.")
        line_ending = "\r\n" if crlf else ("\r" if lone_cr else "\n")
        if line_ending != "\n":
            text = text.replace(line_ending, "\n")
        return text, line_ending, had_bom

    @staticmethod
    def _editor_encode_bytes(text: str, rel: str, line_ending: str, utf8_bom: bool) -> bytes:
        if "\x00" in text or "\r" in text:
            raise ValueError("The desktop editor only saves validated UTF-8 text with normalized editor newlines.")
        if line_ending not in {"\n", "\r\n", "\r"}:
            raise ValueError(f"Unsupported line-ending policy for {rel}.")
        output = text if line_ending == "\n" else text.replace("\n", line_ending)
        payload = output.encode("utf-8", errors="strict")
        if utf8_bom:
            payload = b"\xef\xbb\xbf" + payload
        if len(payload) > EDITOR_MAX_BYTES:
            raise ValueError(f"{rel} is too large for the desktop editor ({len(payload)} bytes; limit {EDITOR_MAX_BYTES} bytes).")
        return payload

    def open_file(self, path: Path):
        try:
            if not self.project_root:
                raise ValueError("Open a project first")
            rel = path.relative_to(self.project_root).as_posix()
            is_ctrl = is_control_path(rel)
            canonical = resolve_workspace_path(self.project_root, rel, allow_sensitive=True, allow_control=is_ctrl)
            if is_sensitive_path(rel) or is_sensitive_path(canonical.relative_to(self.project_root)):
                if not messagebox.askyesno("Sensitive file", "This file appears sensitive. Open it locally? It will remain excluded from AI context."):
                    return
            data = read_workspace_bytes(self.project_root, rel, allow_sensitive=True, allow_control=is_ctrl)
            text, line_ending, had_bom = self._editor_decode_bytes(data, rel)
        except Exception as exc:
            return messagebox.showerror("Open file", str(exc))
        self.current_file = canonical
        self.current_file_line_ending = line_ending
        self.current_file_utf8_bom = had_bom
        label = rel
        self.file_label.config(text=label)
        self.editor.delete("1.0", "end")
        self.editor.insert("1.0", text)
        self.center_notebook.select(self.editor_tab)

    def save_current(self):
        if not self.current_file:
            return
        try:
            rel = self.current_file.relative_to(self.project_root).as_posix()
            is_ctrl = is_control_path(rel)
            text = self.editor.get("1.0", "end-1c")
            encoded = self._editor_encode_bytes(
                text, rel, self.current_file_line_ending, self.current_file_utf8_bom,
            )
            write_workspace_bytes(self.project_root, rel, encoded, allow_sensitive=True, allow_control=is_ctrl)
            self._set_status(f"Saved {self.current_file.name}")
        except Exception as exc:
            messagebox.showerror("Save", str(exc))

    def open_project_profile(self):
        if not self.project_root:
            return messagebox.showinfo("Project Profile", "Open a project first.")
        path = create_profile(self.project_root)
        self._populate_files()
        self.open_file(path)

    # ---------- threads / parallel tasks ----------
    def new_thread(self):
        if not self.thread_store:
            return messagebox.showinfo("New Task", "Open a project first.")
        title = simpledialog.askstring("New Task", "Task name:", initialvalue="New task")
        if title is None:
            return
        record = self.thread_store.create(title or "New task")
        self.current_thread_id = record["id"]
        self._refresh_threads(select_id=self.current_thread_id)
        self._load_current_thread()
        self._show_sidebar("tasks")
        self.prompt.focus_set()

    def rename_thread(self):
        record = self._current_thread()
        if not record or not self.thread_store:
            return
        title = simpledialog.askstring("Rename Task", "Task name:", initialvalue=record.get("title", ""))
        if title:
            self.thread_store.rename(record["id"], title)
            self._refresh_threads(select_id=record["id"])
            self._load_current_thread()

    def _refresh_threads(self, select_id: str | None = None):
        self.thread_tree.delete(*self.thread_tree.get_children())
        if not self.thread_store:
            return
        wanted_item = None
        for record in self.thread_store.list():
            status = "RUN" if record["id"] in self.running_threads else str(record.get("status", "ready")).upper()[:8]
            item = self.thread_tree.insert("", "end", iid=record["id"], text=record.get("title", "New task"), values=(status,))
            if record["id"] == (select_id or self.current_thread_id):
                wanted_item = item
        if wanted_item:
            self.thread_tree.selection_set(wanted_item)
            self.thread_tree.focus(wanted_item)

    def _on_thread_select(self, _event=None):
        selection = self.thread_tree.selection()
        if not selection:
            return
        self.current_thread_id = selection[0]
        self._load_current_thread()

    def _current_thread(self) -> dict | None:
        if not self.thread_store or not self.current_thread_id:
            return None
        return self.thread_store.get(self.current_thread_id)

    def _load_current_thread(self):
        record = self._current_thread()
        if record:
            original_history = list(record.get("actionHistory") or [])
            recovered_history = self._task_action_history(record)
            if recovered_history != original_history and self.thread_store:
                record = self.thread_store.get(record["id"]) or record
        if not record:
            self.thread_title.config(text="No task selected")
            self.thread_status.config(text="")
            self._set_text(self.transcript, "")
            return
        self.thread_title.config(text=record.get("title", "New task"))
        status = "Running" if record["id"] in self.running_threads else str(record.get("status", "ready")).replace("_", " ").title()
        status_key = status.lower()
        status_color = "#15803d"
        if "review" in status_key:
            status_color = "#b45309"
        elif "fail" in status_key or "error" in status_key:
            status_color = "#b91c1c"
        elif "recover" in status_key:
            status_color = "#b91c1c"
        elif "ready" in status_key:
            status_color = "#64748b"
        self.thread_status.config(text=status, fg=status_color)
        chunks = []
        for msg in record.get("messages", []):
            role = str(msg.get("role", "assistant")).upper()
            chunks.append(f"{role}\n{msg.get('content', '')}\n")
        self._set_text(self.transcript, "\n".join(chunks) or "Describe a task for AI-CODER. Each task keeps its own context and history.\n")
        self.send_btn.config(state="disabled" if record["id"] in self.running_threads else "normal")
        self._refresh_task_info(record)
        self.refresh_changes()

    def _refresh_task_info(self, record: dict | None = None):
        record = record or self._current_thread()
        if not record:
            if hasattr(self, "ai_meta_label"):
                self.ai_meta_label.config(text="Agent • Auto routing")
            return
        execution = record.get("execution") or {}
        worktree = record.get("worktree") or {}
        parts = []
        display = execution.get("displayName") or execution.get("model")
        if display:
            parts.append(str(display))
        else:
            parts.append("Auto model")
        effort = execution.get("effort")
        if effort and effort != "auto":
            parts.append(str(effort).title())
        branch = worktree.get("branch") if worktree.get("enabled") else None
        if branch:
            parts.append(f"Worktree: {branch}")
        elif worktree:
            parts.append("Main project")
        if record.get("lastError"):
            parts.append("Last run failed")
        if hasattr(self, "ai_meta_label"):
            self.ai_meta_label.config(text=" • ".join(parts))

    # ---------- skills ----------
    def manage_skills(self):
        if not self.skill_store:
            return messagebox.showinfo("Skills", "Open a project first.")
        win = tk.Toplevel(self)
        win.title("Project Skills")
        win.geometry("820x560")
        win.transient(self)
        pane = ttk.Panedwindow(win, orient=tk.HORIZONTAL)
        pane.pack(fill="both", expand=True, padx=8, pady=8)
        left = ttk.Frame(pane, width=220)
        right = ttk.Frame(pane)
        pane.add(left, weight=1)
        pane.add(right, weight=3)
        skills = tk.Listbox(left)
        skills.pack(fill="both", expand=True, padx=4, pady=4)
        name = tk.StringVar(value="")
        ttk.Entry(left, textvariable=name).pack(fill="x", padx=4, pady=3)
        editor = tk.Text(right, wrap="word", font=("Consolas", 10))
        editor.pack(fill="both", expand=True, padx=4, pady=4)

        def refresh():
            skills.delete(0, "end")
            for item in self.skill_store.list():
                skills.insert("end", item)

        def load(_e=None):
            sel = skills.curselection()
            if not sel:
                return
            n = skills.get(sel[0])
            name.set(n)
            editor.delete("1.0", "end")
            editor.insert("1.0", self.skill_store.read(n))

        def save():
            n = name.get().strip()
            if not n:
                return messagebox.showinfo("Skills", "Enter a skill name.")
            self.skill_store.save(n, editor.get("1.0", "end-1c"))
            refresh()
            self._set_status(f"Saved skill @{n}")

        skills.bind("<<ListboxSelect>>", load)
        ttk.Button(left, text="Save Skill", command=save).pack(fill="x", padx=4, pady=3)
        ttk.Label(right, text="Mention in prompts as @skill:name. Skills are included only when explicitly referenced.", wraplength=540).pack(anchor="w", padx=4, pady=(0, 5))
        refresh()

    # ---------- AI connections ----------
    def ai_connections(self):
        win = tk.Toplevel(self)
        win.title("AI Connections")
        win.transient(self)
        win.geometry("780x500")
        notebook = ttk.Notebook(win)
        notebook.pack(fill="both", expand=True, padx=10, pady=10)

        codex_tab = ttk.Frame(notebook, padding=12)
        notebook.add(codex_tab, text="Codex / ChatGPT")
        ttk.Label(codex_tab, text="OpenAI Codex account connection", font=("Segoe UI", 11, "bold")).pack(anchor="w")
        ttk.Label(
            codex_tab,
            text="Uses the official Codex SDK/account session. Codex is manual-only and runs as an external local agent runtime; its own sandbox may have broader filesystem read access than AI-CODER's context policy. AI-CODER still owns write approval, checkpoints, worktrees, and verification.",
            wraplength=700,
            justify="left",
        ).pack(anchor="w", pady=(4, 10))
        codex_status = tk.StringVar(value="Checking Codex status...")
        ttk.Label(codex_tab, textvariable=codex_status, wraplength=700).pack(anchor="w", pady=(0, 12))
        row = ttk.Frame(codex_tab)
        row.pack(fill="x")

        def set_codex_status(status):
            if status.connected:
                codex_status.set("● " + status.detail)
                self.connection_label.config(text="●  Codex connected")
            elif status.installed:
                codex_status.set("○ " + status.detail)
                self.connection_label.config(text="●  Codex sign-in required")
            else:
                codex_status.set("○ " + status.detail)
                self.connection_label.config(text="●  Codex support not installed")

        def refresh_codex():
            codex_status.set("Checking Codex status...")
            def worker():
                status = CodexProvider().status()
                self.after(0, lambda: set_codex_status(status))
            threading.Thread(target=worker, daemon=True).start()

        def install_codex():
            if not messagebox.askyesno("Install Codex Support", "Install/upgrade the official openai-codex Python SDK for this Python environment?"):
                return
            codex_status.set("Installing Codex SDK...")
            def worker():
                try:
                    ok, output = CodexProvider.install_sdk()
                    self.after(0, lambda: (messagebox.showinfo("Codex", "Codex support installed.") if ok else messagebox.showerror("Codex", output or "Installation failed."), refresh_codex()))
                except Exception as exc:
                    error_message = str(exc)
                    self.after(0, lambda msg=error_message: messagebox.showerror("Codex", msg))
            threading.Thread(target=worker, daemon=True).start()

        def browser_login():
            if not CodexProvider.sdk_available():
                return messagebox.showinfo("Codex", "Install Codex Support first.")
            codex_status.set("Opening ChatGPT sign-in...")
            def worker():
                try:
                    status = CodexProvider().login_chatgpt(on_url=lambda url: self.after(0, lambda: self._set_status("Complete sign-in in browser: " + url)))
                    self.after(0, lambda: set_codex_status(status))
                except Exception as exc:
                    error_message = "Sign-in failed: " + str(exc)
                    self.after(0, lambda msg=error_message: codex_status.set(msg))
            threading.Thread(target=worker, daemon=True).start()

        def device_login():
            if not CodexProvider.sdk_available():
                return messagebox.showinfo("Codex", "Install Codex Support first.")
            codex_status.set("Starting device sign-in...")
            def on_code(url, code):
                self.after(0, lambda: (webbrowser.open(url), messagebox.showinfo("Codex Device Sign-In", f"Open:\n{url}\n\nEnter code:\n{code}")))
            def worker():
                try:
                    status = CodexProvider().login_device_code(on_code=on_code)
                    self.after(0, lambda: set_codex_status(status))
                except Exception as exc:
                    error_message = "Device sign-in failed: " + str(exc)
                    self.after(0, lambda msg=error_message: codex_status.set(msg))
            threading.Thread(target=worker, daemon=True).start()

        def logout():
            def worker():
                try:
                    status = CodexProvider().logout()
                    self.after(0, lambda: set_codex_status(status))
                except Exception as exc:
                    error_message = "Sign-out failed: " + str(exc)
                    self.after(0, lambda msg=error_message: codex_status.set(msg))
            threading.Thread(target=worker, daemon=True).start()

        ttk.Button(row, text="Install Codex Support", command=install_codex).pack(side="left", padx=(0, 4))
        ttk.Button(row, text="Check Status", command=refresh_codex).pack(side="left", padx=4)
        ttk.Button(row, text="Sign in with ChatGPT", command=browser_login).pack(side="left", padx=4)
        ttk.Button(row, text="Device Code", command=device_login).pack(side="left", padx=4)
        ttk.Button(row, text="Sign Out", command=logout).pack(side="left", padx=4)

        api_tab = ttk.Frame(notebook, padding=12)
        notebook.add(api_tab, text="API / Local")
        base = tk.StringVar(value=self.settings.get("openaiCompatibleBaseUrl", "https://api.openai.com/v1"))
        ollama = tk.StringVar(value=self.settings.get("ollamaBaseUrl", "http://127.0.0.1:11434"))
        key = tk.StringVar(value="")
        ttk.Label(api_tab, text="OpenAI-compatible base URL").grid(row=0, column=0, sticky="w", pady=4)
        ttk.Entry(api_tab, textvariable=base, width=60).grid(row=0, column=1, sticky="ew", pady=4)
        ttk.Label(api_tab, text="API key").grid(row=1, column=0, sticky="w", pady=4)
        ttk.Entry(api_tab, textvariable=key, show="*", width=60).grid(row=1, column=1, sticky="ew", pady=4)
        ttk.Label(api_tab, text="Key is session-only; AI_CODER_API_KEY is also supported.").grid(row=2, column=1, sticky="w")
        ttk.Label(api_tab, text="Ollama base URL").grid(row=3, column=0, sticky="w", pady=4)
        ttk.Entry(api_tab, textvariable=ollama, width=60).grid(row=3, column=1, sticky="ew", pady=4)

        def save_api():
            changes = {
                "openaiCompatibleBaseUrl": base.get().strip(),
                "ollamaBaseUrl": ollama.get().strip(),
            }
            self.settings = self.settings_store.update(changes)
            self.credentials.set_session_secret("openai-compatible", key.get().strip())
            lifecycle = self.agent_lifecycle
            if lifecycle is not None and getattr(lifecycle, "catalog_cache", None) is not None:
                try:
                    lifecycle.catalog_cache.clear()
                except Exception:
                    pass
            messagebox.showinfo("AI Connections", "Connection settings saved. Provider model cache cleared.")

        ttk.Button(api_tab, text="Save", command=save_api).grid(row=4, column=1, sticky="e", pady=12)
        api_tab.columnconfigure(1, weight=1)
        refresh_codex()

    # ---------- prompts / execution ----------
    def _system_prompt(self, mode: str, project_context: str, skill_context: str = "") -> str:
        # Backward-compatible facade; prompt semantics now live in the UI-independent lifecycle service.
        return AgentLifecycleService.system_prompt(mode, project_context, skill_context)

    def _selected_text(self) -> str:
        try:
            return self.editor.get(tk.SEL_FIRST, tk.SEL_LAST)
        except Exception:
            return ""

    def submit_ai(self):
        if not self.project_root or not self.thread_store or not self.current_thread_id:
            return messagebox.showinfo("AI-CODER", "Open a project first.")
        if self.current_thread_id in self.running_threads:
            return messagebox.showinfo("Task Running", "This task is already running. Create another task to work in parallel.")
        text = self.prompt.get("1.0", "end-1c").strip()
        if not text:
            return
        if self.provider.get() == "codex" and not self.__dict__.get("codex_boundary_acknowledged", False):
            proceed = messagebox.askyesno(
                "Codex external-runtime boundary",
                "Codex is an external local agent runtime. AI-CODER sends only the context it selected and runs Codex outside the project, but Codex's own sandbox may have broader filesystem read access than AI-CODER's context policy on some versions/platforms.\n\nContinue with Codex for this session?",
            )
            if not proceed:
                return
            self.codex_boundary_acknowledged = True
        record = self._current_thread()
        first_message = not bool(record and record.get("messages"))
        if first_message and record and record.get("title", "").lower() in {"new task", "task"}:
            self.thread_store.rename(record["id"], text.replace("\n", " ")[:72])
        self.thread_store.add_message(self.current_thread_id, "user", text)
        self.thread_store.patch(self.current_thread_id, status="running", lastError="")
        self.prompt.delete("1.0", "end")
        thread_id = self.current_thread_id
        self.running_threads.add(thread_id)
        self._refresh_threads(select_id=thread_id)
        self._load_current_thread()
        self._set_status(f"Running task {thread_id[:8]}… You can switch to another task while it runs.")

        # Persist only the user's latest UI preferences before the worker starts.
        # Background tasks use the immutable snapshot below and never write global
        # preferences, preventing older/longer tasks from overwriting newer choices.
        self.settings = self.settings_store.update({
            "routingMode": self.routing.get(),
            "provider": self.provider.get(),
            "model": self.model.get().strip() or "auto",
            "effort": self.effort.get(),
        })

        snapshot = {
            "thread_id": thread_id,
            "mode": self.mode.get().lower(),
            "routing": self.routing.get(),
            "provider": self.provider.get(),
            "model": self.model.get().strip() or "auto",
            "effort": self.effort.get(),
            "include_workspace": self.include_workspace.get(),
            "use_worktree": self.use_worktree.get(),
            "selection": self._selected_text(),
            "active_file": self.current_file,
            "project_root": self.project_root,
            "settings": dict(self.settings),
        }
        threading.Thread(target=self._ai_worker, args=(text, snapshot), daemon=True).start()

    def _execution_root(self, snapshot: dict) -> tuple[Path, dict]:
        if not self.agent_lifecycle:
            raise RuntimeError("Agent lifecycle service is unavailable; open a project first.")
        return self.agent_lifecycle._execution_root(snapshot)

    def _ai_worker(self, user_text: str, snapshot: dict):
        thread_id = snapshot["thread_id"]
        try:
            if not self.agent_lifecycle:
                raise RuntimeError("Agent lifecycle service is unavailable; open a project first.")
            result = self.agent_lifecycle.run(user_text, snapshot, snapshot.get("settings") or dict(self.settings))
            if result.mode == "agent":
                if result.plan is None:
                    raise RuntimeError("Agent execution completed without a validated plan.")
                self.after(
                    0, self._handle_agent_plan, user_text, result.profile, result.plan,
                    result.execution_root, result.worktree_info, thread_id,
                )
            else:
                self.after(
                    0, self._complete_thread, thread_id,
                    f"Used {result.profile.display_name} • {result.profile.effort} • context {result.context_chars:,} chars",
                )
        except Exception as exc:
            self.after(0, self._complete_thread, thread_id, "Error: " + str(exc))

    def _checkpoint_diff(self, checkpoint: dict) -> str:
        return ChangeApplicationService.checkpoint_diff(checkpoint)

    def _review_change_diff(self, changes: list[Change], diff_text: str, location: str) -> bool:
        """Show the exact proposed patch before the caller creates a checkpoint or writes."""
        win = tk.Toplevel(self)
        win.title("Review proposed changes")
        win.transient(self)
        win.geometry("900x680")
        win.minsize(640, 420)
        ttk.Label(
            win,
            text=f"Review {len(changes)} file(s) for {location}. No files have been written yet.",
            wraplength=860,
        ).pack(fill="x", padx=12, pady=(12, 6))
        body = ttk.Frame(win)
        body.pack(fill="both", expand=True, padx=12, pady=6)
        view = tk.Text(body, wrap="none", font=("Consolas", 9), state="normal")
        ybar = ttk.Scrollbar(body, orient="vertical", command=view.yview)
        xbar = ttk.Scrollbar(body, orient="horizontal", command=view.xview)
        view.configure(yscrollcommand=ybar.set, xscrollcommand=xbar.set)
        view.grid(row=0, column=0, sticky="nsew")
        ybar.grid(row=0, column=1, sticky="ns")
        xbar.grid(row=1, column=0, sticky="ew")
        body.rowconfigure(0, weight=1)
        body.columnconfigure(0, weight=1)
        view.insert("1.0", diff_text or "No textual differences (the proposed contents match the current files).")
        view.configure(state="disabled")
        accepted = {"value": False}

        def finish(value: bool):
            accepted["value"] = value
            win.destroy()

        buttons = ttk.Frame(win, padding=(12, 6, 12, 12))
        buttons.pack(fill="x")
        ttk.Button(buttons, text="Cancel", command=lambda: finish(False)).pack(side="right")
        ttk.Button(buttons, text="Apply reviewed changes", command=lambda: finish(True)).pack(side="right", padx=6)
        win.protocol("WM_DELETE_WINDOW", lambda: finish(False))
        win.grab_set()
        self.wait_window(win)
        return accepted["value"]

    def _pending_diff(self, pending: dict) -> str:
        return ChangeApplicationService.pending_diff(pending)

    def _merge_pending_changes(self, previous: dict, checkpoint: dict) -> dict:
        return ChangeApplicationService.merge_pending_changes(previous, checkpoint)

    def _worktree_pending(self, record: dict, source_root: Path) -> dict:
        return ChangeApplicationService.worktree_pending(record, source_root)

    @staticmethod
    def _new_task_action(*, checkpoint_id: str, scope: str, record: dict, pending_before: dict,
                         pending_after: dict, status_after: str, applied_before: dict | None = None,
                         applied_after: dict | None = None, last_changes_after: list[str] | None = None) -> dict:
        return ChangeApplicationService.new_task_action(
            checkpoint_id=checkpoint_id, scope=scope, record=record, pending_before=pending_before,
            pending_after=pending_after, status_after=status_after, applied_before=applied_before,
            applied_after=applied_after, last_changes_after=last_changes_after,
        )

    def _task_action_history(self, record: dict, *, persist_recovery: bool = True) -> list[dict]:
        state = self.__dict__
        service = state.get("change_service")
        if service is None:
            service = ChangeApplicationService(
                thread_store=state["thread_store"],
                project_checkpoints=state.get("project_checkpoints"),
                worktrees=state.get("worktrees"),
                activity=state.get("activity"),
                verification=state.get("verification"),
            )
        return service.task_action_history(record, persist_recovery=persist_recovery)

    def _handle_agent_plan(self, user_text, profile, plan, execution_root: Path, worktree_info: dict, thread_id: str):
        if not self.change_service:
            return self._complete_thread(thread_id, "Error: change application service is unavailable.")
        try:
            prepared = self.change_service.prepare_agent_plan(plan, execution_root, worktree_info, thread_id)
        except Exception as exc:
            try:
                self.thread_store.add_message(thread_id, "error", str(exc))
                self.thread_store.patch(thread_id, status="failed", lastError=str(exc))
            except Exception:
                pass
            return self._complete_thread(thread_id, "Unable to prepare change review: " + str(exc))

        if not prepared.has_changes:
            self.change_service.record_no_changes(plan, prepared)
            return self._complete_thread(thread_id, "Agent returned no file changes.")

        if not self._review_change_diff(plan.changes, prepared.diff_text, prepared.location):
            self.change_service.reject_plan(plan, prepared)
            return self._complete_thread(thread_id, "Agent change rejected by user.")

        try:
            applied = self.change_service.apply_reviewed_plan(plan, prepared)
        except AppliedHistoryPersistenceError as exc:
            self._complete_thread(thread_id, str(exc))
            return
        except Exception as exc:
            try:
                self.thread_store.add_message(thread_id, "error", str(exc))
                self.thread_store.patch(thread_id, status="failed", lastError=str(exc))
            except Exception:
                pass
            return self._complete_thread(thread_id, "Error: " + str(exc))

        run_commands = bool(applied.allowed_commands) and messagebox.askyesno(
            "Run verification commands?",
            f"Run these commands in {execution_root}?\n\n" + "\n".join(applied.allowed_commands)
            + "\n\nThese commands can execute code from the project. Run them?",
        )
        if run_commands:
            self.change_service.mark_verification_running(applied)
            self._set_status(f"Verifying task {thread_id[:8]}… You can continue using the UI while commands run.")
            threading.Thread(
                target=self._verification_worker, args=(profile, plan, applied), daemon=True,
            ).start()
            return

        results = self.change_service.declined_verification_results(plan)
        return self._finish_agent_apply(profile, plan, applied, results)

    def _complete_thread(self, thread_id: str, status_text: str):
        self.running_threads.discard(thread_id)
        self._refresh_threads(select_id=self.current_thread_id)
        if self.current_thread_id == thread_id:
            self._load_current_thread()
        self._set_status(status_text)
        self._refresh_activity()

    def _verification_worker(self, profile, plan, applied: AppliedAgentChanges):
        try:
            if not self.change_service:
                raise RuntimeError("Change application service is unavailable.")
            results = self.change_service.run_verification(plan, applied.execution_root)
        except Exception as exc:
            results = [{"command": "verification", "skipped": True, "reason": f"Verification worker failed: {exc}"}]
        self.after(0, self._finish_agent_apply, profile, plan, applied, results)

    def _finish_agent_apply(self, profile, plan, applied: AppliedAgentChanges, results: list[dict]):
        try:
            for result in results:
                if result.get("skipped"):
                    self._append_terminal(
                        f"[{applied.thread_id[:8]}] SKIPPED {result['command']}: {result.get('reason', '')}"
                    )
                else:
                    self._append_terminal(
                        f"[{applied.thread_id[:8]}] > {result['command']}\nexit={result.get('code')}\n"
                        f"{result.get('stdout','')}\n{result.get('stderr','')}"
                    )
            if not self.change_service:
                raise RuntimeError("Change application service is unavailable.")
            finalized = self.change_service.finalize_agent_apply(profile, plan, applied, results)
            self._complete_thread(applied.thread_id, finalized.status_text)
        except Exception as exc:
            try:
                self.thread_store.add_message(applied.thread_id, "error", "Post-apply error: " + str(exc))
                self.thread_store.patch(
                    applied.thread_id, lastError=str(exc),
                    verification={"status": "failed", "error": str(exc), "results": results},
                )
            except Exception:
                pass
            self._complete_thread(
                applied.thread_id, "Changes were applied, but a post-apply step failed: " + str(exc)
            )

    def _run_allowed_command(self, command: str, cwd: Path) -> dict:
        # Backward-compatible facade for tests/older callers; execution semantics
        # now live in the UI-independent application service.
        return self.verification.run(command, cwd)

    # ---------- changes / worktree review ----------
    def refresh_changes(self):
        record = self._current_thread()
        if not record:
            self._set_text(self.diff_view, "")
            self.changes_label.config(text="No task selected")
            if hasattr(self, "ai_changes_summary"):
                self.ai_changes_summary.config(text="No pending reviewed changes")
            if hasattr(self, "review_changes_btn"):
                self.review_changes_btn.config(state="disabled")
            return
        worktree = record.get("worktree") or {}
        text = record.get("lastDiff", "") or ""
        if worktree.get("enabled") and worktree.get("path") and self.worktrees:
            path = Path(worktree["path"])
            stale = []
            try:
                pending = self._worktree_pending(record, path)
                text = self._pending_diff(pending)
                stale = []
                for rel, item in pending.items():
                    if read_workspace_text(path, rel) != item.get("after"):
                        stale.append(rel)
                changed = self.worktrees.changed_paths(path)
                applied = record.get("appliedWorktreeChanges", {}) or {}
                already_applied = set(applied) - set(pending)
                for rel in tuple(already_applied):
                    try:
                        if read_workspace_text(path, rel) != applied[rel].get("after"):
                            already_applied.discard(rel)
                    except Exception:
                        already_applied.discard(rel)
                extra = sorted(changed - set(pending) - already_applied)
                if stale:
                    text += "\n\n--- Pending files changed since AI-CODER reviewed them; apply is blocked ---\n" + "\n".join(stale)
                if extra:
                    text += "\n\n--- Worktree changes not included in this pending apply ---\n" + "\n".join(extra)
                if already_applied:
                    text += "\n\n--- Previously applied to the main project ---\n" + "\n".join(sorted(already_applied))
                if self.thread_store and (pending != record.get("pendingChanges", {}) or text != record.get("lastDiff", "")):
                    self.thread_store.patch(record["id"], pendingChanges=pending, lastDiff=text)
            except Exception as exc:
                text = f"Unable to inspect this worktree safely: {exc}"
                pending = {}
            self.changes_label.config(text=f"Worktree • {worktree.get('branch','')}")
            self.apply_btn.config(state="normal" if pending and not stale else "disabled")
            if hasattr(self, "ai_changes_summary"):
                if stale:
                    self.ai_changes_summary.config(text=f"⚠ {len(stale)} reviewed file(s) changed; review again")
                elif pending:
                    self.ai_changes_summary.config(text=f"{len(pending)} reviewed file(s) ready in worktree")
                else:
                    self.ai_changes_summary.config(text="No pending reviewed changes")
            if hasattr(self, "review_changes_btn"):
                self.review_changes_btn.config(state="normal" if (pending or text) else "disabled")
        else:
            self.changes_label.config(text="Main project changes")
            self.apply_btn.config(state="disabled")
            if hasattr(self, "ai_changes_summary"):
                count = len(record.get("lastChanges") or [])
                self.ai_changes_summary.config(text=(f"{count} file(s) changed in main project" if count else "No pending reviewed changes"))
            if hasattr(self, "review_changes_btn"):
                self.review_changes_btn.config(state="normal" if text else "disabled")
        self._set_text(self.diff_view, text or "No diff available for this task yet.")

    def apply_worktree_to_project(self):
        record = self._current_thread()
        if not record or not self.project_root or not self.application_api:
            return
        try:
            preview = self.application_api.dispatch(
                {"type": "worktree.prepare_apply", "taskId": record["id"]}
            )
        except WorktreeApplyConflictError as exc:
            paths = "\n".join(f"• {p}" for p in exc.conflicts[:12])
            return messagebox.showwarning(
                "Main Project Changed",
                "AI-CODER will not overwrite files that changed in the main project after this task's "
                "worktree was created.\n\nConflicts:\n" + paths +
                "\n\nCommit/stash or reconcile those main-project changes, then retry.",
            )
        except ValueError as exc:
            return messagebox.showinfo("Apply Changes", str(exc))
        except Exception as exc:
            return messagebox.showerror("Apply Changes", str(exc))

        review_id = preview["reviewId"]
        paths = list(preview.get("paths") or [])
        changes = [Change(path, "") for path in paths]
        if not self._review_change_diff(changes, preview.get("diffText", ""), "the main project"):
            try:
                self.application_api.dispatch(
                    {"type": "worktree.discard_apply_preview", "reviewId": review_id}
                )
            except Exception:
                pass
            return

        try:
            result = self.application_api.dispatch(
                {"type": "worktree.apply", "reviewId": review_id}
            )
            self._populate_files()
            if self.current_file and self.current_file.exists():
                self.open_file(self.current_file)
                self.center_notebook.select(0)
            self._load_current_thread()
            self._refresh_threads(select_id=record["id"])
            self._refresh_activity()
            self._set_status(result.get("statusText") or f"Applied {len(paths)} reviewed file(s) to main project.")
        except WorktreeApplyConflictError as exc:
            paths_text = "\n".join(f"• {p}" for p in exc.conflicts[:12])
            messagebox.showwarning(
                "Main Project Changed",
                "The main project changed while the diff was open. Nothing was overwritten.\n\n" + paths_text,
            )
        except AppliedHistoryPersistenceError as exc:
            messagebox.showerror("Apply Changes", str(exc))
        except Exception as exc:
            messagebox.showerror("Apply Changes", str(exc))

    def undo_last_change(self):
        if not self.project_root:
            return messagebox.showinfo("Undo", "Open a project first.")
        record = self._current_thread()
        if not record:
            return messagebox.showinfo("Undo", "Select a task first. Undo history is task-local.")
        if not self.application_api:
            return messagebox.showerror("Undo", "Application service is unavailable.")

        try:
            result = self.application_api.dispatch({"type": "task.undo", "taskId": record["id"]})
            if result.get("type") == "task.undo_unavailable":
                return messagebox.showinfo("Undo", "No recoverable AI action is available for this task.")
            self._populate_files()
            if self.current_file and self.current_file.exists():
                self.open_file(self.current_file)
                self.center_notebook.select(0)
            self._load_current_thread()
            self._refresh_threads(select_id=record["id"])
            self._refresh_activity()
            self._set_status(result.get("statusText") or "Restored the latest task action.")
        except UndoHistoryPersistenceError as exc:
            messagebox.showerror("Undo", str(exc))
        except Exception as exc:
            messagebox.showerror("Undo", str(exc))

    # ---------- activity ----------
    def _refresh_activity(self):
        self.activity_view.delete("1.0", "end")
        if not self.activity:
            return
        for event in self.activity.list(100):
            summary = f"{event.get('at','')}  {event.get('action','')}"
            if event.get("threadId"):
                summary += f"  task={str(event.get('threadId'))[:8]}"
            if event.get("model"):
                summary += f"  {event.get('model')}"
            if event.get("files"):
                summary += f"  files={len(event.get('files', []))}"
            self.activity_view.insert("end", summary + "\n")


def main():
    AICoderApp().mainloop()


if __name__ == "__main__":
    main()
