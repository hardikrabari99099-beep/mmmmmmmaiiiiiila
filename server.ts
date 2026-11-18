import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface SmtpPayloadConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  fromName?: string;
  fromEmail?: string;
}

interface SmtpAttachmentPayload {
  filename: string;
  contentType?: string;
  base64Content: string;
}

interface SmtpPayloadMessage {
  to?: string;
  subject?: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: SmtpAttachmentPayload[];
}

function validateSmtpConfig(config: SmtpPayloadConfig): string | null {
  if (!config || typeof config !== 'object') {
    return 'Missing SMTP configuration.';
  }
  if (!config.host || !config.host.trim()) {
    return 'SMTP host is required.';
  }
  const port = Number(config.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return 'SMTP port must be a valid port number (1-65535).';
  }
  if (!config.user || !config.user.trim()) {
    return 'SMTP username or sender email is required.';
  }
  const senderEmail = config.fromEmail?.trim() || config.user.trim();
  if (!senderEmail.includes('@')) {
    return 'Enter a valid "Sender From Email" (required when SMTP username is an API key or IAM ID like "apikey" or "AKIA...").';
  }
  if (!config.pass) {
    return 'SMTP password or app password is required.';
  }
  return null;
}

function resolveFromAddress(config: SmtpPayloadConfig): string {
  const rawEmail = config.fromEmail?.trim() || config.user!.trim();
  const cleanName = config.fromName?.trim().replace(/["\r\n]/g, '');
  return cleanName ? `"${cleanName}" <${rawEmail}>` : rawEmail;
}

function formatSmtpError(err: unknown, host = ''): { message: string; fatal: boolean } {
  const raw = err instanceof Error ? err.message : 'SMTP delivery failed.';
  const lower = raw.toLowerCase();
  const isGmailHost = host.toLowerCase().includes('gmail');

  if (lower.includes('535') || lower.includes('invalid login') || lower.includes('eauth')) {
    return {
      fatal: true,
      message: isGmailHost
        ? 'Gmail SMTP authentication failed (535). Use a 16-character Google App Password (not your regular Gmail password).'
        : `SMTP authentication failed: ${raw}`,
    };
  }
  if (lower.includes('econnrefused') || lower.includes('enotfound') || lower.includes('etimedout') || lower.includes('greeting never received')) {
    return {
      fatal: true,
      message: `Cannot reach SMTP server (${host}): ${raw}. Verify host, port, and SSL/TLS toggle.`,
    };
  }
  if (lower.includes('550') || lower.includes('553') || lower.includes('sender') || lower.includes('not verified')) {
    return {
      fatal: true,
      message: `Sender address rejected by relay: ${raw}. Verify your "Sender From Email" in your SMTP provider.`,
    };
  }
  return { fatal: false, message: raw };
}

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.post('/api/smtp/verify', async (req: Request, res: Response) => {
    const config = req.body as SmtpPayloadConfig;
    const validationError = validateSmtpConfig(config);
    if (validationError) {
      res.status(400).json({ ok: false, error: validationError });
      return;
    }

    try {
      const port = Number(config.port);
      const secure = typeof config.secure === 'boolean' ? config.secure : port === 465;
      const transporter = nodemailer.createTransport({
        host: config.host!.trim(),
        port,
        secure,
        auth: {
          user: config.user!.trim(),
          pass: config.pass!,
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
      });

      await transporter.verify();
      res.json({ ok: true });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'SMTP verification failed.';
      res.status(400).json({ ok: false, error: message });
    }
  });

  app.post('/api/smtp/send', async (req: Request, res: Response) => {
    const body = req.body as { config?: SmtpPayloadConfig; message?: SmtpPayloadMessage };
    const config = body?.config ?? {};
    const message = body?.message ?? {};

    const validationError = validateSmtpConfig(config);
    if (validationError) {
      res.status(400).json({ ok: false, error: validationError });
      return;
    }

    if (!message.to || !message.to.trim()) {
      res.status(400).json({ ok: false, error: 'Recipient email address is required.' });
      return;
    }
    if (!message.subject || !message.subject.trim()) {
      res.status(400).json({ ok: false, error: 'Email subject is required.' });
      return;
    }
    if (!message.html && !message.text) {
      res.status(400).json({ ok: false, error: 'Email body is required.' });
      return;
    }

    try {
      const port = Number(config.port);
      const secure = typeof config.secure === 'boolean' ? config.secure : port === 465;
      const transporter = nodemailer.createTransport({
        host: config.host!.trim(),
        port,
        secure,
        auth: {
          user: config.user!.trim(),
          pass: config.pass!,
        },
        connectionTimeout: 12000,
        greetingTimeout: 12000,
      });

      const fromAddress = resolveFromAddress(config);

      const info = await transporter.sendMail({
        from: fromAddress,
        to: message.to.trim(),
        replyTo: message.replyTo?.trim() || undefined,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: (message.attachments ?? []).map((att) => ({
          filename: att.filename,
          content: att.base64Content,
          encoding: 'base64',
          contentType: att.contentType || undefined,
        })),
      });

      res.json({ ok: true, messageId: info.messageId });
    } catch (error: unknown) {
      const formatted = formatSmtpError(error, config.host);
      res.status(500).json({ ok: false, error: formatted.message });
    }
  });

  app.post('/api/smtp/send-batch', async (req: Request, res: Response) => {
    const body = req.body as {
      config?: SmtpPayloadConfig;
      concurrency?: number;
      delayMs?: number;
      attachments?: SmtpAttachmentPayload[];
      messages?: Array<SmtpPayloadMessage & { recipientId: string }>;
    };

    const config = body?.config ?? {};
    const validationError = validateSmtpConfig(config);
    if (validationError) {
      res.status(400).json({ ok: false, error: validationError });
      return;
    }

    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) {
      res.status(400).json({ ok: false, error: 'Batch contains no messages.' });
      return;
    }
    if (messages.length > 100) {
      res.status(400).json({ ok: false, error: 'Batch chunk size cannot exceed 100 messages.' });
      return;
    }

    const requestedConcurrency = Math.max(1, Math.min(5, Number(body?.concurrency) || 3));
    const isGmailSmtp = config.host!.toLowerCase().includes('gmail');
    const concurrency = isGmailSmtp ? Math.min(2, requestedConcurrency) : requestedConcurrency;
    const delayMs = Math.max(0, Math.min(5000, Number(body?.delayMs) || 0));
    const port = Number(config.port);
    const secure = typeof config.secure === 'boolean' ? config.secure : port === 465;

    const transporter = nodemailer.createTransport({
      pool: true,
      maxConnections: concurrency,
      maxMessages: 250,
      host: config.host!.trim(),
      port,
      secure,
      auth: {
        user: config.user!.trim(),
        pass: config.pass!,
      },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
    });

    const fromAddress = resolveFromAddress(config);

    // Pre-verify handshake so auth/connection errors fail fast with clear diagnostics
    try {
      await transporter.verify();
    } catch (verifyErr: unknown) {
      transporter.close();
      const formatted = formatSmtpError(verifyErr, config.host);
      res.status(400).json({
        ok: false,
        fatalError: formatted.message,
        error: formatted.message,
      });
      return;
    }

    const batchResults: Array<{
      recipientId: string;
      ok: boolean;
      messageId?: string;
      error?: string;
      sentAt: string;
    }> = new Array(messages.length);

    let cursor = 0;
    let fatalError: string | null = null;

    async function worker() {
      while (cursor < messages.length && !fatalError) {
        const idx = cursor;
        cursor += 1;
        const msg = messages[idx];

        if (!msg.to?.trim() || !msg.subject?.trim() || (!msg.html && !msg.text)) {
          batchResults[idx] = {
            recipientId: msg.recipientId,
            ok: false,
            error: 'Missing recipient address, subject, or body.',
            sentAt: new Date().toISOString(),
          };
          continue;
        }

        const batchAttachments = (msg.attachments ?? body?.attachments ?? []).map((att) => ({
          filename: att.filename,
          content: att.base64Content,
          encoding: 'base64',
          contentType: att.contentType || undefined,
        }));

        try {
          const info = await transporter.sendMail({
            from: fromAddress,
            to: msg.to.trim(),
            replyTo: msg.replyTo?.trim() || undefined,
            subject: msg.subject,
            text: msg.text,
            html: msg.html,
            attachments: batchAttachments.length > 0 ? batchAttachments : undefined,
          });
          batchResults[idx] = {
            recipientId: msg.recipientId,
            ok: true,
            messageId: info.messageId,
            sentAt: new Date().toISOString(),
          };
        } catch (err: unknown) {
          const formatted = formatSmtpError(err, config.host);
          if (formatted.fatal) {
            fatalError = formatted.message;
          }
          batchResults[idx] = {
            recipientId: msg.recipientId,
            ok: false,
            error: formatted.message,
            sentAt: new Date().toISOString(),
          };
        }

        if (delayMs > 0 && cursor < messages.length && !fatalError) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(concurrency, messages.length) }, () => worker())
      );
      const settled = batchResults.filter(Boolean);
      res.json({ ok: true, fatalError: fatalError ?? undefined, results: settled });
    } finally {
      transporter.close();
    }
  });

  if (IS_PRODUCTION) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    app.use('*', async (req: Request, res: Response, next) => {
      try {
        const url = req.originalUrl;
        const templatePath = path.resolve(__dirname, 'index.html');
        let template = fs.readFileSync(templatePath, 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (err) {
        next(err);
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SheetMail server running on http://0.0.0.0:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
