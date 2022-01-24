import "@logseq/libs";
import axios from "axios";

let isProcessing = false;

/**
 * main entry
 */
async function main() {
  const logseqSettings = logseq.settings;

  if (!logseqSettings) {
    logseq.App.showMsg("[Inbox Telegram] Cannot get settings", "error");
    return;
  }

  if (!logseqSettings.inboxName) {
    await logseq.updateSettings({
      inboxName: "#inbox",
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

  if (!logseqSettings.botToken) {
    logseq.App.showMsg("[Inbox Telegram] You should change plugin settings");
    return;
  }

  console.log("[Inbox Telegram] Started!");
  setTimeout(() => {
    process();
  }, 5000);

  if (logseqSettings.pollingInterval > 0) {
    startPolling();
  }
}

function startPolling() {
  console.log("[Inbox Telegram] Polling started!");
  setInterval(() => process(), logseq.settings!.pollingInterval);
}

async function process() {
  if (isProcessing) return;
  isProcessing = true;

  const messages = await getMessages();
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

  const inboxName = logseq.settings!.inboxName || "#inbox";
  const inboxBlock = await checkInbox(todayJournalPage[0].name, inboxName);
  if (!inboxBlock) {
    isProcessing = false;
    logseq.App.showMsg("[Inbox Telegram] Cannot get inbox block", "error");
    return;
  }

  const blocks = messages.map((message) => ({ content: message }));
  await logseq.Editor.insertBatchBlock(inboxBlock.uuid, blocks, {
    sibling: false,
  });

  isProcessing = false;
  logseq.App.showMsg("[Inbox Telegram] Messages added to inbox", "success");
}

async function checkInbox(pageName: string, inboxName: string) {
  const pageBlocksTree = await logseq.Editor.getPageBlocksTree(pageName);

  let inboxBlock;
  inboxBlock = pageBlocksTree.find((block) => {
    return block.content === inboxName;
  });

  if (!inboxBlock) {
    const newInboxBlock = await logseq.Editor.insertBlock(
      pageBlocksTree[0].uuid,
      inboxName,
      {
        before: true,
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

function getMessages(): Promise<string[] | undefined> {
  interface Payload {
    offset?: number;
  }

  interface Update {
    update_id: number;
    message?: {
      photo?: [];
      text: string;
    };
  }

  return new Promise((resolve, reject) => {
    let updateId: number;
    let messages: string[] = [];
    const botToken = logseq.settings!.botToken;

    const payload: Payload = {
      ...(logseq.settings!.updateId && {
        offset: logseq.settings!.updateId + 1,
      }),
    };

    axios
      .post(`https://api.telegram.org/bot${botToken}/getUpdates`, payload)
      .then(function (response) {
        if (response && response.data && response.data.ok) {
          const resArr = response.data.result;

          resArr.forEach(
            (element: Update) => {
              updateId = element.update_id;
              if (element.message && element.message.photo && element.message.photo.length > 0) {
                
              }

              if (element.message && element.message.text) {
                messages.push(element.message.text);
              }
            }
          );

          logseq.updateSettings({
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
