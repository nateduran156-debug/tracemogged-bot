import { config } from './config.js';
import { statements } from './db.js';

export function isWhitelisted(userId) {
  if (userId === config.hardcodedWhitelistId) return true;
  return Boolean(statements.isWhitelisted.get(userId));
}

export function addToWhitelist(userId, addedBy) {
  statements.addWhitelist.run(userId, addedBy);
}

export function removeFromWhitelist(userId) {
  if (userId === config.hardcodedWhitelistId) {
    return false;
  }
  statements.removeWhitelist.run(userId);
  return true;
}

export function listWhitelist() {
  return statements.allWhitelist.all();
}
