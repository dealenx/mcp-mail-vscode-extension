import { Hono } from 'hono';
import { z } from 'zod';
import { validateSession, getIMAPClient } from '../session-manager';

export const searchRouter = new Hono();

const searchBySenderSchema = z.object({
  sessionId: z.string().min(1),
  sender: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  inboxOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
});

const searchBySubjectSchema = z.object({
  sessionId: z.string().min(1),
  subject: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  inboxOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
});

const searchByBodySchema = z.object({
  sessionId: z.string().min(1),
  text: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  inboxOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
});

const searchSinceDateSchema = z.object({
  sessionId: z.string().min(1),
  date: z.string().min(1),
  inboxOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional(),
});

const searchAllSchema = z.object({
  sessionId: z.string().min(1),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  inboxOnly: z.boolean().optional().default(false),
  limit: z.number().int().positive().optional().default(50),
});

const COMMON_SENT_MAILBOX_NAMES = ['INBOX.Sent', 'Sent', 'SENT', 'Sent Items', 'Sent Messages'];

async function searchInMultipleMailboxes(
  imap: any,
  criteria: any[],
  searchType: string,
  searchValue: string,
  startDate: string,
  endDate: string,
  inboxOnly: boolean,
  limit?: number
) {
  const candidateMailboxes = inboxOnly ? ['INBOX'] : ['INBOX'];
  if (!inboxOnly) {
    try {
      const boxes = await imap.getBoxes();
      const findByAttrib = (nodes: any, prefix = ''): string | null => {
        for (const [name, box] of Object.entries(nodes) as [string, any][]) {
          const fullPath = prefix ? `${prefix}${box.delimiter || '.'}${name}` : name;
          if (Array.isArray(box.attribs) && box.attribs.includes('\\Sent')) return fullPath;
          if (box.children) {
            const found = findByAttrib(box.children, fullPath);
            if (found) return found;
          }
        }
        return null;
      };
      const sentMailbox = findByAttrib(boxes);
      if (sentMailbox && !candidateMailboxes.includes(sentMailbox)) {
        candidateMailboxes.push(sentMailbox);
      }
    } catch {}
    for (const name of COMMON_SENT_MAILBOX_NAMES) {
      if (!candidateMailboxes.includes(name)) {
        try {
          await imap.openBox(name, true);
          if (!candidateMailboxes.includes(name)) candidateMailboxes.push(name);
        } catch { /* skip */ }
      }
    }
  }

  const results: any = {
    searchType,
    searchValue,
    searchCriteria: criteria,
    mailboxesSearched: [],
    totalMatches: 0,
    messages: [],
  };

  for (const mailboxName of candidateMailboxes) {
    try {
      console.error(`[Search] Searching in mailbox: ${mailboxName}`);
      await imap.openBox(mailboxName, true);
      const uids = await imap.search(criteria);
      console.error(`[Search] Found ${uids.length} messages in ${mailboxName}`);
      if (uids.length > 0) {
        const limitedUIDs = limit ? uids.slice(-limit) : uids;
        const messages = await imap.fetchMessages(limitedUIDs);
        const messagesWithMailbox = messages.map((msg: any) => ({ ...msg, sourceMailbox: mailboxName }));
        results.messages.push(...messagesWithMailbox);
        results.mailboxesSearched.push({
          mailbox: mailboxName,
          matchingUIDs: messagesWithMailbox.map((m: any) => m.uid),
          messageCount: messagesWithMailbox.length,
        });
      } else {
        results.mailboxesSearched.push({ mailbox: mailboxName, matchingUIDs: [], messageCount: 0 });
      }
    } catch (err) {
      console.error(`[Search] Error searching in ${mailboxName}:`, err instanceof Error ? err.message : String(err));
      results.mailboxesSearched.push({
        mailbox: mailboxName,
        matchingUIDs: [],
        messageCount: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  results.messages.sort((a: any, b: any) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
  if (limit && results.messages.length > limit) {
    results.messages = results.messages.slice(0, limit);
  }
  results.totalMatches = results.messages.length;
  results.note = results.totalMatches > 0
    ? `Found and retrieved ${results.totalMatches} messages`
    : 'No messages found in any of the searched mailboxes';
  return results;
}

searchRouter.post('/sender', async (c) => {
  console.error('[Search] By sender');
  try {
    const body = await c.req.json();
    const parsed = searchBySenderSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, sender, startDate, endDate, inboxOnly, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const result = await searchInMultipleMailboxes(imap, [['FROM', sender]], 'By Sender', sender, startDate || '', endDate || '', inboxOnly, limit);
    return c.json(result);
  } catch (err) {
    console.error('[Search/Sender] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

searchRouter.post('/subject', async (c) => {
  console.error('[Search] By subject');
  try {
    const body = await c.req.json();
    const parsed = searchBySubjectSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, subject, startDate, endDate, inboxOnly, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const result = await searchInMultipleMailboxes(imap, [['SUBJECT', subject]], 'By Subject', subject, startDate || '', endDate || '', inboxOnly, limit);
    return c.json(result);
  } catch (err) {
    console.error('[Search/Subject] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

searchRouter.post('/body', async (c) => {
  console.error('[Search] By body');
  try {
    const body = await c.req.json();
    const parsed = searchByBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, text, startDate, endDate, inboxOnly, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const result = await searchInMultipleMailboxes(imap, [['BODY', text]], 'By Body Text', text, startDate || '', endDate || '', inboxOnly, limit);
    return c.json(result);
  } catch (err) {
    console.error('[Search/Body] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

searchRouter.post('/since', async (c) => {
  console.error('[Search] Since date');
  try {
    const body = await c.req.json();
    const parsed = searchSinceDateSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, date, inboxOnly, limit } = parsed.data;
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return c.json({ error: `Invalid date format: ${date}` }, 400);
    }
    const imap = await getIMAPClient(sessionId);
    const result = await searchInMultipleMailboxes(imap, [['SINCE', parsedDate]], 'Since Date', date, '', '', inboxOnly, limit);
    return c.json(result);
  } catch (err) {
    console.error('[Search/Since] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

searchRouter.post('/all', async (c) => {
  console.error('[Search] All messages');
  try {
    const body = await c.req.json();
    const parsed = searchAllSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid request', details: parsed.error.errors }, 400);
    }
    const { sessionId, startDate, endDate, inboxOnly, limit } = parsed.data;
    const imap = await getIMAPClient(sessionId);
    const result = await searchInMultipleMailboxes(imap, ['ALL'], 'All Messages', '*', startDate || '', endDate || '', inboxOnly, limit);
    return c.json(result);
  } catch (err) {
    console.error('[Search/All] Error:', err instanceof Error ? err.message : String(err));
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});