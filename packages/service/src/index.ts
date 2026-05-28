import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { connectRouter } from './routes/connect';
import { disconnectRouter } from './routes/disconnect';
import { statusRouter } from './routes/status';
import { mailboxesRouter } from './routes/mailboxes';
import { searchRouter } from './routes/search';
import { messagesRouter } from './routes/messages';
import { sendEmailRouter } from './routes/send-email';
import { replyEmailRouter } from './routes/reply-email';
import { attachmentsRouter } from './routes/attachments';
import { getSessionCount } from './session-manager';

const app = new Hono();

app.use('*', cors());
app.use('*', logger());
app.use('/api/*', async (c, next) => {
  const clientIp = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown';
  const method = c.req.method;
  const path = c.req.path;
  console.error(`[Proxy] ${method} ${path} from ${clientIp}`);
  await next();
});

app.get('/', (c) => {
  return c.json({
    service: 'mcp-mail-service',
    version: '0.1.0',
    activeSessions: getSessionCount(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', activeSessions: getSessionCount() });
});

app.route('/api/connect', connectRouter);
app.route('/api/disconnect', disconnectRouter);
app.route('/api/status', statusRouter);
app.route('/api/mailboxes', mailboxesRouter);
app.route('/api/search', searchRouter);
app.route('/api/messages', messagesRouter);
app.route('/api/send-email', sendEmailRouter);
app.route('/api/reply-email', replyEmailRouter);
app.route('/api/attachments', attachmentsRouter);

const PORT = parseInt(process.env.PORT || '3000', 10);

console.error(`[Service] MCP Mail Service starting on port ${PORT}`);
console.error(`[Service] Active sessions: ${getSessionCount()}`);

export default {
  port: PORT,
  fetch: app.fetch,
};