import { describe, expect, it, vi } from 'vitest';
import { WriterLock } from './writerLock';

/** Mimics browser ownership: the resource remains held until callback completion. */
function lockManager() {
	let busy = false;
	const request = vi.fn(async (_name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
		await Promise.resolve();
		if (busy) return callback(null);
		busy = true;
		try { return await callback({ name: _name, mode: 'exclusive' } as Lock); }
		finally { busy = false; }
	});
	return { locks: { request } as unknown as LockManager, request };
}

async function settleRelease() { for (let i = 0; i < 5; i++) await Promise.resolve(); }

describe('WriterLock', () => {
	it('excludes a second writer and lets it acquire after release', async () => {
		const { locks } = lockManager();
		const first = new WriterLock();
		const second = new WriterLock();
		const onSecond = vi.fn();
		expect(await first.acquire(locks, vi.fn())).toBe(true);
		expect(await second.acquire(locks, onSecond)).toBe(false);
		expect(onSecond).not.toHaveBeenCalled();
		first.dispose();
		await settleRelease();
		expect(await second.acquire(locks, onSecond)).toBe(true);
		expect(onSecond).toHaveBeenCalledTimes(1);
		second.dispose();
	});

	it('avoids duplicate requests while pending or already acquired and supports reacquisition', async () => {
		const { locks, request } = lockManager();
		const writer = new WriterLock();
		const granted = vi.fn();
		const first = writer.acquire(locks, granted);
		expect(await writer.acquire(locks, granted)).toBe(false);
		expect(await first).toBe(true);
		expect(await writer.acquire(locks, granted)).toBe(true);
		expect(request).toHaveBeenCalledTimes(1);
		expect(granted).toHaveBeenCalledTimes(1);
		writer.dispose();
		await settleRelease();
		expect(await writer.acquire(locks, granted)).toBe(true);
		expect(granted).toHaveBeenCalledTimes(2);
		writer.dispose();
	});

	it('releases ownership when the granted callback throws', async () => {
		const { locks } = lockManager();
		const writer = new WriterLock();
		await expect(writer.acquire(locks, () => { throw new Error('restore failed'); })).rejects.toThrow('restore failed');
		await settleRelease();
		const next = new WriterLock();
		expect(await next.acquire(locks, vi.fn())).toBe(true);
		next.dispose();
	});

	it('can retry after the browser rejects the request', async () => {
		const { locks } = lockManager();
		const writer = new WriterLock();
		const failed = { request: vi.fn().mockRejectedValue(new Error('unavailable')) } as unknown as LockManager;
		await expect(writer.acquire(failed, vi.fn())).rejects.toThrow('unavailable');
		expect(await writer.acquire(locks, vi.fn())).toBe(true);
		writer.dispose();
	});

	it('does not grant ownership after disposal during a pending request', async () => {
		const { locks } = lockManager();
		const writer = new WriterLock();
		const granted = vi.fn();
		const acquiring = writer.acquire(locks, granted);
		writer.dispose();
		expect(await acquiring).toBe(false);
		expect(granted).not.toHaveBeenCalled();
		await settleRelease();
		const next = new WriterLock();
		expect(await next.acquire(locks, vi.fn())).toBe(true);
		next.dispose();
	});
});
