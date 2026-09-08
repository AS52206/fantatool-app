/** Browser-owned lock: released even if the owning tab crashes. No timed lease races. */
export class WriterLock {
	private release?: () => void;
	private pending = false;
	private generation = 0;
	async acquire(locks: LockManager, granted: () => void): Promise<boolean> {
		if (this.release) return true;
		if (this.pending) return false;
		this.pending = true;
		const generation = this.generation;
		return new Promise<boolean>((resolve, reject) => {
			void locks.request('fantatool.auction.writer.v1', { ifAvailable: true }, async (lock) => {
				if (generation !== this.generation) { resolve(false); return; }
				this.pending = false;
				if (!lock) { resolve(false); return; }
				try {
					const held = new Promise<void>((done) => { this.release = done; });
					granted();
					resolve(true);
					await held;
				} catch (e) { this.dispose(); reject(e); }
			}).catch((e) => { this.pending = false; reject(e); });
		});
	}
	dispose() { this.generation++; this.pending = false; this.release?.(); this.release = undefined; }
}
