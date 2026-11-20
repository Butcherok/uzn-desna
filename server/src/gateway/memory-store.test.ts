import { MemoryStore } from './memory-store.js';
import { storeContract } from './store-contract.js';

storeContract('memory', async () => new MemoryStore());
