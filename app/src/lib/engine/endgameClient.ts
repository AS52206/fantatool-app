import type { OttimizzaInput, OttimizzaResult } from './endgame';

export interface EndgameRequest { id: number; input: OttimizzaInput }
export type EndgameReply = { id: number; result: OttimizzaResult } | { id: number; error: string };
interface Job extends EndgameRequest {
	onResult: (result: OttimizzaResult) => void;
	onError: (error: Error) => void;
}

/** One worker and at most one queued calculation. Only the newest result is published. */
export class EndgameClient {
	private worker: Worker | null = null;
	private active: Job | null = null;
	private pending: Job | null = null;
	private sequence = 0;
	private disposed = false;

	constructor(private readonly createWorker: () => Worker = () =>
		new Worker(new URL('./endgame.worker.ts', import.meta.url), { type: 'module' })) {}

	compute(input: OttimizzaInput, onResult: Job['onResult'], onError: Job['onError']): void {
		if (this.disposed) { onError(new Error('Calcolo finale chiuso.')); return; }
		const job: Job = { id: ++this.sequence, input, onResult, onError };
		if (this.active) { this.pending = job; return; }
		this.start(job);
	}

	private start(job: Job): void {
		this.active = job;
		try {
			if (!this.worker) {
				this.worker = this.createWorker();
				this.worker.onmessage = (event: MessageEvent<EndgameReply>) => this.receive(event.data);
				this.worker.onerror = () => this.fail(new Error('Calcolo finale in background non disponibile.'));
				this.worker.onmessageerror = () => this.fail(new Error('Risposta del calcolo finale non leggibile.'));
			}
			this.worker.postMessage({ id: job.id, input: job.input } satisfies EndgameRequest);
		} catch (error) {
			this.fail(error instanceof Error ? error : new Error(String(error)));
		}
	}

	private receive(reply: EndgameReply): void {
		if (!this.active || !reply || reply.id !== this.active.id || this.disposed) return;
		const completed = this.active;
		this.active = null;
		if (this.pending) {
			const next = this.pending;
			this.pending = null;
			this.start(next);
			return;
		}
		if ('error' in reply) completed.onError(new Error(reply.error));
		else completed.onResult(reply.result);
	}

	private fail(error: Error): void {
		const latest = this.pending ?? this.active;
		this.active = null;
		this.pending = null;
		this.closeWorker();
		if (!this.disposed) latest?.onError(error);
	}

	private closeWorker(): void {
		if (!this.worker) return;
		this.worker.onmessage = null;
		this.worker.onerror = null;
		this.worker.onmessageerror = null;
		this.worker.terminate();
		this.worker = null;
	}

	dispose(): void {
		this.disposed = true;
		this.active = null;
		this.pending = null;
		this.closeWorker();
	}
}
