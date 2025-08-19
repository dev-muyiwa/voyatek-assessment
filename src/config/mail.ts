import nodemailer from 'nodemailer';
import { inject, injectable } from 'inversify';
import { LIB_TYPES } from '../di/types';
import env from './env';
import { Logger } from './logger';

@injectable()
export class MailClient {
  private readonly transporter: nodemailer.Transporter;

  constructor(@inject(LIB_TYPES.Logger) private readonly _logger: Logger) {
    this.transporter = nodemailer.createTransport({
      host: env.mail_host,
      port: env.mail_port,
      auth: {
        user: env.mail_username,
        pass: env.mail_password,
      },
    });

    this._logger.info('mail client initialized');
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    try {
      // if (!(this.transporter instanceof SESClient)) {
      const info = await this.transporter.sendMail({
        from: {
          name: 'Schoolinka',
          address: 'no-reply@schoolinka.com',
        },
        to,
        subject,
        html: html,
        replyTo: 'no-reply@schoolinka.com',
      });

      this._logger.info(`sent using nodemailer: ${info.messageId}`);
      // } else {
      //   const params = {
      //     Destination: {
      //       ToAddresses: [to]
      //     },
      //     Message: {
      //       Body: {
      //         Html: { Data: html }
      //       },
      //       Subject: { Data: subject }
      //     },
      //     Source: 'Schoolinka <no-reply@schoolinka.com>'
      //   };
      //
      //   const command = new SendEmailCommand(params);
      //   const data = await this.transporter.send(command);
      //
      //   this._logger.info(`sent using aws ses: ${data.MessageId}`);
      // }
    } catch (err) {
      this._logger.error('error sending email', { error: err });
      throw new Error('error sending email');
    }
  }

  async sendEmailWithAttachments(
    to: string,
    subject: string,
    html: string,
    attachments: { filename: string; buffer: Buffer }[],
  ): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: {
          name: 'Schoolinka',
          address: 'no-reply@schoolinka.com',
        },
        to,
        subject,
        html: html,
        replyTo: 'no-reply@schoolinka.com',
        attachments: attachments.map((attachment) => {
          return {
            filename: attachment.filename,
            content: attachment.buffer,
            encoding: 'base64',
          };
        }),
      });

      this._logger.info(`sent using nodemailer: ${info.messageId}`);
    } catch (err) {
      this._logger.error('error sending email with attachments', { error: err });
      throw err;
    }
  }
}
