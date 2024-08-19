import 'dotenv/config';

import { startWorker } from './module/worker';
import { startSessionCron } from './module/cron';

startWorker();
startSessionCron();

// Force deploy 1.5
