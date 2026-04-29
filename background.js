class DynamicSignatureAPI {
    async downloadAndCacheSignature(identityId, emailAddress, name, organization, urlTemplate) {
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

            debugLog("Signature loaded, length:", signatureHTML.length);

            const stored = await browser.storage.local.get("signatures");
            const signatures = stored.signatures || {};
            signatures[identityId] = { html: signatureHTML, email: emailAddress };

            await browser.storage.local.set({
                signatures,
                lastUpdate: new Date().toISOString()
            });

            debugLog(`Signature for ${ emailAddress } cached (Identity: ${ identityId })`);

            return { success: true };
        } catch (err)
        {
            console.error("Error caching signature:", err, "Identity:", identityId, "Email:", emailAddress);
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
                    try
                    {
                        await this.downloadAndCacheSignature(
                            identity.id, identity.email, identity.name, identity.organization, urlTemplate
                        );
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

// Manual refresh via messages — registered early so popup/options always have a receiver
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

    return Promise.resolve({ success: false, error: "Unknown action" });
});

// Tracks which compose tabs have already received a signature injection
const injectedTabs = new Set();

// Primary trigger: compose window opened
browser.windows.onCreated.addListener(async (windowInfo) => {
    if (windowInfo.type !== "messageCompose") return;

    // Wait for compose window to finish initializing
    await new Promise(resolve => setTimeout(resolve, 500));

    let tabId;
    try
    {
        if (windowInfo.tabs && windowInfo.tabs.length > 0)
        {
            tabId = windowInfo.tabs[0].id;
        } else
        {
            const tabs = await browser.tabs.query({ windowId: windowInfo.id });
            tabId = tabs[0]?.id;
        }

        if (!tabId || injectedTabs.has(tabId)) return;

        // For reply/forward, Thunderbird loads the quoted content asynchronously after
        // the window opens — injecting here would overwrite it with an empty body.
        // Defer to onComposeBodyChanged, which fires once the quoted text is ready.
        const details = await browser.compose.getComposeDetails(tabId);
        const appendTypes = ["new", "draft", "template", "editAsNew"];
        if (details && !appendTypes.includes(details.type))
        {
            // Poll every 200ms until the quoted content is loaded, then inject immediately.
            // Gives up after 3s (15 attempts) as a last-resort fallback.
            let attempts = 0;
            const poll = async () => {
                if (injectedTabs.has(tabId)) return;
                attempts++;
                try
                {
                    const d = await browser.compose.getComposeDetails(tabId);
                    const ready = d?.body?.includes("moz-cite-prefix") || d?.body?.includes("moz-forward-container") || d?.body?.includes("<blockquote");
                    if (ready || attempts >= 15)
                    {
                        injectedTabs.add(tabId);
                        await injectSignatureToCompose(tabId).catch(() => injectedTabs.delete(tabId));
                    } else
                    {
                        setTimeout(poll, 200);
                    }
                } catch { if (attempts < 15) setTimeout(poll, 200); }
            };
            setTimeout(poll, 200);
            return;
        }

        injectedTabs.add(tabId);
        await injectSignatureToCompose(tabId);
    } catch (err)
    {
        // Allow fallback via onComposeBodyChanged
        if (tabId) injectedTabs.delete(tabId);
        debugLog("Error injecting signature via window:", err);
    }
});

// Fallback: inject on first body change if the window listener missed it.
// For reply/forward this is the primary trigger — fires once Thunderbird has
// loaded the quoted content into the compose body.
if (browser.compose?.onComposeBodyChanged)
{
    browser.compose.onComposeBodyChanged.addListener(async (tab) => {
        if (injectedTabs.has(tab.id)) return;

        try
        {
            const details = await browser.compose.getComposeDetails(tab.id);
            if (!details || details.isPlainText) return;

            const appendTypes = ["new", "draft", "template", "editAsNew"];
            const isReplyOrForward = !appendTypes.includes(details.type);

            // For reply/forward, wait until Thunderbird has inserted the quoted block.
            const body = details.body ?? "";
            const quoteReady = body.includes("moz-cite-prefix") || body.includes("moz-forward-container") || body.includes("<blockquote");
            if (isReplyOrForward && !quoteReady) return;

            injectedTabs.add(tab.id);
            await injectSignatureToCompose(tab.id);
        } catch (err)
        {
            injectedTabs.delete(tab.id);
            debugLog("Error injecting signature on body change:", err);
        }
    });
}

// Clean up when compose tab is closed
if (browser.tabs?.onRemoved)
{
    browser.tabs.onRemoved.addListener((tabId) => {
        injectedTabs.delete(tabId);
    });
}

async function injectSignatureToCompose(tabId) {
    const details = await browser.compose.getComposeDetails(tabId);
    if (!details || details.isPlainText) return;

    const { identityId } = details;
    if (!identityId) return;

    const stored = await browser.storage.local.get(["signatures", "emailSettings"]);
    const signatures = stored.signatures || {};
    const sig = signatures[identityId];
    if (!sig) return;

    const emailSettings = stored.emailSettings || {};
    if (emailSettings[sig.email] === false) return;

    const sigHtml = `<div data-dynsign="true">${ sig.html }</div>`;
    const currentBody = details.body || "";

    const appendTypes = ["new", "draft", "template", "editAsNew"];
    let newBody;
    if (appendTypes.includes(details.type))
    {
        newBody = currentBody + "<br>" + sigHtml;
    } else
    {
        // Insert before Thunderbird's citation/forward block:
        //   reply  → moz-cite-prefix div  ("On X wrote:")
        //   forward → moz-forward-container div
        //   fallback → first <blockquote
        let insertAt = -1;
        const mozReply = currentBody.indexOf("moz-cite-prefix");
        const mozFwd   = currentBody.indexOf("moz-forward-container");
        const anchor   = mozReply !== -1 ? mozReply : mozFwd;
        if (anchor !== -1)
            insertAt = currentBody.lastIndexOf("<", anchor);
        if (insertAt === -1)
            insertAt = currentBody.indexOf("<blockquote");

        newBody = insertAt !== -1
            ? currentBody.slice(0, insertAt) + sigHtml + "<br>" + currentBody.slice(insertAt)
            : currentBody + "<br>" + sigHtml;
    }

    await browser.compose.setComposeDetails(tabId, { body: newBody });
    debugLog(`Signature injected for tab ${ tabId } (${ details.type }, identity: ${ identityId })`);
}

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
