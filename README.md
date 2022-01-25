## Inbox Telegram Plugin
This is simple plugin that get new messages from Telegram bot and paste its to daily journal.

## Configuration
- In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot
Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is `/newbot`. After you choose title, BotFaher give you the token. 
- Paste Telegram bot token into plugin settings `botToken`
- You may adjust polling interval `pollingInterval` in milliseconds. This interval will be used to get new messages from Telegram bot
- Messages will be pasted in daily journal into block with text, specified in `inboxName` property. Replace it in case of necessary. If you don't want to group messages, set `inboxName` property to `null`. In this case messages will be inserted directly into page block.
- **Restart plugin in Logseq**
- After that just open chat with your bot in Telegram and type `/start` command
- Then write any message in this chat, it will be added to your Logseq daily journal within 60 seconds (by default)

Settings with grouping:
```json
{
  "disabled": false,
  "botToken": "PASTE_BOT_TOKEN_HERE",
  "pollingInterval": 60000,
  "inboxName": "#inbox",
  "inboxByChat": []
}
```

Set `inboxName` with `null` if you don't want use groups:
```json
{
  "inboxName": null
}
```

## Multiple inboxes
For example you want to collect random thoughts as `#spark` and other thoughts as `#plans`.
- Write BotFather `/setprivacy` command and set it to `DISABLED`
- Also check `/setjoingroups` it will be `ENABLED`
- Create new group in Telegram and add your bot there
- Write any message in this group
- In your plugin settings in `inboxByChat` will be added new object
```json
"inboxByChat": [
  {
    "chatId": -111111111,
    "inboxName": "#spark"
  }
]
```
- Disable plugin
- Change `inboxName` in this object to `#spark` for example
- Enable plugin
- New messages received from this group will be added under `#spark` tag
- You can add additional groups if you want
```json
"inboxByChat": [
  {
    "chatId": -111111111,
    "inboxName": "#spark"
  },
  {
    "chatId": -222222222,
    "inboxName": "#plans"
  }
]
```

### Contribute
- `yarn && yarn build` in terminal to install dependencies.
- `Load unpacked plugin` in Logseq Desktop client.

### License
MIT
