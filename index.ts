import "@logseq/libs";
import { BlockEntity, SettingSchemaDesc } from "@logseq/libs/dist/LSPlugin.user";
import axios from "axios";
import dayjs from "dayjs";

let isProcessing = false;
let isDebug = false;

interface IPayload {
  offset?: number;
}

interface IUpdate {
  update_id: number;
  message?: {
    date: number;
    text: string;
    from: {
      username: string;
    };
    chat: {
      id: number;
    }
  },
  channel_post?: {
    date: number;
    text: string;
    chat: {
      id: number;
    }
  }
}

interface IMessagesList {
  chatId: number;
  text: string;
}

interface IGroup {
  [key: string]: string[];
}

function log(message: any) {
  if (isDebug) console.log(message);
}

/**
 * main entry
 */
async function main() {
  const logseqSettings = logseq.settings;

  if (!logseqSettings) {
    logseq.UI.showMsg("[Inbox Telegram] Cannot get settings", "error");
    return;
  }

  if (logseqSettings.isDebug === true) {
    isDebug = true;
  }

  if (!logseqSettings.hasOwnProperty("inboxName")) {
    await logseq.updateSettings({
      inboxName: "#inbox",
    });
  }

  if (!logseqSettings.hasOwnProperty("invertMessagesOrder")) {
    await logseq.updateSettings({
      invertMessagesOrder: false,
    });
  }

  if (!logseqSettings.hasOwnProperty("addTimestamp")) {
    await logseq.updateSettings({
      addTimestamp: false,
    });
  }

  if (!logseqSettings.hasOwnProperty("authorizedUsers")) {
    await logseq.updateSettings({
      authorizedUsers: [],
    });
  }

  if (
    typeof logseqSettings.pollingInterval === "undefined" ||
    logseqSettings.pollingInterval === null
  ) {
    await logseq.updateSettings({
      pollingInterval: 60000,
    });
  }

  if (!logseq.settings!.inboxByChat) {
    await logseq.updateSettings({
      inboxByChat: [],
    });
  }

  if (!logseqSettings.hasOwnProperty("botToken")) {
    await logseq.updateSettings({
      botToken: "",
    });
  }

  applySettingsSchema();

  if (!logseqSettings.botToken) {
    logseq.UI.showMsg("[Inbox Telegram] You should change plugin settings");
    return;
  }

  console.log("[Inbox Telegram] Started!");
  setTimeout(() => {
    process();
  }, 3000);

  if (logseqSettings.pollingInterval > 0) {
    startPolling();
  }
}

function applySettingsSchema() {
  const settings: SettingSchemaDesc[] = [
    {
      key: "botToken",
      description: "Telegram Bot token. In order to start you need to create Telegram bot: https://core.telegram.org/bots#3-how-do-i-create-a-bot. Create a bot with BotFather, which is essentially a bot used to create other bots. The command you need is /newbot. After you choose title, BotFaher give you the token",
      type: "string",
      default: "",
      title: "Bot token",
    },
    {
      key: "pollingInterval",
      description:
        "This interval will be used to get new messages from Telegram bot",
      type: "number",
      default: 600000,
      title: "Polling interval (milliseconds)",
    },
    {
      key: "inboxName",
      description:
        "Messages will be pasted in daily journal into block with text, specified in inboxName property. Replace it in case of necessary. If you don't want to group messages, set inboxName property to null. In this case messages will be inserted directly into page block",
      type: "string",
      default: "#inbox",
      title: "Title in daily journal",
    },
    {
      key: "withoutAuthorizedUsers",
      description: "⚠️ RISK: Any message who send to bot will be handled. Learn more in readme file. If enabled, all messages will be pasted in graph.",
      type: "boolean",
      default: false,
      title: "Forward all message without authorizedUsers",
    },
    {
      key: "authorizedUsers",
      description:
        "Be sure to add your username in authorizedUsers array, because your recently created bot is publicly findable and other peoples may send messages to your bot. For example \"authorizedUsers\": [\"your_username\"]. If you leave this array empty - all messages from all users will be processed!",
      type: "object",
      default: [],
      title: "authorizedUsers",
    },
    {
      key: "useActiveGraph",
      description: "If enabled, bot messages will be sent to the currently active graph",
      type: "boolean",
      default: true,
      title: "Paste messages to currently active graph",
    },
    {
      key: "botTargetGraph",
      description: "Specify the graph where bot messages should be received, used only if useActiveGraph is false",
      type: "string",
      default: "",
      title: "Bot Target Graph",
    },
    {
      key: "addTimestamp",
      description:
        "If this set to true, message received time in format HH:mm will be added to message text, for example 21:13 - Test message",
      type: "boolean",
      default: false,
      title: "Add timestamp",
    },
    {
      key: "invertMessagesOrder",
      description:
        "New messages adds to the top of node by default, this setting will inverse the order of added messages, new messages will be added to the bottom of node",
      type: "boolean",
      default: false,
      title: "Invert messages order",
    },
    {
      key: "inboxByChat",
      description:
        "Allows to set multiple inboxes, more information at https://github.com/shady2k/logseq-inbox-telegram-plugin#multiple-inboxes",
      type: "object",
      default: [],
      title: "Allows to set multiple inboxes",
    },
    {
      key: "isDebug",
      description:
        "Debug mode. Usually you don't need this. Use it if you are developer or developers asks you to turn this on",
      type: "boolean",
      default: false,
      title: "Debug mode",
    },
  ];
  logseq.useSettingsSchema(settings);
}

function startPolling() {
  console.log("[Inbox Telegram] Polling started!");
  setInterval(() => process(), logseq.settings!.pollingInterval);
}

async function process() {
  log("Processing");

  if (!logseq.settings!.useActiveGraph) {
    const botTargetGraph = logseq.settings!.botTargetGraph;
    const currentGraph = await logseq.App.getCurrentGraph();
    if (currentGraph?.name !== botTargetGraph) {
      log(`Not in the bot target graph: ${botTargetGraph}, current graph: ${currentGraph?.name}, skipped`);
      return;
    }
  }

  if (isProcessing) {
    log("Already running, processing skipped");
    return;
  }

  isProcessing = true;

  const messages = await (async () => {
    try {
      const res = await getMessages();
      return res;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  })();

  log({ messages });
  if (!messages || messages.length === 0) {
    isProcessing = false;
    return;
  }

  const todayJournalPage = await getTodayJournal();
  if (
    !todayJournalPage ||
    todayJournalPage.length <= 0 ||
    !todayJournalPage[0].name
  ) {
    logseq.UI.showMsg(
      "[Inbox Telegram] Cannot get today's journal page",
      "error"
    );
    isProcessing = false;
    return;
  }

  const defaultInboxName = logseq.settings!.inboxName || null;
  const inboxByChat = logseq.settings!.inboxByChat;

  function getInboxByChatId(chatId: number): string {
    if (!inboxByChat) return defaultInboxName;
    const obj = inboxByChat.find(
      (item: { chatId: number }) => item.chatId === chatId
    );
    if (obj && obj.inboxName && obj.inboxName !== "") {
      return obj.inboxName;
    } else {
      return defaultInboxName;
    }
  }

  const grouped = messages.reduce(
    (groups, item) => ({
      ...groups,
      [getInboxByChatId(item.chatId)]: [
        ...(groups[getInboxByChatId(item.chatId)] || []),
        item.text,
      ],
    }),
    {} as IGroup
  );

  Object.entries(grouped).forEach(async ([inboxName, messages]) => {
    await insertMessages(todayJournalPage[0].name, inboxName, messages);
  });

  logseq.UI.showMsg("[Inbox Telegram] Messages added to inbox", "success");

  const uniqueChats = [...new Set(messages.map((item) => item.chatId))];
  const newInboxByChat = inboxByChat.slice();
  uniqueChats.forEach(async (chatId) => {
    const obj = inboxByChat.find(
      (item: { chatId: number }) => item.chatId === chatId
    );
    if (!obj) {
      newInboxByChat.push({
        chatId,
        inboxName: defaultInboxName,
      });
    }
  });

  await logseq.updateSettings({
    inboxByChat: newInboxByChat,
  });
}

async function insertMessages(
  todayJournalPageName: string,
  inboxName: string | null,
  messages: string[]
) {
  const inboxBlock = await checkInbox(todayJournalPageName, inboxName);
  if (!inboxBlock) {
    isProcessing = false;
    logseq.UI.showMsg("[Inbox Telegram] Cannot get inbox block", "error");
    return;
  }

  const blocks = messages.map((message) => ({ content: message }));
  const params = {
    sibling: false,
    before: true
  };

  let targetBlock = inboxBlock.uuid;
 
  if (logseq.settings!.invertMessagesOrder) {
    const inboxBlockTree = await logseq.Editor.getBlock(inboxBlock.uuid, { includeChildren: true });
    if (inboxBlockTree && inboxBlockTree.children && inboxBlockTree?.children?.length > 0) {
      const block = inboxBlockTree?.children[inboxBlockTree?.children?.length - 1] as BlockEntity
      if (block && block.uuid) {
        targetBlock = block.uuid
        params.sibling = true
      }
    }
  }

  if (inboxName === null || inboxName === "null" || inboxName === "") {
    params.sibling = true;
    if (logseq.settings!.invertMessagesOrder) {
      params.before = false
    }
  }

  log({ inboxBlock, blocks, params });
  await logseq.Editor.insertBatchBlock(targetBlock, blocks, params);

  isProcessing = false;
}

async function checkInbox(pageName: string, inboxName: string | null) {
  log({ pageName, inboxName });
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);

  if (inboxName === null || inboxName === "null" || inboxName === "") {
    log("No group");
    return pageBlocksTree[0];
  }

  let inboxBlock;
  inboxBlock = pageBlocksTree.find((block: { content: string }) => {
    return block.content === inboxName;
  });

  if (!inboxBlock) {
    const newInboxBlock = await logseq.Editor.insertBlock(
      pageBlocksTree[pageBlocksTree.length - 1].uuid,
      inboxName,
      {
        before: pageBlocksTree[pageBlocksTree.length - 1].content ? false : true,
        sibling: true
      }
    );
    return newInboxBlock;
  } else {
    return inboxBlock;
  }
}

async function getTodayJournal() {
  const d = new Date();
  const todayDateObj = {
    day: `${d.getDate()}`.padStart(2, "0"),
    month: `${d.getMonth() + 1}`.padStart(2, "0"),
    year: d.getFullYear(),
  };
  const todayDate = `${todayDateObj.year}${todayDateObj.month}${todayDateObj.day}`;

  let ret;
  try {
    ret = await logseq.DB.datascriptQuery(`
      [:find (pull ?p [*])
       :where
       [?b :block/page ?p]
       [?p :block/journal? true]
       [?p :block/journal-day ?d]
       [(= ?d ${todayDate})]]
    `);
  } catch (e) {
    console.error(e);
  }

  return (ret || []).flat();
}

function getMessages(): Promise<IMessagesList[] | undefined> {
  return new Promise((resolve, reject) => {
    let updateId: number;
    let messages: IMessagesList[] = [];
    const botToken = logseq.settings!.botToken;

    const payload: IPayload = {
      ...(logseq.settings!.updateId && {
        offset: logseq.settings!.updateId + 1,
      }),
    };

    axios
      .post(`https://api.telegram.org/bot${botToken}/getUpdates`, payload)
      .then(async function (response) {
        if (response && response.data && response.data.ok) {
          const resArr = response.data.result;


          for (const res of resArr) {
            const element: IUpdate = res;

            updateId = element.update_id;
            if (
              element.message &&
              element.message.text &&
              element.message.date
            ) {
              const withoutAuthorizedUsers: boolean =
                logseq.settings!.withoutAuthorizedUsers;
              if(!withoutAuthorizedUsers) {
                if(!element.message.from.username) {
                  // NOTE: when not set all messages forwards setting && without username, do nothing
                  continue;
                }

                const authorizedUsers: string[] =
                  logseq.settings!.authorizedUsers;
                if (authorizedUsers && authorizedUsers.length > 0) {
                  if (!authorizedUsers.includes(element.message.from.username)) {
                    log({
                      name: "Ignore messages, user not authorized",
                      element,
                    });
                    return;
                  }
                }
              }

              const text = ((telegramText: string, addTimestamp: boolean) => {
                if (addTimestamp) {
                  return `${dayjs
                    .unix(element.message.date)
                    .format("HH:mm")} - ${telegramText}`;
                } else {
                  return telegramText;
                }
              })(element.message.text, logseq.settings!.addTimestamp);

              log({
                name: "Push in group messages",
                element: element.message.chat.id,
                text,
              });
              messages.push({
                chatId: element.message.chat.id,
                text,
              });
            }

            if (
              element.channel_post &&
              element.channel_post.text &&
              element.channel_post.date
            ) {
              const text = ((telegramText: string, addTimestamp: boolean) => {
                if (addTimestamp) {
                  return `${dayjs
                    .unix(element.channel_post.date)
                    .format("HH:mm")} - ${telegramText}`;
                } else {
                  return telegramText;
                }
              })(element.channel_post.text, logseq.settings!.addTimestamp);

              log({
                name: "Push in channel messages",
                element: element.channel_post.chat.id,
                text,
              });
              messages.push({
                chatId: element.channel_post.chat.id,
                text,
              });
            }
          }

          await logseq.updateSettings({
            updateId,
          });

          resolve(messages);
        } else {
          logseq.UI.showMsg(
            "[Inbox Telegram] Unable to parse Telegram response",
            "error"
          );
          reject();
        }
      })
      .catch(function (error) {
        console.error(error);
        reject(error);
      });
  });
}

// bootstrap
logseq.ready(main).catch(console.error);
