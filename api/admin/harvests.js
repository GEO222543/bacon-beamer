export default function handler(req, res) {
  try {
    const storageKey = 'baconBeamersAdminData';
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(storageKey) : null;
    const rows = raw ? JSON.parse(raw) : [];

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, items: rows });
    }

    if (req.method === 'DELETE') {
      if (globalThis.localStorage) {
        globalThis.localStorage.removeItem(storageKey);
      }
      return res.status(200).json({ ok: true, cleared: true });
    }

    if (req.method === 'OPTIONS') {
      res.setHeader('Allow', 'GET, DELETE, OPTIONS');
      return res.status(204).end();
    }

    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
