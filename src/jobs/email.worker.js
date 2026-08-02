/**
 * Email worker - processes transactional email jobs
 * Queue: 'email'
 * Priority: Medium
 * Retry: 5 retries with exponential backoff
 */

const processEmailJob = async (job) => {
  const { to, subject, template, data } = job.data;

  // TODO: Send email via AWS SES or Brevo
  console.log(`[Email Worker] Sent to ${to}: ${subject}`);
};

module.exports = { processEmailJob };
