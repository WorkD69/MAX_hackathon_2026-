import { withDisposablePostgres } from '../postgres.mjs';

await withDisposablePostgres({ adminUrl: process.env.TEST_POSTGRES_ADMIN_URL }, async target => {
  process.send({ receiptPath: target.receiptPath });
  // Keep only the test child IPC channel alive; no product modules/registry.
  await new Promise(resolve => process.once('message', resolve));
});
