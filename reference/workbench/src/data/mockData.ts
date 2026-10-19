import { ModelMetadata, RepoFile, ConformanceVector, TaskWorktree } from '../types';

export const INITIAL_MODELS: ModelMetadata[] = [
  {
    id: 'codex-davinci-v2',
    name: 'Codex 2026.1 (Official SDK)',
    provider: 'codex',
    isAvailable: true,
    discoveredAt: '2026-09-28 08:00 UTC',
    source: 'provider_discovery',
    contextCapacityTokens: 128000,
    latencyClass: 'balanced',
    costClass: 'standard',
    codingProfile: 'specialized_coder',
    verifiedCapabilities: true,
    capabilities: {
      structured_agent_plan: 'supported',
      reasoning: 'supported',
      image_input: 'unsupported',
      large_context: 'supported',
      reasoning_effort: 'supported',
      streaming: 'supported',
      native_tool_calling: 'supported',
    },
    discoveryNotes: 'Discovered via official Codex client SDK with verified feature handshake.'
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openai-compatible',
    providerEndpoint: 'https://api.openai.com/v1',
    isAvailable: true,
    discoveredAt: '2026-09-28 08:05 UTC',
    source: 'provider_discovery',
    contextCapacityTokens: 200000,
    latencyClass: 'deep-reasoning',
    costClass: 'premium',
    codingProfile: 'general_flagship',
    verifiedCapabilities: true,
    capabilities: {
      structured_agent_plan: 'supported',
      reasoning: 'supported',
      image_input: 'supported',
      large_context: 'supported',
      reasoning_effort: 'supported',
      streaming: 'supported',
      native_tool_calling: 'supported',
    },
    discoveryNotes: 'Flagship reasoning model with full multimodal & structured JSON output support.'
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'openai-compatible',
    providerEndpoint: 'https://api.openai.com/v1',
    isAvailable: true,
    discoveredAt: '2026-09-28 08:05 UTC',
    source: 'provider_discovery',
    contextCapacityTokens: 128000,
    latencyClass: 'ultra-low',
    costClass: 'budget',
    codingProfile: 'compact_fast',
    verifiedCapabilities: true,
    capabilities: {
      structured_agent_plan: 'supported',
      reasoning: 'unsupported',
      image_input: 'supported',
      large_context: 'supported',
      reasoning_effort: 'unsupported',
      streaming: 'supported',
      native_tool_calling: 'supported',
    },
    discoveryNotes: 'Ultra-low latency model tailored for rapid code completion and quick diff generation.'
  },
  {
    id: 'qwen3-coder-32b-local',
    name: 'Qwen3 Coder 32B (Local)',
    provider: 'ollama',
    providerEndpoint: 'http://localhost:11434',
    isAvailable: true,
    discoveredAt: '2026-09-28 09:12 UTC',
    source: 'provider_discovery',
    contextCapacityTokens: 64000,
    latencyClass: 'balanced',
    costClass: 'free-local',
    codingProfile: 'specialized_coder',
    verifiedCapabilities: true,
    capabilities: {
      structured_agent_plan: 'supported',
      reasoning: 'unsupported',
      image_input: 'unsupported',
      large_context: 'supported',
      reasoning_effort: 'unsupported',
      streaming: 'supported',
      native_tool_calling: 'unsupported', // Note: Notice this!
    },
    discoveryNotes: 'High-performing offline local coding model. Lacks native provider tool calling, but capable of structured code output.'
  },
  {
    id: 'deepseek-r1-distill-32b',
    name: 'DeepSeek R1 Distill 32B (Local)',
    provider: 'ollama',
    providerEndpoint: 'http://localhost:11434',
    isAvailable: true,
    discoveredAt: '2026-09-28 09:15 UTC',
    source: 'provider_discovery',
    contextCapacityTokens: 64000,
    latencyClass: 'deep-reasoning',
    costClass: 'free-local',
    codingProfile: 'specialized_coder',
    verifiedCapabilities: true,
    capabilities: {
      structured_agent_plan: 'supported',
      reasoning: 'supported',
      image_input: 'unsupported',
      large_context: 'supported',
      reasoning_effort: 'supported',
      streaming: 'supported',
      native_tool_calling: 'unsupported',
    },
    discoveryNotes: 'Local chain-of-thought mathematical and algorithmic reasoning engine.'
  },
  {
    id: 'custom-unverified-proxy',
    name: 'Proxy Custom LLM (Manually Added)',
    provider: 'custom',
    providerEndpoint: 'http://proxy.internal.corp:8080/v1',
    isAvailable: true,
    discoveredAt: '2026-09-28 10:20 UTC',
    source: 'manual_user_entry',
    contextCapacityTokens: 32000,
    latencyClass: 'balanced',
    costClass: 'budget',
    codingProfile: 'compact_fast',
    verifiedCapabilities: false, // Unknown should mean unknown!
    capabilities: {
      structured_agent_plan: 'unknown',
      reasoning: 'unknown',
      image_input: 'unknown',
      large_context: 'unknown',
      reasoning_effort: 'unknown',
      streaming: 'supported',
      native_tool_calling: 'unknown',
    },
    discoveryNotes: 'Manually entered endpoint. Capabilities marked UNKNOWN per v0.4.7 strict discovery policy.'
  }
];

export const MOCK_REPOSITORY_FILES: RepoFile[] = [
  // Backend / Docs files that naive alphabetical scans naively read first:
  {
    path: 'backend/archive/legacy_sync_worker_v1.py',
    sizeBytes: 38400,
    characters: 24500,
    language: 'python',
    symbols: ['LegacyWorker', 'sync_records_v1', 'batch_queue'],
    imports: ['time', 'sys', 'logging'],
    isSensitive: false,
    isControlFile: false,
    content: `# Deprecated synchronization worker from 2023
# Contains obsolete schema mappings and manual retry backoffs.
class LegacyWorker:
    def sync_records_v1(self, records):
        """Deprecated batch synchronizer. Do not use in v2 services."""
        pass
`
  },
  {
    path: 'docs/architecture_overview.md',
    sizeBytes: 42000,
    characters: 31000,
    language: 'markdown',
    symbols: ['ArchitectureOverview', 'SystemDiagram', 'NetworkTopology'],
    imports: [],
    isSensitive: false,
    isControlFile: false,
    content: `# System Architecture Overview
This document describes the high-level infrastructure, cloud VPC layout, and message broker clustering for AI-CODER services.
`
  },
  {
    path: 'docs/CONTRIBUTING.md',
    sizeBytes: 15200,
    characters: 12000,
    language: 'markdown',
    symbols: ['CodeOfConduct', 'PRGuidelines'],
    imports: [],
    isSensitive: false,
    isControlFile: false,
    content: `# Contributing Guidelines
How to file pull requests, run linting checks, and execute local tests.
`
  },

  // Core business logic (Active Target & Related)
  {
    path: 'src/checkout/order_service.py',
    sizeBytes: 4200,
    characters: 3850,
    language: 'python',
    symbols: ['OrderService', 'process_checkout', 'validate_inventory', 'PaymentConflictError'],
    imports: ['src.checkout.payment_gateway', 'src.checkout.inventory_client', 'threading'],
    isSensitive: false,
    isControlFile: false,
    content: `"""Order processing service managing checkout state and inventory locks."""
import threading
from src.checkout.payment_gateway import PaymentGateway, PaymentStatus
from src.checkout.inventory_client import InventoryClient

class OrderService:
    def __init__(self, payment_gateway: PaymentGateway, inventory_client: InventoryClient):
        self.gateway = payment_gateway
        self.inventory = inventory_client
        self._lock = threading.Lock()

    def process_checkout(self, order_id: str, amount_cents: int, user_id: str):
        # BUG: race condition here when multiple checkout requests arrive concurrently
        # Missing atomic transaction hold around inventory deduction and payment authorization
        available = self.inventory.check_stock(order_id)
        if not available:
            raise ValueError("Item out of stock")

        auth_result = self.gateway.authorize_charge(order_id, amount_cents)
        if auth_result.status != PaymentStatus.AUTHORIZED:
            return {"status": "failed", "reason": auth_result.error_code}

        self.inventory.decrement_stock(order_id)
        return {"status": "success", "tx_id": auth_result.transaction_id}
`
  },
  {
    path: 'src/checkout/payment_gateway.py',
    sizeBytes: 3100,
    characters: 2750,
    language: 'python',
    symbols: ['PaymentGateway', 'PaymentStatus', 'PaymentResult', 'authorize_charge'],
    imports: ['enum', 'dataclasses', 'uuid'],
    isSensitive: false,
    isControlFile: false,
    content: `"""Payment gateway adapter providing idempotent card authorization."""
from enum import Enum
from dataclasses import dataclass
import uuid

class PaymentStatus(Enum):
    AUTHORIZED = "authorized"
    DECLINED = "declined"
    ERROR = "error"

@dataclass
class PaymentResult:
    status: PaymentStatus
    transaction_id: str
    error_code: str = ""

class PaymentGateway:
    def authorize_charge(self, order_id: str, amount_cents: int) -> PaymentResult:
        # Idempotent tokenized authorization
        tx_id = f"tx_{uuid.uuid4().hex[:12]}"
        return PaymentResult(status=PaymentStatus.AUTHORIZED, transaction_id=tx_id)
`
  },
  {
    path: 'src/checkout/inventory_client.py',
    sizeBytes: 2400,
    characters: 2100,
    language: 'python',
    symbols: ['InventoryClient', 'check_stock', 'decrement_stock'],
    imports: [],
    isSensitive: false,
    isControlFile: false,
    content: `"""Inventory verification and stock reservation client."""
class InventoryClient:
    def __init__(self):
        self._stock_cache = {"item_101": 5, "item_202": 1}

    def check_stock(self, order_id: str) -> bool:
        return self._stock_cache.get(order_id, 0) > 0

    def decrement_stock(self, order_id: str) -> None:
        if order_id in self._stock_cache:
            self._stock_cache[order_id] -= 1
`
  },
  {
    path: 'tests/test_order_service.py',
    sizeBytes: 3600,
    characters: 3150,
    language: 'python',
    symbols: ['test_concurrent_checkout_race_condition', 'test_out_of_stock_rejection'],
    imports: ['pytest', 'src.checkout.order_service', 'src.checkout.payment_gateway', 'concurrent.futures'],
    isSensitive: false,
    isControlFile: false,
    content: `"""Test suite validating concurrency invariants in OrderService."""
import pytest
from concurrent.futures import ThreadPoolExecutor
from src.checkout.order_service import OrderService
from src.checkout.payment_gateway import PaymentGateway
from src.checkout.inventory_client import InventoryClient

def test_concurrent_checkout_race_condition():
    gateway = PaymentGateway()
    inventory = InventoryClient()
    service = OrderService(gateway, inventory)

    # When 5 threads attempt checkout on item_202 (only 1 available)
    results = []
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(service.process_checkout, "item_202", 1500, f"usr_{i}") for i in range(5)]
        for f in futures:
            try:
                results.append(f.result())
            except Exception as e:
                results.append({"status": "exception", "error": str(e)})

    # Invariant: exactly 1 success, other 4 rejected
    successes = [r for r in results if r.get("status") == "success"]
    assert len(successes) == 1, f"Race condition: {len(successes)} checkouts succeeded on 1 item!"
`
  },
  {
    path: 'tests/test_payment_gateway.py',
    sizeBytes: 1800,
    characters: 1600,
    language: 'python',
    symbols: ['test_gateway_authorization_success'],
    imports: ['pytest', 'src.checkout.payment_gateway'],
    isSensitive: false,
    isControlFile: false,
    content: `import pytest
from src.checkout.payment_gateway import PaymentGateway, PaymentStatus

def test_gateway_authorization_success():
    gw = PaymentGateway()
    res = gw.authorize_charge("ord_99", 5000)
    assert res.status == PaymentStatus.AUTHORIZED
`
  },

  // SENSITIVE & CONTROL FILES (MUST ALWAYS BE EXCLUDED)
  {
    path: '.env',
    sizeBytes: 620,
    characters: 510,
    language: 'properties',
    symbols: [],
    imports: [],
    isSensitive: true,
    isControlFile: false,
    content: `DATABASE_URL=postgres://dbuser:s3cr3t_p@ssw0rd@prod-db.internal:5432/main
STRIPE_SECRET_KEY=sk_live_94892482390423094823
ENCRYPTION_SALT=d41d8cd98f00b204e9800998ecf8427e
`
  },
  {
    path: '.env.production',
    sizeBytes: 480,
    characters: 390,
    language: 'properties',
    symbols: [],
    imports: [],
    isSensitive: true,
    isControlFile: false,
    content: `API_KEY=prod_master_key_884912903
SSH_PRIVATE_KEY_PATH=/root/.ssh/id_rsa
`
  },
  {
    path: '.ai-coder/threads/task_101.json',
    sizeBytes: 2400,
    characters: 2100,
    language: 'json',
    symbols: [],
    imports: [],
    isSensitive: false,
    isControlFile: true,
    content: `{"task_id": "task_101", "internal_status": "in_review", "checkpoint_ids": ["chk_84812"]}`
  },
  {
    path: '.ai-coder/checkpoints/chk_84812.bak',
    sizeBytes: 4200,
    characters: 3850,
    language: 'binary',
    symbols: [],
    imports: [],
    isSensitive: false,
    isControlFile: true,
    content: `[BYTE-EXACT SNAPSHOT RECOVERY FILE]`
  }
];

export const CONFORMANCE_VECTORS: ConformanceVector[] = [
  {
    id: 'SEC-01',
    category: 'path_traversal',
    name: 'Parent Directory Traversal (Relative Unix)',
    description: 'Attempts to write or inspect files outside the project root using relative traversal tokens (`../secret.txt`).',
    input: { targetPath: '../secret.txt' },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_PATH_OUTSIDE_WORKSPACE_ROOT',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Workspace boundary is strictly enforced using canonical path resolution and root prefix checks.'
  },
  {
    id: 'SEC-02',
    category: 'path_traversal',
    name: 'Windows System Root Traversal',
    description: 'Attempts to access Windows host system files via absolute path (`C:\\Windows\\System32\\drivers\\etc\\hosts`).',
    input: { targetPath: 'C:\\Windows\\System32\\drivers\\etc\\hosts' },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_ABSOLUTE_SYSTEM_PATH_DENIED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Arbitrary absolute system paths outside the workspace boundary are rejected.'
  },
  {
    id: 'SEC-03',
    category: 'sensitive_data',
    name: 'Default Sensitive File Exclusion (.env)',
    description: 'Attempts to include `.env` in codebase context or proposed patch writes without explicit user bypass.',
    input: { targetPath: '.env', allowSensitive: false },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_SENSITIVE_FILE_PROTECTED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Sensitive environment files containing API keys or credentials must never be read into context or modified.'
  },
  {
    id: 'SEC-04',
    category: 'sensitive_data',
    name: 'Wildcard Production Secrets (.env.production)',
    description: 'Attempts to match `.env.*` production configuration files.',
    input: { targetPath: '.env.production', allowSensitive: false },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_SENSITIVE_FILE_PROTECTED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'All environment variations (.env.production, .env.local, .env.test) are shielded.'
  },
  {
    id: 'SEC-05',
    category: 'control_boundary',
    name: 'AI-CODER Internal State File Isolation',
    description: 'Attempts to access or rewrite `.ai-coder/threads/x.json` internal control records.',
    input: { targetPath: '.ai-coder/threads/task_101.json', allowControl: false },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_INTERNAL_CONTROL_FILE_DENIED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Model and context engines cannot tamper with agent control databases or thread logs.'
  },
  {
    id: 'SEC-06',
    category: 'control_boundary',
    name: 'Checkpoint Snapshot Tamper Protection',
    description: 'Protects byte-exact rollback backups inside `.ai-coder/checkpoints/` from being overwritten by model patches.',
    input: { targetPath: '.ai-coder/checkpoints/chk_01.bak', allowControl: false },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_INTERNAL_CONTROL_FILE_DENIED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Recovery records are read-only to external tasks and strictly guarded by Windows handle safeties.'
  },
  {
    id: 'SEC-07',
    category: 'staleness_protection',
    name: 'Base SHA-256 Staleness Mismatch Detection',
    description: 'Ensures proposed in-memory patch fails validation if disk content has changed since the model read it.',
    input: {
      targetPath: 'src/checkout/order_service.py',
      baseSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      actualSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
    },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_BASE_HASH_MISMATCH_STALE_CHANGE',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Patches cannot be applied over modified or out-of-sync files to prevent silent clobbering.'
  },
  {
    id: 'SEC-08',
    category: 'worktree_isolation',
    name: 'Main-Branch Unmerged Modification Conflict Gate',
    description: 'Detects if the target main repository file was modified while the task worktree was being executed.',
    input: { targetPath: 'src/checkout/order_service.py' },
    expectedAction: 'require_confirmation',
    expectedErrorCode: 'WARN_MAIN_BRANCH_DIRTY_CONFLICT',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Applying worktree to main triggers a second review gate if main-branch state changed.'
  },
  {
    id: 'SEC-09',
    category: 'command_restriction',
    name: 'Destructive Shell Command Rejection',
    description: 'Blocks unvetted shell execution of destructive deletion or partition format commands.',
    input: { command: 'rm -rf / || format C:' },
    expectedAction: 'reject',
    expectedErrorCode: 'ERR_COMMAND_NOT_ALLOWLISTED',
    pythonStatus: 'pass',
    typescriptStatus: 'pass',
    securityInvariant: 'Verification commands must strictly match allowlisted patterns (e.g., pytest, npm test, cargo test).'
  }
];

export const INITIAL_TASKS: TaskWorktree[] = [
  {
    id: 'task-101',
    title: 'Fix OrderService checkout concurrency race condition',
    state: 'review',
    branchName: 'ai-coder/task-101-order-race',
    worktreePath: '~/.ai-coder/worktrees/task-101',
    createdAt: '2026-09-28 09:30',
    updatedAt: '2026-09-28 10:15',
    pendingChangesCount: 2,
    unappliedWorktreeModifications: true,
    hasRecoveryCheckpoints: true,
    filesModified: ['src/checkout/order_service.py', 'tests/test_order_service.py'],
    lastCommitMessage: 'feat(checkout): add threading.Lock around inventory and payment authorization',
    mainBranchConflictRisk: 'none'
  },
  {
    id: 'task-102',
    title: 'Implement in-memory patch compiler with base SHA-256',
    state: 'active',
    branchName: 'ai-coder/task-102-patch-compiler',
    worktreePath: '~/.ai-coder/worktrees/task-102',
    createdAt: '2026-09-28 10:00',
    updatedAt: '2026-09-28 10:45',
    pendingChangesCount: 1,
    unappliedWorktreeModifications: true,
    hasRecoveryCheckpoints: true,
    filesModified: ['src/core/patch_engine.py'],
    lastCommitMessage: 'wip: added replace_exact_text operation handler',
    mainBranchConflictRisk: 'none'
  },
  {
    id: 'task-103',
    title: 'Refactor telemetry logger to atomic file replace',
    state: 'applied',
    branchName: 'ai-coder/task-103-atomic-logger',
    worktreePath: '~/.ai-coder/worktrees/task-103',
    createdAt: '2026-09-27 14:10',
    updatedAt: '2026-09-27 15:40',
    pendingChangesCount: 0,
    unappliedWorktreeModifications: false,
    hasRecoveryCheckpoints: true,
    filesModified: ['src/utils/logger.py'],
    lastCommitMessage: 'merge: task-103 applied cleanly to main',
    mainBranchConflictRisk: 'none'
  },
  {
    id: 'task-104',
    title: 'Experimental Ollama offline embeddings test',
    state: 'active',
    branchName: 'ai-coder/task-104-orphan-experiment',
    worktreePath: '~/.ai-coder/worktrees/task-104',
    createdAt: '2026-09-26 11:20',
    updatedAt: '2026-09-26 11:55',
    pendingChangesCount: 3,
    unappliedWorktreeModifications: true,
    hasRecoveryCheckpoints: false,
    filesModified: ['experiments/ollama_embed.py'],
    lastCommitMessage: 'test: raw prototype script',
    mainBranchConflictRisk: 'high_conflict_detected'
  },
  {
    id: 'task-105',
    title: 'Update markdown documentation for migration v0.4.7',
    state: 'completed',
    branchName: 'ai-coder/task-105-docs-v047',
    worktreePath: '~/.ai-coder/worktrees/task-105',
    createdAt: '2026-09-27 16:00',
    updatedAt: '2026-09-27 17:30',
    pendingChangesCount: 0,
    unappliedWorktreeModifications: false,
    hasRecoveryCheckpoints: true,
    filesModified: ['docs/ROADMAP.md'],
    lastCommitMessage: 'docs: finalize v0.4.7 architectural roadmap and priority table',
    mainBranchConflictRisk: 'none'
  }
];
