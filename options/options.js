// Default options on install
document.addEventListener("DOMContentLoaded", async () => {
    const defaults = {
        url: "https://vozodo.it/mailsign.php?e={{email}}",
        interval: "15",
    };

    const settings = await browser.storage.local.get(defaults);

    document.getElementById("url").value = settings.url;
    document.getElementById("interval").value = settings.interval;
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
        console.error("Fehler beim Laden der Einstellungen:", e);
    }
});

// save
document.getElementById("save").addEventListener("click", async () => {
    const url = document.getElementById("url").value.trim();
    const interval = document.getElementById("interval").value;

    try
    {
        await browser.storage.local.set({ url, interval });

        // set alarm new
        if (interval)
        {
            browser.alarms.create("refreshSignature", { periodInMinutes: parseInt(interval) });
        }

        showStatus("Settings saved!");
    } catch (e)
    {
        console.error("Error while saving:", e);
        showStatus("Error while saving");
    }
});

// clean refresh
document.getElementById("refreshNow").addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "refreshSignature" })
        .then(() => showStatus("Signature now refreshed!"))
        .catch(err => {
            console.error("Error during instant refresh:", err);
            showStatus("Error during refresh");
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

        console.log("Teste URL:", testUrl);
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


// Helper for status
function showStatus(msg) {
    const statusEl = document.getElementById("status");
    statusEl.textContent = msg;
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
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
