import { runScheduler } from '../services/scheduler.js';

(async () => {
  try {
    const n = await runScheduler(100);
    console.log(`Scheduler processed ${n} jobs`);
    process.exit(0);
  } catch (err) {
    console.error('Scheduler error', err.message);
    process.exit(1);
  }
})();
