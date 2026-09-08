export interface FileBackupCallbacks {
	onSaved?: (text: string) => void;
	onError?: (error: unknown, text: string) => void;
}

/** One queue per file handle. Enqueue an already serialized snapshot, not a live object. */
export class FileBackupQueue {
	private pending: string | null = null;
	private running: Promise<void> | null = null;

	constructor(
		private readonly write: (text: string) => Promise<void>,
		private readonly callbacks: FileBackupCallbacks = {}
	) {}

	/** An in-flight write finishes first; newer pending snapshots replace older pending ones. */
	enqueue(text: string): void {
		this.pending = text;
		this.start();
	}

	/** Wait for settlement. Write failures are delivered to onError, not thrown from flush. */
	async flush(): Promise<void> {
		while (this.running) await this.running;
	}

	private start(): void {
		if (this.running || this.pending === null) return;
		this.running = this.drain().finally(() => {
			this.running = null;
			// Also cover an enqueue between drain settling and this cleanup microtask.
			this.start();
		});
	}

	private async drain(): Promise<void> {
		while (this.pending !== null) {
			const text = this.pending;
			this.pending = null;
			try {
				await this.write(text);
			} catch (error) {
				// Do not spin on a broken handle. A pending or subsequent update retries.
				try { this.callbacks.onError?.(error, text); } catch { /* Observers cannot stop the queue. */ }
				continue;
			}
			try { this.callbacks.onSaved?.(text); } catch { /* Observers cannot stop the queue. */ }
		}
	}
}
