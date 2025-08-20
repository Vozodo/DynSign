// Default options on install
document.addEventListener("DOMContentLoaded", async () => {
    const defaults = {
        url: "https://example.com/signature?mail={{email}}&name={{accountName}}",
        interval: "15",
    };

    const settings = await browser.storage.local.get(defaults);

    document.getElementById("url").value = settings.url;
    document.getElementById("interval").value = settings.interval;
});


// Optionen beim Laden setzen
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

// Speichern
document.getElementById("save").addEventListener("click", async () => {
    const url = document.getElementById("url").value.trim();
    const interval = document.getElementById("interval").value;

    try
    {
        await browser.storage.local.set({ url, interval });

        // Alarm neu setzen
        if (interval)
        {
            browser.alarms.create("refreshSignature", { periodInMinutes: parseInt(interval) });
        }

        // Statusmeldung anzeigen
        showStatus("✅ Einstellungen gespeichert!");
    } catch (e)
    {
        console.error("Fehler beim Speichern:", e);
        showStatus("❌ Fehler beim Speichern");
    }
});

// Sofortige Aktualisierung
document.getElementById("refreshNow").addEventListener("click", () => {
    browser.runtime.sendMessage({ action: "refreshSignature" })
        .then(() => showStatus("🔄 Signatur jetzt aktualisiert!"))
        .catch(err => {
            console.error("Fehler beim sofortigen Refresh:", err);
            showStatus("❌ Fehler beim Aktualisieren");
        });
});

// Test Button
document.getElementById("testUrl").addEventListener("click", async () => {
    const rawUrl = document.getElementById("url").value.trim();
    if (!rawUrl)
    {
        showStatus("❌ Bitte zuerst eine URL eingeben", "error");
        return;
    }

    // Prüfen ob gültige HTTP/HTTPS-URL
    if (!isValidHttpUrl(rawUrl))
    {
        showStatus("❌ Ungültige URL. Bitte mit http:// oder https:// angeben.", "error");
        return;
    }

    try
    {
        // Platzhalter durch Dummy-Werte ersetzen
        const testUrl = rawUrl
            .replace("{{email}}", encodeURIComponent("test@example.com"))
            .replace("{{accountName}}", "TestAccount")
            .replace("{{date}}", new Date().toISOString().slice(0, 10));

        console.log("Teste URL:", testUrl);
        const response = await fetch(testUrl, { method: "GET" });

        if (response.ok)
        {
            showStatus(`✅ Test erfolgreich (HTTP ${ response.status })`, "success");
        } else
        {
            showStatus(`❌ Test fehlgeschlagen (HTTP ${ response.status })`, "error");
        }
    } catch (err)
    {
        console.error("Fehler beim Test:", err);
        showStatus("❌ Fehler beim Abrufen der URL", "error");
    }
});

// Hilfsfunktion
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


// Hilfsfunktion für Statusmeldung
function showStatus(msg) {
    const statusEl = document.getElementById("status");
    statusEl.textContent = msg;
    setTimeout(() => { statusEl.textContent = ""; }, 3000);
}

function showStatus(msg, type = "info") {
    const statusEl = document.getElementById("status");
    statusEl.textContent = msg;

    // Alle möglichen Klassen entfernen
    statusEl.classList.remove("success", "error", "info");

    // Neue Klasse setzen
    statusEl.classList.add(type);

    // Sichtbar machen
    statusEl.style.display = "block";

    // Nach 3 Sekunden wieder ausblenden
    setTimeout(() => {
        statusEl.style.display = "none";
        statusEl.textContent = "";
    }, 3000);
}

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
