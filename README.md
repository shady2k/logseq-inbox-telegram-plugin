## Inbox Telegram Plugin
This is simple plugin that get new messages from Telegram bot and paste its to daily journal.

## Configuration
- In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot
- Paste Telegram bot token into plugin settings `botToken` and **restart plugin**
- You may adjust polling interval `pollingInterval` in milliseconds. This interval will be used to get new messages from Telegram bot
- Messages will be pasted in daily journal into block with text, specified in `inboxName` property

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
