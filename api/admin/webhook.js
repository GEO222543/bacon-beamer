export default function handler(req, res) {
  const storageKey = 'baconBeamersAdminSettings';

  try {
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(storageKey) : null;
    const settings = raw ? JSON.parse(raw) : {};

    if (req.method === 'GET') {
      return res.status(200).json({
        ok: true,
        settings: {
          publicWebhook: settings.publicWebhook ? settings.publicWebhook.replace(/.(?=.{4,}$)/g, '*') : '',
          privateWebhook: settings.privateWebhook ? settings.privateWebhook.replace(/.(?=.{4,}$)/g, '*') : '',
          failureWebhook: settings.failureWebhook ? settings.failureWebhook.replace(/.(?=.{4,}$)/g, '*') : '',
        },
      });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      const next = { ...settings, ...body };
      if (globalThis.localStorage) {
        globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
      }
      return res.status(200).json({ ok: true, settings: next });
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, POST, OPTIONS');
      return res.status(204).end();
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
