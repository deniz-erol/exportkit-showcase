import { Resend } from 'resend';

const apiKey = process.env.RESEND_API_KEY;

if (!apiKey) {
  // Warn only in production/dev, not test
  if (process.env.NODE_ENV !== 'test') {
    console.warn('RESEND_API_KEY is not set. Email sending will fail.');
  }
}

// Initialize Resend client
// If key is missing, operations will fail, which is expected behavior
export const resend = new Resend(apiKey);

export default resend;
