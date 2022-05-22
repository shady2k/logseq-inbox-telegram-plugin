import "@logseq/libs";
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
    };
  };
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
    logseq.App.showMsg("[Inbox Telegram] Cannot get settings", "error");
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
  } else {
    // Dirty hack, because Logseq has bug while working with arrays
    const newInboxByChat = logseq.settings!.inboxByChat.filter(
      (value: { chatId: number }, index: number, self: { chatId: number }[]) =>
        index ===
        self.findIndex((t: { chatId: number }) => t.chatId === value.chatId)
    );

    await logseq.updateSettings({
      inboxByChat: {},
    });

    await logseq.updateSettings({
      inboxByChat: newInboxByChat,
    });
  }

  if (!logseqSettings.botToken) {
    logseq.App.showMsg("[Inbox Telegram] You should change plugin settings");
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

function startPolling() {
  console.log("[Inbox Telegram] Polling started!");
  setInterval(() => process(), logseq.settings!.pollingInterval);
}

async function process() {
  log("Processing");
  if (isProcessing) {
    log("Processing skipped");
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
    logseq.App.showMsg(
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

  logseq.App.showMsg("[Inbox Telegram] Messages added to inbox", "success");

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

  // Dirty hack, because Logseq has bug while working with arrays
  await logseq.updateSettings({
    inboxByChat: {},
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
    logseq.App.showMsg("[Inbox Telegram] Cannot get inbox block", "error");
    return;
  }

  const blocks = messages.map((message) => ({ content: message }));

  const params = {
    sibling: false,
  };

  if (inboxName === null || inboxName === "null") {
    params.sibling = true;
  }

  log({ inboxBlock, blocks, params });
  await logseq.Editor.insertBatchBlock(inboxBlock.uuid, blocks, params);

  isProcessing = false;
}

async function checkInbox(pageName: string, inboxName: string | null) {
  log({ pageName, inboxName });
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);

  if (inboxName === null || inboxName === "null") {
    log("No group");
    return pageBlocksTree[0];
  }

  let inboxBlock;
  inboxBlock = pageBlocksTree.find((block: { content: string; }) => {
    return block.content === inboxName;
  });

  if (!inboxBlock) {
    if (pageBlocksTree.length === 1) {
      if (!pageBlocksTree[0].content) {
        const newInboxBlock = await logseq.Editor.insertBlock(
          pageBlocksTree[0].uuid,
          inboxName,
          {
            before: true,
          }
        );
        return newInboxBlock;
      } else {
        const newInboxBlock = await logseq.Editor.insertBlock(
          pageBlocksTree[0].uuid,
          inboxName,
          {
            before: false,
          }
        );
        return newInboxBlock;
      }
    } else if (pageBlocksTree.length > 1) {
      const newInboxBlock = await logseq.Editor.insertBlock(
        pageBlocksTree[pageBlocksTree.length - 1].uuid,
        inboxName,
        {
          before: false,
        }
      );
      return newInboxBlock;
    } else {
      logseq.App.showMsg("[Inbox Telegram] Unexpected error, please report about it", "error");
    }
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

          resArr.forEach((element: IUpdate) => {
            updateId = element.update_id;
            if (
              element.message &&
              element.message.text &&
              element.message.date &&
              element.message.from.username
            ) {
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
                name: "Push in messages",
                element: element.message.chat.id,
                text,
              });
              messages.push({
                chatId: element.message.chat.id,
                text,
              });
            }
          });

          await logseq.updateSettings({
            updateId,
          });

          resolve(messages);
        } else {
          logseq.App.showMsg(
            "[Inbox Telegram] Unable to parse Telegram response",
            "error"
          );
          reject();
        }
      })
      .catch(function (error) {
        console.log(error);
        reject(error);
      });
  });
}

// bootstrap
logseq.ready(main).catch(console.error);
