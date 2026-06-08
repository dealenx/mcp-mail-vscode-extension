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

const SERVICE_VERSION = '0.1.0-mcp-mail';
const STARTED_AT = new Date().toISOString();

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? `${reason.message}\n${reason.stack}` : String(reason);
  console.error(`[FATAL] [${SERVICE_VERSION}] unhandledRejection at ${new Date().toISOString()}: ${msg}`);
});
process.on('uncaughtException', (err) => {
  console.error(`[FATAL] [${SERVICE_VERSION}] uncaughtException at ${new Date().toISOString()}: ${err.message}\n${err.stack}`);
});

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

app.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[OnError] [${SERVICE_VERSION}] ${c.req.method} ${c.req.path}: ${msg}${stack ? `\n${stack}` : ''}`);
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: msg, version: SERVICE_VERSION }, 500);
  }
  return c.text(`Internal Server Error: ${msg}`, 500);
});

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: `Not found: ${c.req.method} ${c.req.path}`, version: SERVICE_VERSION }, 404);
  }
  return c.text(`Not found: ${c.req.path}`, 404);
});

app.get('/', (c) => {
  return c.json({
    service: 'mcp-mail-service',
    version: SERVICE_VERSION,
    startedAt: STARTED_AT,
    activeSessions: getSessionCount(),
  });
});

app.get('/health', (c) => {
  return c.json({ status: 'ok', version: SERVICE_VERSION, activeSessions: getSessionCount() });
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

console.error(`[Service] MCP Mail Service ${SERVICE_VERSION} starting on port ${PORT} at ${STARTED_AT}`);
console.error(`[Service] Active sessions: ${getSessionCount()}`);

export default {
  port: PORT,
  fetch: app.fetch,
};