export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const supplied = String(body.password || '');
    const expected = process.env.ADMIN_PASSWORD || 'bacon2025';
    return res.status(200).json({ ok: supplied === expected, passwordRequired: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
