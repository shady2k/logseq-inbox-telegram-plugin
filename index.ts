import "@logseq/libs";
import { ILSPluginUser } from "@logseq/libs";
import axios from "axios";

let settings: ILSPluginUser.settings;

/**
 * main entry
 */
async function main() {
    settings = logseq.settings;

    if (!settings) {
        logseq.App.showMsg("No settings defined");
        return;
    }

    if (!settings.botToken) {
        logseq.App.showMsg("Bot token must be defined");
        return;
    }

    const todayJournalPage = await getTodayJournal();
    if (
        !todayJournalPage &&
        todayJournalPage.length <= 0 &&
        !todayJournalPage[0].name
    ) {
        logseq.App.showMsg("Cannot get today's journal page");
        return;
    }

    const inboxName = settings.inboxName ? settings.inboxName : "#inbox";
    const inboxBlock = await checkInbox(todayJournalPage[0].name, inboxName);
    if (!inboxBlock) {
        logseq.App.showMsg("Cannot get inbox block");
        return;
    }

    const messages = await getMessages();
    if (!messages || messages.length === 0) {
        return;
    }

    const blocks = messages.map((message) => ({ content: message }));
    await logseq.Editor.insertBatchBlock(inboxBlock.uuid, blocks, {
        sibling: false,
    });

    logseq.App.showMsg("Messages added to inbox");
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
    console.log(todayDate);
    return (ret || []).flat();
}

function getMessages(): Promise<string[] | undefined> {
    interface Payload {
        offset?: number;
    }

    return new Promise((resolve, reject) => {
        let update_id: number;
        let messages: string[] = [];
        const botToken = settings.botToken;

        const payload: Payload = {
            ...(settings.updateId && {
                offset: settings.updateId + 1,
            }),
        };

        axios
            .post(`https://api.telegram.org/bot${botToken}/getUpdates`, payload)
            .then(function (response) {
                if (response && response.data && response.data.ok) {
                    const resArr = response.data.result;

                    resArr.forEach(
                        (element: {
                            update_id: number;
                            message: { text: string };
                        }) => {
                            update_id = element.update_id;
                            messages.push(element.message.text);
                        }
                    );

                    logseq.updateSettings({
                        updateId: update_id,
                    });

                    resolve(messages);
                } else {
                    logseq.App.showMsg("Unable to parse response");
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
