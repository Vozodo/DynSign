// Default options on install
document.addEventListener("DOMContentLoaded", async () => {
    const defaults = {
        url: "https://vozodo.it/mailsign.php?e={{email}}&n={{name}}&o={{organization}}",
        interval: "15",
        debug: false
    };

    const settings = await browser.storage.local.get(defaults);

    document.getElementById("url").value = settings.url;
    document.getElementById("interval").value = settings.interval;
    document.getElementById("debug").checked = settings.debug;

    await renderEmailList();
});


// set options on loading
document.addEventListener("DOMContentLoaded", async () => {
    try
    {
        const result = await browser.storage.local.get(["url", "interval"]);
        if (result.url)
        {
            document.getElementById("url").value = result.url;
        }
        if (result.interval)
        {
            document.getElementById("interval").value = result.interval;
        }
    } catch (e)
    {
        console.error("Error while loading Settings:", e);
    }
});

// save
document.getElementById("save").addEventListener("click", async () => {
    const url = document.getElementById("url").value.trim();
    const interval = document.getElementById("interval").value;
    const debug = document.getElementById("debug").checked;


    try
    {
        await browser.storage.local.set({ url, interval, debug });

        if (interval)
        {
            browser.alarms.create("refreshSignature", { periodInMinutes: parseInt(interval) });
        }

        showStatus("Settings saved!", "success");
    } catch (e)
    {
        console.error("Error while saving:", e);
        showStatus("Error while saving", "error");
    }
});


// clean refresh
document.getElementById("refreshNow").addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "refreshSignature" })
        .then(() => showStatus("Signature now refreshed!"))
        .catch(err => {
            console.error("Error during instant refresh:", err);
            showStatus("Error during refresh", "error");
        });
});

// Test Button
document.getElementById("testUrl").addEventListener("click", async () => {
    const rawUrl = document.getElementById("url").value.trim();
    if (!rawUrl)
    {
        showStatus("Please enter a URL first", "error");
        return;
    }

    // check if valid http/https
    if (!isValidHttpUrl(rawUrl))
    {
        showStatus("Invalid URL. Please specify with http:// or https://", "error");
        return;
    }

    try
    {
        // Replace placeholders with dummy values
        const testUrl = rawUrl
            .replace("{{email}}", encodeURIComponent("test@example.com"))
            .replace("{{accountName}}", "TestAccount")
            .replace("{{date}}", new Date().toISOString().slice(0, 10));

        debugLog("Test URL:", testUrl);
        const response = await fetch(testUrl, { method: "GET" });

        if (response.ok)
        {
            showStatus(`Test successful (HTTP ${ response.status })`, "success");
        } else
        {
            showStatus(`Test failed (HTTP ${ response.status })`, "error");
        }
    } catch (err)
    {
        console.error("Error during test:", err);
        showStatus("Error retrieving URL", "error");
    }
});

// Render accounts in options
async function renderEmailList() {
    const emailListDiv = document.getElementById("emailList");
    emailListDiv.innerHTML = ""; // clear first

    const accounts = await loadAccounts();
    const stored = await browser.storage.local.get("emailSettings");
    const emailSettings = stored.emailSettings || {};

    accounts.forEach(acc => {
        const isChecked = emailSettings[acc.email] !== false; // default true
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = acc.email;
        checkbox.checked = isChecked;
        checkbox.addEventListener("change", saveEmailSettings);

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(` ${ acc.name } <${ acc.email }>`));
        emailListDiv.appendChild(label);

    });
}

// Save email-specific settings
async function saveEmailSettings() {
    const checkboxes = document.querySelectorAll("#emailList input[type=checkbox]");
    const emailSettings = {};
    checkboxes.forEach(cb => {
        emailSettings[cb.value] = cb.checked;
    });
    await browser.storage.local.set({ emailSettings });
    debugLog("Email settings saved:", emailSettings);
}

// Helper for http check
function isValidHttpUrl(value) {
    try
    {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_)
    {
        return false;
    }
}

// Helper: load all Thunderbird accounts
async function loadAccounts() {
    const accounts = await browser.accounts.list();
    return accounts.flatMap(acc => acc.identities.map(id => ({ name: id.name, email: id.email })));
}


function showStatus(msg, type = "info") {
    const statusEl = document.getElementById("status");
    statusEl.textContent = msg;

    statusEl.classList.remove("success", "error", "info");

    statusEl.classList.add(type);

    statusEl.style.display = "block";

    setTimeout(() => {
        statusEl.style.display = "none";
        statusEl.textContent = "";
    }, 3000);
}


async function debugLog(...args) {
    const { debug } = await browser.storage.local.get("debug");
    if (debug)
    {
        console.log(...args);
    }
}

