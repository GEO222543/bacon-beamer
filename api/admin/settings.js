export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const storageKey = 'baconBeamersAdminSettings';
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(storageKey) : null;
    const settings = raw ? JSON.parse(raw) : {};

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, settings });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const next = { ...settings, ...body };
    if (globalThis.localStorage) {
      globalThis.localStorage.setItem(storageKey, JSON.stringify(next));
    }
    return res.status(200).json({ ok: true, settings: next });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
