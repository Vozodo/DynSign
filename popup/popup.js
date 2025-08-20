// Load the last timestamp when loading the popup
document.addEventListener("DOMContentLoaded", async () => {
    const result = await browser.storage.local.get("lastUpdate");
    if (result.lastUpdate)
    {
        document.getElementById("lastUpdate").textContent = formatDate(result.lastUpdate);
    }
});

document.getElementById("refresh").addEventListener("click", async () => {
    try
    {
        const response = await browser.runtime.sendMessage({ action: "refreshSignature" });
        if (response.success)
        {
            showStatus("Signatures updated!", 'success');

            // show new timestamp and show
            const now = new Date().toISOString();
            await browser.storage.local.set({ lastUpdate: now });
            document.getElementById("lastUpdate").textContent = formatDate(now);
        } else
        {
            showStatus("Error: " + response.error, 'error');
        }
    } catch (error)
    {
        showStatus("Error: " + error.message, 'error');
    }
});

// Respond to changes in local storage
browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.lastUpdate)
    {
        const newValue = changes.lastUpdate.newValue;
        if (newValue)
        {
            document.getElementById("lastUpdate").textContent = formatDate(newValue);
        }
    }
});

// Format date
function formatDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleString();
}

// Helper function for status
function showStatus(msg, type = "info") {
    const statusEl = document.getElementById("status");
    statusEl.textContent = msg;

    statusEl.classList.remove("success", "error", "info");
    statusEl.classList.add(type);
    statusEl.style.display = "block";

    // hide again after 3 seconds
    setTimeout(() => {
        statusEl.style.display = "none";
        statusEl.textContent = "";
    }, 3000);
}
