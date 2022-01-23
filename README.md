## Inbox Telegram Plugin
This is simple plugin that get new messages from Telegram bot and paste its to daily journal.

## Configuration
- In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot
Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is `/newbot`. After you choose title, BotFaher give you the token. 
- Paste Telegram bot token into plugin settings `botToken`
- You may adjust polling interval `pollingInterval` in milliseconds. This interval will be used to get new messages from Telegram bot
- Messages will be pasted in daily journal into block with text, specified in `inboxName` property. Replace it in case of neccessary
- **Restart plugin in Logseq**
- After that just open chat with your bot in Telegram and type `/start` command
- Then write any message in this chat, it will be added to your Logseq daily journal within 60 seconds (by default)

```json
{
  "disabled": false,
  "botToken": "PASTE_BOT_TOKEN_HERE",
  "pollingInterval": 60000,
  "inboxName": "#inbox"
}
```

### Contribute
- `yarn && yarn build` in terminal to install dependencies.
- `Load unpacked plugin` in Logseq Desktop client.

### License
MIT
