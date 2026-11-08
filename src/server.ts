/** The only place that opens the real database and the only place that listens. */
import { createApp } from './app.ts';
import { openDatabase } from './db/client.ts';
import { env } from './env.ts';

const app = createApp({ db: openDatabase(env.DATABASE_URL) });

app.listen(env.PORT, () => {
  console.log(`Accounts Receivable listening on http://localhost:${String(env.PORT)}`);
  console.log(`API docs at http://localhost:${String(env.PORT)}/api/docs`);
});
