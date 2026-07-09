import nodemailer from 'nodemailer';
import { config } from '../config/env';

const transporter = nodemailer.createTransport({
  host: config.smtp.host,
  port: config.smtp.port,
  auth: config.smtp.user ? {
    user: config.smtp.user,
    pass: config.smtp.pass,
  } : undefined,
});

export const mailerService = {
  async sendExpirationWarning(to: string, clientName: string, domain: string, daysLeft: number, expirationDate: string) {
    const subject = `[Neokik Digital] Subscription Expiration Notice - ${domain}`;
    const text = `Hello ${clientName},\n\nThis is a reminder that your web hosting & maintenance subscription for ${domain} will expire in ${daysLeft} days on ${expirationDate}.\n\nPlease ensure payment is completed to maintain uninterrupted service.\n\nBest regards,\nNeokik Digital Team`;
    
    try {
      console.log(`[MAILER] Sending ${daysLeft}-day warning to ${to} for ${domain}`);
      if (config.smtp.user) {
        await transporter.sendMail({
          from: config.smtp.from,
          to,
          subject,
          text,
        });
      }
      return true;
    } catch (error) {
      console.error('[MAILER ERROR] Failed to send email:', error);
      return false;
    }
  },

  async sendExpiredNotice(to: string, clientName: string, domain: string, graceDaysLeft: number) {
    const subject = `[Neokik Digital] URGENT: Subscription Expired for ${domain}`;
    const text = `Hello ${clientName},\n\nYour subscription for ${domain} has expired. A grace period of ${graceDaysLeft} days has been granted before service suspension.\n\nPlease renew immediately to prevent your website from being suspended.\n\nBest regards,\nNeokik Digital Team`;

    try {
      console.log(`[MAILER] Sending EXPIRED notice to ${to} for ${domain}`);
      if (config.smtp.user) {
        await transporter.sendMail({
          from: config.smtp.from,
          to,
          subject,
          text,
        });
      }
      return true;
    } catch (error) {
      console.error('[MAILER ERROR] Failed to send email:', error);
      return false;
    }
  },

  async sendSuspendedNotice(to: string, clientName: string, domain: string) {
    const subject = `[Neokik Digital] SERVICE SUSPENDED - ${domain}`;
    const text = `Hello ${clientName},\n\nYour subscription for ${domain} has exceeded the grace period and your website hosting service has been SUSPENDED.\n\nTo restore your website online, please contact Neokik Digital support and process your subscription renewal.\n\nBest regards,\nNeokik Digital Team`;

    try {
      console.log(`[MAILER] Sending SUSPENDED notice to ${to} for ${domain}`);
      if (config.smtp.user) {
        await transporter.sendMail({
          from: config.smtp.from,
          to,
          subject,
          text,
        });
      }
      return true;
    } catch (error) {
      console.error('[MAILER ERROR] Failed to send email:', error);
      return false;
    }
  }
};
