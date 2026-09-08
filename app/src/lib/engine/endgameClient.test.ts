import { describe, expect, it, vi } from 'vitest';
import { EndgameClient, type EndgameReply, type EndgameRequest } from './endgameClient';
import type { OttimizzaInput, OttimizzaResult } from './endgame';

const input: OttimizzaInput = { candidati: [], budgetResiduo: 10, slotVuoti: 5, modalita: 'MANTRA' };
const result: OttimizzaResult = { stato: 'OK', attivo: true, motivo: 'fixture', percorsi: [] };
class FakeWorker {
	onmessage: ((event: { data: EndgameReply }) => void) | null = null;
	onerror: (() => void) | null = null;
	onmessageerror: (() => void) | null = null;
	postMessage = vi.fn<(request: EndgameRequest) => void>();
	terminate = vi.fn();
	reply(id: number) { this.onmessage?.({ data: { id, result } }); }
}
function fixture() {
	const worker = new FakeWorker();
	const factory = vi.fn(() => worker as unknown as Worker);
	return { worker, factory, client: new EndgameClient(factory) };
}

describe('EndgameClient', () => {
	it('starts lazily and publishes a completed result without recreating worker', () => {
		const { worker, factory, client } = fixture();
		const done = vi.fn();
		expect(factory).not.toHaveBeenCalled();
		client.compute(input, done, vi.fn());
		expect(worker.postMessage).toHaveBeenCalledWith({ id: 1, input });
		worker.reply(1);
		expect(done).toHaveBeenCalledWith(result);
		client.compute(input, done, vi.fn());
		expect(factory).toHaveBeenCalledTimes(1);
		client.dispose();
	});

	it('coalesces queued work and ignores stale replies and results', () => {
		const { worker, client } = fixture();
		const old = vi.fn(), middle = vi.fn(), newest = vi.fn();
		client.compute(input, old, vi.fn());
		client.compute({ ...input, budgetResiduo: 20 }, middle, vi.fn());
		client.compute({ ...input, budgetResiduo: 30 }, newest, vi.fn());
		expect(worker.postMessage).toHaveBeenCalledTimes(1);
		worker.reply(1);
		expect(old).not.toHaveBeenCalled();
		expect(middle).not.toHaveBeenCalled();
		expect(worker.postMessage).toHaveBeenLastCalledWith({ id: 3, input: { ...input, budgetResiduo: 30 } });
		worker.reply(1);
		expect(newest).not.toHaveBeenCalled();
		worker.reply(3);
		expect(newest).toHaveBeenCalledExactlyOnceWith(result);
		client.dispose();
	});

	it('reports worker failure only to newest job, cleans up and permits a fresh attempt', () => {
		const { worker, factory, client } = fixture();
		const oldError = vi.fn(), latestError = vi.fn();
		client.compute(input, vi.fn(), oldError);
		client.compute(input, vi.fn(), latestError);
		worker.onerror?.();
		expect(oldError).not.toHaveBeenCalled();
		expect(latestError).toHaveBeenCalledWith(expect.any(Error));
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(worker.onmessage).toBeNull();
		client.compute(input, vi.fn(), vi.fn());
		expect(factory).toHaveBeenCalledTimes(2);
		client.dispose();
	});

	it('reports startup and postMessage failures without synchronous calculation fallback', () => {
		const error = vi.fn();
		new EndgameClient(() => { throw new Error('unsupported'); }).compute(input, vi.fn(), error);
		expect(error.mock.calls[0][0].message).toBe('unsupported');
		const { worker, client } = fixture();
		worker.postMessage.mockImplementation(() => { throw new Error('clone failed'); });
		client.compute(input, vi.fn(), error);
		expect(error.mock.calls[1][0].message).toBe('clone failed');
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it('reports calculation and message decoding errors', () => {
		const { worker, client } = fixture();
		const error = vi.fn();
		client.compute(input, vi.fn(), error);
		worker.onmessage?.({ data: { id: 1, error: 'calculation failed' } });
		expect(error.mock.calls[0][0].message).toBe('calculation failed');
		client.compute(input, vi.fn(), error);
		worker.onmessageerror?.();
		expect(error).toHaveBeenCalledTimes(2);
		expect(worker.terminate).toHaveBeenCalledOnce();
	});

	it('disposal terminates active work and discards pending work and late callbacks', () => {
		const { worker, client } = fixture();
		const done = vi.fn(), error = vi.fn();
		client.compute(input, done, error);
		client.compute(input, done, error);
		const lateMessage = worker.onmessage;
		client.dispose();
		client.dispose();
		lateMessage?.({ data: { id: 1, result } });
		expect(worker.terminate).toHaveBeenCalledOnce();
		expect(worker.postMessage).toHaveBeenCalledTimes(1);
		expect(done).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
		client.compute(input, done, error);
		expect(error).toHaveBeenCalledWith(expect.any(Error));
	});
});
