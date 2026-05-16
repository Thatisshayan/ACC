const v=require('./cloud/security/vaultStub');['CLAUDE_API_KEY','DEEPSEEK_API_KEY','TELEGRAM_BOT_TOKEN','SHAYAN_TELEGRAM_CHAT_ID'].forEach(k= r=v.readSecret(k);console.log(k,r?'OK':'EMPTY')});  
