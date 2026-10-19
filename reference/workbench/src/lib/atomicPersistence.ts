import { PersistenceWorkerLog } from '../types';

export interface ConcurrencySimulationResult {
  strategy: 'naive_direct_write' | 'hardened_atomic_replace';
  totalOperations: number;
  successfulWrites: number;
  corruptedWrites: number;
  logs: PersistenceWorkerLog[];
  finalContentJson: string;
}

/**
 * Simulates concurrent writes from multiple background workers to ~/.ai-coder/settings.json
 */
export async function simulateConcurrency(
  strategy: 'naive_direct_write' | 'hardened_atomic_replace',
  workerCount = 10
): Promise<ConcurrencySimulationResult> {
  const logs: PersistenceWorkerLog[] = [];
  let successfulWrites = 0;
  let corruptedWrites = 0;

  let currentSettingsVersion = 100;
  let persistedSettings = {
    theme: 'dark',
    defaultModel: 'codex-davinci-v2',
    version: currentSettingsVersion,
    lastWorker: 'initial',
    updatedAt: new Date().toISOString()
  };

  // Simulating in-process lock for hardened strategy
  let lockAcquired = false;

  for (let i = 1; i <= workerCount; i++) {
    const timestamp = new Date().toISOString().slice(11, 23);
    const workerVersion = currentSettingsVersion + i;

    if (strategy === 'naive_direct_write') {
      // Direct Path.write_text() simulation:
      // In concurrent environments, 30% of workers hit an interleaved write window
      const hasInterleavedCollision = i % 3 === 0;

      if (hasInterleavedCollision) {
        corruptedWrites++;
        logs.push({
          workerId: i,
          timestamp,
          strategy,
          outcome: 'race_corruption_detected',
          payloadVersion: workerVersion,
          details: `Direct Path.write_text collided with simultaneous Worker #${i - 1}. Truncated byte buffer or invalid JSON syntax written to ~/.ai-coder/settings.json.`
        });
      } else {
        successfulWrites++;
        persistedSettings = {
          ...persistedSettings,
          version: workerVersion,
          lastWorker: `Worker #${i}`,
          updatedAt: timestamp
        };
        logs.push({
          workerId: i,
          timestamp,
          strategy,
          outcome: 'success',
          payloadVersion: workerVersion,
          details: `Direct write completed without synchronization lock.`
        });
      }
    } else {
      // Hardened Atomic Replace simulation:
      // Mutex lock + temporary file (.ai-coder/settings.json.tmp.pid) + flush + atomic rename
      const tempFileName = `settings.json.tmp.${Math.floor(Math.random() * 9000 + 1000)}`;

      // Worker acquires lock, writes to private temp file, atomically replaces
      successfulWrites++;
      persistedSettings = {
        ...persistedSettings,
        version: workerVersion,
        lastWorker: `Worker #${i}`,
        updatedAt: timestamp
      };

      logs.push({
        workerId: i,
        timestamp,
        strategy,
        outcome: 'success',
        payloadVersion: workerVersion,
        details: `[Mutex Locked] Wrote to '${tempFileName}' -> fsync flushed -> atomic os.replace() rename into settings.json.`
      });
    }
  }

  return {
    strategy,
    totalOperations: workerCount,
    successfulWrites,
    corruptedWrites,
    logs,
    finalContentJson: JSON.stringify(persistedSettings, null, 2)
  };
}
