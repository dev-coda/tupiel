/**
 * Daily Reports Job
 * 
 * Scheduled job that runs at 11pm daily to save all reports.
 */

import * as cron from 'node-cron';
import { saveAllReportsForToday } from '../services/saved-reports';

let job: cron.ScheduledTask | null = null;

/**
 * Start the daily reports job (runs at 11pm every day)
 */
export function startDailyReportsJob(): void {
  if (job) {
    console.log('⚠️  Daily reports job already running');
    return;
  }

  // Schedule job to run at 11:00 PM every day
  // Cron format: minute hour day month day-of-week
  // '0 23 * * *' = 11:00 PM every day
  job = cron.schedule('0 23 * * *', async () => {
    console.log('🕚 Daily reports job triggered at 11:00 PM');
    try {
      await saveAllReportsForToday();
    } catch (err) {
      console.error('❌ Daily reports job failed:', err);
    }
  }, {
    scheduled: true,
    timezone: 'America/Bogota', // Adjust to your timezone
  });

  console.log('✅ Daily reports job scheduled to run at 11:00 PM every day');
}

/**
 * Stop the daily reports job
 */
export function stopDailyReportsJob(): void {
  if (job) {
    job.stop();
    job = null;
    console.log('⏹️  Daily reports job stopped');
  }
}

/**
 * Manually trigger the daily reports job (for testing)
 */
export async function triggerDailyReportsJob(): Promise<void> {
  console.log('🔧 Manually triggering daily reports job');
  try {
    await saveAllReportsForToday();
    console.log('✅ Manual daily reports job completed');
  } catch (err) {
    console.error('❌ Manual daily reports job failed:', err);
    throw err;
  }
}
