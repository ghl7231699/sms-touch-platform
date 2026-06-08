import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const iso = (value) => (value instanceof Date ? value.toISOString() : value);

function toTemplate(item) {
  return { ...item, variables: item.variables || [], createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt) };
}

function toRule(item) {
  return { ...item, createdAt: iso(item.createdAt), updatedAt: iso(item.updatedAt) };
}

function toEvent(item) {
  return { ...item, payload: item.payload || {}, occurredAt: iso(item.occurredAt), createdAt: iso(item.createdAt) };
}

function toLog(item) {
  return {
    ...item,
    templateParam: item.templateParam || undefined,
    rawResponse: item.rawResponse || undefined,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    lastClickedAt: item.lastClickedAt ? iso(item.lastClickedAt) : undefined
  };
}

function toTask(item) {
  return {
    ...item,
    templateParam: item.templateParam || undefined,
    scheduledAt: iso(item.scheduledAt),
    sentAt: item.sentAt ? iso(item.sentAt) : undefined,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt)
  };
}

function toShortLink(item) {
  return { ...item, createdAt: iso(item.createdAt) };
}

function toClick(item) {
  return { ...item, clickedAt: iso(item.clickedAt) };
}

function toReceipt(item) {
  return { ...item, raw: item.raw || {}, createdAt: iso(item.createdAt) };
}

export async function readStore() {
  const [templates, rules, events, logs, tasks, shortLinks, clickLogs, receipts] = await Promise.all([
    prisma.smsTemplate.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsRule.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsEvent.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsSendLog.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsTask.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsShortLink.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.smsClickLog.findMany({ orderBy: { clickedAt: 'desc' } }),
    prisma.smsReceipt.findMany({ orderBy: { createdAt: 'desc' } })
  ]);

  return {
    templates: templates.map(toTemplate),
    rules: rules.map(toRule),
    events: events.map(toEvent),
    logs: logs.map(toLog),
    tasks: tasks.map(toTask),
    shortLinks: shortLinks.map(toShortLink),
    clickLogs: clickLogs.map(toClick),
    receipts: receipts.map(toReceipt)
  };
}

function cloneStore(store) {
  return JSON.parse(JSON.stringify(store));
}

const byId = (items) => new Map(items.map((item) => [item.id, item]));

async function createTemplate(tx, item) {
  await tx.smsTemplate.create({
    data: {
      id: item.id,
      name: item.name,
      scene: item.scene,
      providerTemplateId: item.providerTemplateId,
      content: item.content,
      variables: item.variables || [],
      status: item.status || 'enabled',
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
    }
  });
}

async function createRule(tx, item) {
  await tx.smsRule.create({
    data: {
      id: item.id,
      name: item.name,
      code: item.code,
      scene: item.scene,
      eventType: item.eventType,
      delayValue: Number(item.delayValue || 0),
      delayUnit: item.delayUnit,
      conditionType: item.conditionType,
      templateId: item.templateId,
      status: item.status || 'enabled',
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
    }
  });
}

async function createEvent(tx, item) {
  await tx.smsEvent.create({
    data: {
      id: item.id,
      eventId: item.eventId,
      eventType: item.eventType,
      userId: item.userId || null,
      phone: item.phone || null,
      payload: item.payload || {},
      occurredAt: new Date(item.occurredAt),
      createdAt: new Date(item.createdAt)
    }
  });
}

async function createLog(tx, item) {
  await tx.smsSendLog.create({
    data: {
      id: item.id,
      provider: item.provider,
      triggerType: item.triggerType || 'manual',
      scene: item.scene || 'manual',
      phone: item.phone,
      phoneMasked: item.phoneMasked,
      templateId: item.templateId || null,
      templateName: item.templateName || null,
      templateCode: item.templateCode,
      templateParam: item.templateParam || {},
      ruleId: item.ruleId || null,
      ruleName: item.ruleName || null,
      eventId: item.eventId || null,
      eventType: item.eventType || null,
      status: item.status,
      receiptStatus: item.receiptStatus || null,
      code: item.code || null,
      message: item.message || null,
      bizId: item.bizId || null,
      requestId: item.requestId || null,
      shortCode: item.shortCode || null,
      shortUrl: item.shortUrl || null,
      clickCount: Number(item.clickCount || 0),
      lastClickedAt: item.lastClickedAt ? new Date(item.lastClickedAt) : null,
      rawResponse: item.rawResponse || {},
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
    }
  });
}

async function createTask(tx, item) {
  await tx.smsTask.create({
    data: {
      id: item.id,
      taskType: item.taskType || 'auto',
      status: item.status || 'pending',
      triggerType: item.triggerType || 'auto',
      scene: item.scene || 'manual',
      phone: item.phone,
      phoneMasked: item.phoneMasked,
      templateId: item.templateId,
      templateName: item.templateName || null,
      templateCode: item.templateCode,
      templateParam: item.templateParam || {},
      ruleId: item.ruleId || null,
      ruleName: item.ruleName || null,
      eventId: item.eventId || null,
      eventType: item.eventType || null,
      scheduledAt: new Date(item.scheduledAt),
      sentAt: item.sentAt ? new Date(item.sentAt) : null,
      attemptCount: Number(item.attemptCount || 0),
      maxAttempts: Number(item.maxAttempts || 3),
      lastErrorCode: item.lastErrorCode || null,
      lastErrorMessage: item.lastErrorMessage || null,
      logId: item.logId || null,
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined,
      updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
    }
  });
}

async function createShortLink(tx, item) {
  await tx.smsShortLink.create({
    data: {
      id: item.id,
      shortCode: item.shortCode,
      shortUrl: item.shortUrl,
      targetUrl: item.targetUrl,
      logId: item.logId,
      userId: item.userId || null,
      phoneMasked: item.phoneMasked || null,
      clickCount: Number(item.clickCount || 0),
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined
    }
  });
}

async function createClick(tx, item) {
  await tx.smsClickLog.create({
    data: {
      id: item.id,
      shortCode: item.shortCode,
      logId: item.logId,
      userId: item.userId || null,
      ip: item.ip || null,
      userAgent: item.userAgent || null,
      clickedAt: item.clickedAt ? new Date(item.clickedAt) : undefined
    }
  });
}

async function createReceipt(tx, item) {
  await tx.smsReceipt.create({
    data: {
      id: item.id,
      logId: item.logId || null,
      bizId: item.bizId || null,
      requestId: item.requestId || null,
      receiptStatus: item.receiptStatus,
      raw: item.raw || {},
      createdAt: item.createdAt ? new Date(item.createdAt) : undefined
    }
  });
}

async function persistCreates(tx, before, after) {
  const beforeTemplates = byId(before.templates);
  const beforeRules = byId(before.rules);
  const beforeEvents = byId(before.events);
  const beforeLogs = byId(before.logs);
  const beforeTasks = byId(before.tasks);
  const beforeShortLinks = byId(before.shortLinks);
  const beforeClicks = byId(before.clickLogs);
  const beforeReceipts = byId(before.receipts);

  for (const item of after.templates) if (!beforeTemplates.has(item.id)) await createTemplate(tx, item);
  for (const item of after.rules) if (!beforeRules.has(item.id)) await createRule(tx, item);
  for (const item of after.events) if (!beforeEvents.has(item.id)) await createEvent(tx, item);
  for (const item of after.logs) if (!beforeLogs.has(item.id)) await createLog(tx, item);
  for (const item of after.tasks) if (!beforeTasks.has(item.id)) await createTask(tx, item);
  for (const item of after.shortLinks) if (!beforeShortLinks.has(item.id)) await createShortLink(tx, item);
  for (const item of after.clickLogs) if (!beforeClicks.has(item.id)) await createClick(tx, item);
  for (const item of after.receipts) if (!beforeReceipts.has(item.id)) await createReceipt(tx, item);
}

async function persistUpdates(tx, before, after) {
  const beforeTemplates = byId(before.templates);
  const beforeRules = byId(before.rules);
  const beforeLogs = byId(before.logs);
  const beforeTasks = byId(before.tasks);
  const beforeShortLinks = byId(before.shortLinks);

  for (const item of after.templates) {
    const original = beforeTemplates.get(item.id);
    if (original && JSON.stringify(original) !== JSON.stringify(item)) {
      await tx.smsTemplate.update({
        where: { id: item.id },
        data: {
          name: item.name,
          scene: item.scene,
          providerTemplateId: item.providerTemplateId,
          content: item.content,
          variables: item.variables || [],
          status: item.status
        }
      });
    }
  }

  for (const item of after.rules) {
    const original = beforeRules.get(item.id);
    if (original && JSON.stringify(original) !== JSON.stringify(item)) {
      await tx.smsRule.update({
        where: { id: item.id },
        data: {
          name: item.name,
          code: item.code,
          scene: item.scene,
          eventType: item.eventType,
          delayValue: Number(item.delayValue || 0),
          delayUnit: item.delayUnit,
          conditionType: item.conditionType,
          templateId: item.templateId,
          status: item.status
        }
      });
    }
  }

  for (const item of after.shortLinks) {
    const original = beforeShortLinks.get(item.id);
    if (original && JSON.stringify(original) !== JSON.stringify(item)) {
      await tx.smsShortLink.update({
        where: { id: item.id },
        data: { clickCount: Number(item.clickCount || 0) }
      });
    }
  }

  for (const item of after.tasks) {
    const original = beforeTasks.get(item.id);
    if (original && JSON.stringify(original) !== JSON.stringify(item)) {
      await tx.smsTask.update({
        where: { id: item.id },
        data: {
          status: item.status,
          scheduledAt: item.scheduledAt ? new Date(item.scheduledAt) : undefined,
          sentAt: item.sentAt ? new Date(item.sentAt) : null,
          attemptCount: Number(item.attemptCount || 0),
          maxAttempts: Number(item.maxAttempts || 3),
          lastErrorCode: item.lastErrorCode || null,
          lastErrorMessage: item.lastErrorMessage || null,
          logId: item.logId || null,
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
        }
      });
    }
  }

  for (const item of after.logs) {
    const original = beforeLogs.get(item.id);
    if (original && JSON.stringify(original) !== JSON.stringify(item)) {
      await tx.smsSendLog.update({
        where: { id: item.id },
        data: {
          status: item.status,
          receiptStatus: item.receiptStatus || null,
          clickCount: Number(item.clickCount || 0),
          lastClickedAt: item.lastClickedAt ? new Date(item.lastClickedAt) : null,
          updatedAt: item.updatedAt ? new Date(item.updatedAt) : undefined
        }
      });
    }
  }
}

export async function mutateStore(mutator) {
  const before = await readStore();
  const after = cloneStore(before);
  const result = await mutator(after);

  await prisma.$transaction(async (tx) => {
    await persistCreates(tx, before, after);
    await persistUpdates(tx, before, after);
  });

  return result;
}
