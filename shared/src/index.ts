export { envelopeSchema, dataStateSchema, SCHEMA_VERSION } from './schemas/envelope.js';
export type { Envelope, DataState } from './schemas/envelope.js';
export { truncateAtWord, TRUNCATE_EXCERPT, TRUNCATE_TITLE } from './format/truncate.js';
export { parseStoredPhone, formatPhone, storedPhoneSchema } from './format/phone.js';
