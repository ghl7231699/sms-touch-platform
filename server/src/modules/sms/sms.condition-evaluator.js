import { config } from '../../config/env.js';

function boolFromPayload(payload, keys) {
  for (const key of keys) {
    if (typeof payload?.[key] === 'boolean') return payload[key];
  }
  return undefined;
}

async function fetchMembershipStatus({ userId, phone, rule }) {
  if (!config.integrations.membershipStatusUrl) return null;

  const url = new URL(config.integrations.membershipStatusUrl);
  if (userId) url.searchParams.set('userId', userId);
  if (phone) url.searchParams.set('phone', phone);
  if (rule?.conditionConfig?.membershipProductIds?.length) {
    url.searchParams.set('productIds', rule.conditionConfig.membershipProductIds.join(','));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.integrations.timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(config.integrations.membershipStatusToken
          ? { Authorization: `Bearer ${config.integrations.membershipStatusToken}` }
          : {})
      },
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        code: 'MEMBERSHIP_STATUS_FAILED',
        reason: body.message || `Membership service returned ${response.status}.`
      };
    }
    return {
      ok: true,
      hasMembership: Boolean(body.hasMembership || body.isMember || body.purchased || body.active),
      raw: body
    };
  } catch (error) {
    return {
      ok: false,
      code: 'MEMBERSHIP_STATUS_UNAVAILABLE',
      reason: error.name === 'AbortError' ? 'Membership status request timed out.' : error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

function evaluateMembershipFromPayload(payload = {}) {
  const hasMembership = boolFromPayload(payload, ['hasMembership', 'isMember', 'membershipActive']);
  if (typeof hasMembership === 'boolean') return hasMembership;

  const purchased = boolFromPayload(payload, ['membershipPurchased', 'purchasedMembership', 'paid', 'hasPaid']);
  if (typeof purchased === 'boolean') return purchased;

  if (payload.membershipStatus) {
    return ['active', 'paid', 'purchased', 'valid'].includes(String(payload.membershipStatus).toLowerCase());
  }

  if (payload.orderStatus) {
    return ['paid', 'success', 'completed'].includes(String(payload.orderStatus).toLowerCase());
  }

  return false;
}

export async function evaluateTaskCondition({ task, rule, event }) {
  const conditionType = rule?.conditionType || rule?.conditionConfig?.type || 'none';
  if (!rule || conditionType === 'none') {
    return { shouldSend: true, result: 'passed', reason: 'No condition configured.' };
  }

  if (conditionType === 'not_purchased_membership' || conditionType === 'unpaid_after_register') {
    const status = await fetchMembershipStatus({ userId: event?.userId, phone: task.phone, rule });
    if (status?.ok === false) {
      return {
        shouldSend: false,
        retryable: true,
        result: 'error',
        code: status.code,
        reason: status.reason
      };
    }

    const hasMembership = status?.ok
      ? status.hasMembership
      : evaluateMembershipFromPayload(event?.payload || {});

    if (hasMembership) {
      return {
        shouldSend: false,
        retryable: false,
        result: 'skipped',
        code: 'CONDITION_NOT_MATCHED',
        reason: 'User has already purchased or owns an active membership.'
      };
    }

    return {
      shouldSend: true,
      result: 'passed',
      reason: status?.ok
        ? 'Membership service confirmed user has no active membership.'
        : 'Event payload indicates user has no active membership.'
    };
  }

  return {
    shouldSend: true,
    result: 'passed',
    reason: `Condition ${conditionType} is treated as pass-through.`
  };
}
