import json
from pathlib import Path

from ai_coder.core.task_lifecycle import can_transition, is_transient_state, normalize_task_status

SPEC = Path(__file__).resolve().parents[1] / 'spec' / 'behavior'


def test_shared_task_lifecycle_vectors():
    spec = json.loads((SPEC / 'task-lifecycle-v1.json').read_text(encoding='utf-8'))
    for case in spec['cases']:
        assert can_transition(case['from'], case['to']) is case['allowed'], case['name']
    for state in spec['transientStates']:
        assert is_transient_state(state), state
    assert normalize_task_status('unknown-old-status') == 'recovery_required'


def test_upstream_lock_is_a_real_release_pin():
    lock = json.loads((Path(__file__).resolve().parents[1] / 'code-oss-mvp' / 'upstream.lock.json').read_text(encoding='utf-8'))
    assert lock['repository'] == 'https://github.com/microsoft/vscode.git'
    assert lock['ref'] == '1.139.1'
    assert lock['expectedCommitPrefix'] == '04c0d99'
