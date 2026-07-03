// Shared in-memory store for pending kick confirmations, keyed by channel ID.
// Used by both the slash command flow (/kick_nonreactors) and the prefix
// command flow (.kicknonreactors) so the button handler in
// interactionCreate.js works no matter which command created the prompt.
export const pendingKicks = new Map();
