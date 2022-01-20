import "@logseq/libs";
import axios from "axios";

/**
 * main entry
 */
async function main() {
    test();
}

interface Payload {
    offset?: number;
}

function test() {
    let update_id: number;
    const settings = logseq.settings;

    if (!settings) {
        logseq.App.showMsg("No settings defined");
        return;
    }

    if (!settings.botToken) {
        logseq.App.showMsg("Bot token must be defined");
        return;
    }
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
                        console.log(element.message.text);
                    }
                );

                logseq.updateSettings({
                    updateId: update_id,
                });
            } else {
                logseq.App.showMsg("Unable to parse response");
            }
        })
        .catch(function (error) {
            console.log(error);
        });
}

// bootstrap
logseq.ready(main).catch(console.error);
