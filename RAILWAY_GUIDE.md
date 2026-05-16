# Railway Deployment Checklist

## Step 1: Create Railway Account
- Go to https://railway.app
- Sign up with GitHub
- Create new project: "ACC v2 Production"

## Step 2: Connect GitHub
- In Railway dashboard → Settings → Integrations
- Link your GitHub account
- Select `agent-command-center` repo

## Step 3: Environment Variables
In Railway project settings, add:
```
PORT=4000
NODE_ENV=REDACTED
TELEGRAM_TOKEN=<YOUR_NEW_TOKEN>
ANTHROPIC_API_KEY=<YOUR_API_KEY>
DATABASE_URL=<optional>
```

## Step 4: Deploy
- Railway auto-deploys on git push to main
- Watch deployment in Railway dashboard
- Access at: https://acc-prod-xxxxx.railway.app

## Step 5: Configure Telegram Webhook
```bash
curl -X POST https://api.telegram.org/bot<TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://acc-prod-xxxxx.railway.app/api/webhook/telegram"}'
```

## Step 6: Verify Production
```bash
curl https://acc-prod-xxxxx.railway.app/api/health
# Expected response: {"ok": true, "service": "ACC Module 7", ...}
```

## Monitoring
- Railway dashboard: Deployments tab
- Logs: Railway Logs view
- Health endpoint: `/api/health`
- Admin dashboard: `/admin`