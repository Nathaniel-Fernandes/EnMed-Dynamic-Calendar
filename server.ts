import express from "express";
import { chromium } from "playwright";
import ical from "ical-generator";
import { DateTime } from "luxon";

const app = express();

app.get("/", async (req, res) => {
    res.send(`
    Available links:

    <pre>
    - https://enmed-dynamic-calendar.onrender.com/M0/calendar.ics
    - https://enmed-dynamic-calendar.onrender.com/M1/calendar.ics
    - https://enmed-dynamic-calendar.onrender.com/M2/calendar.ics
    - https://enmed-dynamic-calendar.onrender.com/M3/calendar.ics
    - https://enmed-dynamic-calendar.onrender.com/M4/calendar.ics
    </pre>
    `);
});

app.get("/:mc/calendar.ics", async (req, res) => {
    const mc = req.params.mc;

    const validMCs = ["M0", "M1", "M2", "M3", "M4"];

    if (!validMCs.includes(mc)) {
        return res.status(400).send("Invalid URL");
    }

    const browser = await chromium.launch({
        headless: true,
    });

    try {
        const page = await browser.newPage();

        await page.goto("https://tamu-edu.github.io/enmed-pct-calendar/", {
            waitUntil: "networkidle",
        });

        // Click "List" view button
        await page.getByRole("button", { name: "List" }).click();

        // Click M2 button
        await page.locator(`[data-mc="${mc}"]`).click();

        // Wait for calendar to update
        await page.waitForTimeout(1000);

        const rawEvents = await page
            .locator(".event")
            .evaluateAll((elements) =>
                elements.map((el) => el.getAttribute("onclick"))
            );

        console.log(rawEvents);

        const calendar = ical({
            name: `EnMed ${mc} Calendar`,
        });

        for (const onclick of rawEvents) {
            if (!onclick) return;

            const match = onclick.match(/handleEventClick\(event,(\{.*\})\)/);

            if (!match) return;

            const data = JSON.parse(match[1]);

            // const start = new Date(`${data.date} ${data.start} CST`);
            // const end = new Date(`${data.date} ${data.end} CST`);

            const start = DateTime.fromFormat(
                `${data.date} ${data.start}`,
                "MM/dd/yyyy HH:mm",
                { zone: "America/Chicago" }
            ).toJSDate();

            const end = DateTime.fromFormat(
                `${data.date} ${data.end}`,
                "MM/dd/yyyy HH:mm",
                { zone: "America/Chicago" }
            ).toJSDate();

            let title = "";
            if (data.mand.toLowerCase() !== "no") {
                title += `[MAND] `;
            }
            title += `${data.title} - ${data.block}`;

            calendar.createEvent({
                uid: data._id,
                start,
                end,
                summary: title,
                description: `
                    Mand: ${data.mand || ""} \nGroup: ${
                    data.group || ""
                } \nPresenter: ${data.presenter || ""}\n\n${data.info || ""}
                `.trim(),
                location: data.location,
            });
        }

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader("Cache-Control", "public, max-age=300, s-maxage=300");
        res.setHeader("ETag", `"enmed-${mc}"`);
        res.setHeader("Content-Type", "text/calendar");

        res.send(calendar.toString());
    } catch (err) {
        console.error(err);
        res.status(500).send("Error generating calendar");
    } finally {
        await browser.close();
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Calendar running!");
});
