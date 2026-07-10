export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    return res.status(200).json({
      ok: true,
      message: 'Auto-harvest stub is active',
      payload: body,
      scheduled: true,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
