export default function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const storageKey = 'baconBeamersAdminData';
    const raw = globalThis.localStorage ? globalThis.localStorage.getItem(storageKey) : null;
    const rows = raw ? JSON.parse(raw) : [];
    const today = new Date().toISOString().slice(0, 10);
    const totalRobux = rows.reduce((sum, item) => sum + Number(item.robux || 0), 0);
    const premium = rows.filter(item => String(item.premium).toLowerCase().includes('yes')).length;
    const free = rows.length - premium;

    return res.status(200).json({
      ok: true,
      totalHarvested: rows.length,
      todayCount: rows.filter(item => item.date === today).length,
      activeCookies: rows.filter(item => item.status !== 'Expired').length,
      totalRobux,
      premiumUsers: premium,
      freeUsers: free,
      successRate: rows.length ? Math.round((premium / rows.length) * 100) : 0,
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || 'Unknown error' });
  }
}
