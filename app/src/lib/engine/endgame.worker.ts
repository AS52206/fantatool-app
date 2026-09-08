import { ottimizzaFinaleAsta } from './endgame';
import type { EndgameReply, EndgameRequest } from './endgameClient';

// This module is loaded exclusively as a dedicated module worker by EndgameClient.
self.onmessage = (event: MessageEvent<EndgameRequest>) => {
	const { id, input } = event.data;
	let reply: EndgameReply;
	try {
		reply = { id, result: ottimizzaFinaleAsta(input) };
	} catch (error) {
		reply = { id, error: error instanceof Error ? error.message : String(error) };
	}
	self.postMessage(reply);
};
