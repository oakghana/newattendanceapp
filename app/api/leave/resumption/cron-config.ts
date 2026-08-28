/**
 * Vercel Crons Configuration
 * 
 * This file defines scheduled cron jobs for the leave resumption alert system.
 * Runs daily at 7:00 AM UTC to:
 * 1. Send pre-resumption alerts (2-week and 1-week reminders)
 * 2. Check for staff not reporting on their resumption dates
 * 3. Send notifications to HOD/RM for follow-up
 */

export const config = {
  runtime: 'nodejs',
}

// This is a configuration file. Actual cron jobs are defined in vercel.json or via Vercel CLI
// Example vercel.json configuration:
/*
{
  "crons": [
    {
      "path": "/api/leave/resumption/cron-job",
      "schedule": "0 7 * * *"
    }
  ]
}
*/
