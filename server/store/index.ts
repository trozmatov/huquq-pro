import type { DataStore } from './types.js';
import { MemoryStore } from './memoryStore.js';
import { FirestoreStore } from './firestoreStore.js';
import { getConfig } from '../config.js';

export function createStore(overrideType?: 'memory' | 'firestore'): DataStore {
  const type = overrideType || getConfig().storeType;
  if (type === 'firestore') {
    return new FirestoreStore();
  }
  return new MemoryStore(true);
}
