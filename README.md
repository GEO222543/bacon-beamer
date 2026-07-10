# Bacon Beamers

## Run locally

Open a terminal in this folder and run:

```bash
py -3 -m http.server 8000 --bind 127.0.0.1
```

Then open:

- http://127.0.0.1:8000/
- http://127.0.0.1:8000/admin

## Common errors and fixes

| Error | Likely cause | Fix |
|-------|--------------|-----|
| 500 Internal Server Error | Webhook URL missing or invalid | Set PRIVATE_WEBHOOK and PUBLIC_WEBHOOK environment variables |
| Overlay stuck at X% | Backend not responding | Check the API route and add timeout handling |
| Cookie required error | Cookie not being sent | Check the frontend fetch body format |
| 404 on /api/harvest | Routing issue | Fix vercel.json rewrites |
| CORS error | Missing CORS headers | Add CORS headers to the API response |
| No Output Directory | Build config issue | Add the public folder build step |

## Quick debug checklist

Before submitting a bug report or asking for help, verify:

- [ ] Webhook URLs are set in Vercel environment variables
- [ ] The cookie starts with _|WARNING if needed, and has been cleaned if necessary
- [ ] vercel.json routes /api/* correctly
- [ ] The API has been tested directly with curl
- [ ] The browser console shows no red errors

## Paste-ready debugging prompt

Use this prompt when testing the app and need help diagnosing an issue:

```text
I’m testing the Bacon Beamers app and hit an error. Please inspect the project, identify the likely root cause, and propose or implement the fix.

Please check:
- webhook configuration and environment variables
- API routing and Vercel rewrites
- frontend fetch payloads and cookie handling
- CORS headers and server responses
- build/output settings

Please provide the specific error, the likely cause, and the exact fix. If possible, update the relevant files and verify the result.
```

## Deploy to Vercel

1. Push this folder to GitHub.
2. Import it into Vercel.
3. Add environment variables from .env.example if needed.
4. Deploy.
