import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { SentMailHistoryService } from '../../sentMail/historyService';
import { SentMailRecord } from '../../sentMail/types';

describe('SentMailHistoryService', () => {
  let tempDir: string;
  let service: SentMailHistoryService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sent-mail-test-'));
    service = new SentMailHistoryService(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('save() создает JSON-файл с корректным содержимым', async () => {
    const record: SentMailRecord = {
      to: 'test@example.com',
      subject: 'Test Subject',
      text: 'Hello world',
      date: new Date().toISOString(),
    };
    await service.save(record);

    assert.ok(record.id, 'id должен быть сгенерирован');

    const filePath = path.join(tempDir, `${record.id}.json`);
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content) as SentMailRecord;

    assert.strictEqual(parsed.to, record.to);
    assert.strictEqual(parsed.subject, record.subject);
    assert.strictEqual(parsed.text, record.text);
    assert.strictEqual(parsed.date, record.date);
  });

  it('loadAll() возвращает массив, отсортированный по date desc', async () => {
    const r1: SentMailRecord = {
      id: 'r1',
      to: 'a@test.com',
      subject: 'Old',
      date: '2024-01-01T00:00:00.000Z',
    };
    const r2: SentMailRecord = {
      id: 'r2',
      to: 'b@test.com',
      subject: 'New',
      date: '2024-12-31T23:59:59.000Z',
    };
    const r3: SentMailRecord = {
      id: 'r3',
      to: 'c@test.com',
      subject: 'Middle',
      date: '2024-06-15T12:00:00.000Z',
    };

    await service.save(r1);
    await service.save(r2);
    await service.save(r3);

    const all = await service.loadAll();
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all[0].id, 'r2');
    assert.strictEqual(all[1].id, 'r3');
    assert.strictEqual(all[2].id, 'r1');
  });

  it('load(id) возвращает конкретную запись', async () => {
    const record: SentMailRecord = {
      id: 'specific-id',
      to: 'specific@test.com',
      subject: 'Specific',
      date: new Date().toISOString(),
    };
    await service.save(record);

    const loaded = await service.load('specific-id');
    assert.ok(loaded);
    assert.strictEqual(loaded!.to, 'specific@test.com');
    assert.strictEqual(loaded!.subject, 'Specific');
  });

  it('load(\'nonexistent\') возвращает null', async () => {
    const result = await service.load('nonexistent-id');
    assert.strictEqual(result, null);
  });

  it('loadAll() возвращает пустой массив для пустой директории', async () => {
    const all = await service.loadAll();
    assert.deepStrictEqual(all, []);
  });

  it('save() с несколькими записями — loadAll() возвращает все', async () => {
    for (let i = 0; i < 5; i++) {
      await service.save({
        to: `user${i}@test.com`,
        subject: `Mail ${i}`,
        date: new Date().toISOString(),
      });
    }
    const all = await service.loadAll();
    assert.strictEqual(all.length, 5);
  });
});
