import { describe, expect, it, vi } from 'vitest';
import { FileBackupQueue } from './fileBackup';

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<void>((done) => { resolve = done; });
	return { promise, resolve };
}

describe('FileBackupQueue', () => {
	it('saves corrections and undo snapshots even when purchase count is unchanged', async () => {
		const write = vi.fn(async (_text: string) => {});
		const queue = new FileBackupQueue(write);
		queue.enqueue('{"purchases":[{"price":10}]}');
		await queue.flush();
		queue.enqueue('{"purchases":[{"price":12}]}');
		await queue.flush();
		queue.enqueue('{"purchases":[]}');
		await queue.flush();
		expect(write.mock.calls.map(([text]) => text)).toEqual([
			'{"purchases":[{"price":10}]}', '{"purchases":[{"price":12}]}', '{"purchases":[]}'
		]);
	});

	it('serializes slow writes and retains the latest pending snapshot', async () => {
		const first = deferred();
		let active = 0;
		let maxActive = 0;
		let saved = '';
		const writes: string[] = [];
		const queue = new FileBackupQueue(async (text) => {
			active++;
			maxActive = Math.max(maxActive, active);
			writes.push(text);
			if (text === 'first') await first.promise;
			saved = text;
			active--;
		});
		queue.enqueue('first');
		queue.enqueue('intermediate');
		queue.enqueue('latest');
		let flushed = false;
		const flushing = queue.flush().then(() => { flushed = true; });
		await Promise.resolve();
		expect(flushed).toBe(false);
		expect(writes).toEqual(['first']);
		first.resolve();
		await flushing;
		expect(writes).toEqual(['first', 'latest']);
		expect(saved).toBe('latest');
		expect(maxActive).toBe(1);
	});

	it('reports failure without reporting success and retries on the next update', async () => {
		const error = new Error('permission revoked');
		const write = vi.fn<(text: string) => Promise<void>>()
			.mockRejectedValueOnce(error).mockResolvedValue(undefined);
		const onSaved = vi.fn();
		const onError = vi.fn();
		const queue = new FileBackupQueue(write, { onSaved, onError });
		queue.enqueue('snapshot');
		await queue.flush();
		expect(onError).toHaveBeenCalledWith(error, 'snapshot');
		expect(onSaved).not.toHaveBeenCalled();
		queue.enqueue('snapshot');
		await queue.flush();
		expect(write).toHaveBeenCalledTimes(2);
		expect(onSaved).toHaveBeenCalledWith('snapshot');
	});

	it('continues with the latest pending snapshot after a failed write', async () => {
		const first = deferred();
		const saved: string[] = [];
		const queue = new FileBackupQueue(async (text) => {
			if (text === 'old') { await first.promise; throw new Error('disk error'); }
			saved.push(text);
		});
		queue.enqueue('old');
		queue.enqueue('new');
		first.resolve();
		await queue.flush();
		expect(saved).toEqual(['new']);
	});
});
