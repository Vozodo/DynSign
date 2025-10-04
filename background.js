class DynamicSignatureAPI {
    async downloadAndSetSignature(identityId, emailAddress, name, organization, urlTemplate) {
        try
        {
            let url = urlTemplate.replace('{{email}}', encodeURIComponent(emailAddress));
            url = url.replace('{{version}}', encodeURIComponent(browser.runtime.getManifest().version));
            url = url.replace('{{date}}', Date.now());
            url = url.replace('{{name}}', encodeURIComponent(name));
            url = url.replace('{{organization}}', encodeURIComponent(organization));
            url = url.replace('{{lang}}', encodeURIComponent(navigator.language));

            debugLog("Loading signature from URL:", url);

            const response = await fetch(url);
            debugLog("HTTP status:", response.status);

            if (!response.ok) throw new Error(`HTTP error! status: ${ response.status }`);
            const signatureHTML = await response.text();

            debugLog("Signature successfully loaded, length:", signatureHTML.length);

            await browser.identities.update(identityId, {
                signature: signatureHTML,
                signatureIsPlainText: false
            });

            debugLog(`Signature for ${ emailAddress } updated (Identity: ${ identityId })`);

            // save last update in local storage
            await browser.storage.local.set({
                lastUpdate: new Date().toISOString()
            });

            return { success: true };
        } catch (err)
        {
            console.error("Error setting signature:", err, "Identity:", identityId, "Email:", emailAddress);
            return { success: false, error: err.message };
        }
    }

    async init() {
        const result = await browser.storage.local.get(["url", "emailSettings"]);
        const urlTemplate = result.url;
        const emailSettings = result.emailSettings || {};

        if (!urlTemplate)
        {
            console.warn("No URL found in storage.local");
            return;
        }

        const accounts = await browser.accounts.list();

        for (const acc of accounts)
        {
            for (const identity of acc.identities)
            {
                const isEnabled = emailSettings[identity.email] !== false;

                if (isEnabled)
                {
                    // load signature
                    try
                    {
                        await this.downloadAndSetSignature(identity.id, identity.email, identity.name, identity.organization, urlTemplate);
                    } catch (err)
                    {
                        debugLog("Error with Identity:", identity.id, err);
                    }
                }
            }
        }
    }


}

// Instance of API
const signatureAPI = new DynamicSignatureAPI();

// Init with settings
async function initWithSettings() {
    const result = await browser.storage.local.get(["url", "interval"]);
    const url = result.url || "";
    const interval = parseInt(result.interval) || 15;

    if (url)
    {
        await signatureAPI.init();
        browser.alarms.create("refreshSignature", { periodInMinutes: interval });
    } else
    {
        console.warn("No URL configured – initialization skipped");
    }
}

// START!
initWithSettings();

// Manual refresh via messages
browser.runtime.onMessage.addListener((request) => {
    if (request.action === "refreshSignature")
    {
        return (async () => {
            try
            {
                await signatureAPI.init();
                const now = new Date().toISOString();
                await browser.storage.local.set({ lastUpdate: now });
                return { success: true };
            } catch (err)
            {
                return { success: false, error: err.message };
            }
        })();
    }

    // If any other action occurs always return something
    return Promise.resolve({ success: false, error: "Unknown action" });
});

// Automatic refresh via alarm
browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "refreshSignature")
    {
        signatureAPI.init();
    }
});

async function debugLog(...args) {
    const { debug } = await browser.storage.local.get("debug");
    if (debug)
    {
        console.log(...args);
    }
}