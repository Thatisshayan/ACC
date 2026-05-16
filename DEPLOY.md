# ACC v2 Production Deployment

## Services
- Cloud API: Node.js + Express
- Task Queue: In-memory with persistence
- Worker: Background task processor
- WebSocket: Real-time updates
- Telegram Bot: Command interface

## Health Checks
- GET `/api/health` - Service status
- GET `/admin/system` - Full system status

## Webhook
- POST `/api/webhook/telegram` - Telegram updates

## Environment Variables
```
PORT=4000
TELEGRAM_TOKEN=<new_token_from_@BotFather>
DATABASE_URL=<optional_db>
ANTHROPIC_API_KEY=<your_api_key>
```

## Deploy to Railway
```
railway link <project_id>
railway up
```

## Monitoring
- Logs: Railway dashboard
- Health: `GET /api/health`
- Tasks: `GET /admin/tasks`

## Rate Limiting
- 100 requests per minute per IP
- Applies to all routes globally