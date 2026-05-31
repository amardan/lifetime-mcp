import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { chromium, BrowserContext, Page } from "playwright";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";
import express from "express";

dotenv.config();

const STATE_FILE = path.resolve("state.json");

const server = new Server(
  {
    name: "lifetime-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_classes",
        description: "List Life Time Fitness class schedule for a specific date and club.",
        inputSchema: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "The date to check in YYYY-MM-DD format (default: today)",
            },
            club: {
              type: "string",
              description: "The club path, e.g. 'va/ashburn-sterling' (default: configured LIFETIME_CLUB)",
            },
          },
        },
      },
      {
        name: "book_class",
        description: "Book/reserve a Life Time Fitness class for specified participants.",
        inputSchema: {
          type: "object",
          properties: {
            eventId: {
              type: "string",
              description: "The event ID of the class to book",
            },
            club: {
              type: "string",
              description: "The club path, e.g. 'va/ashburn-sterling' (default: configured LIFETIME_CLUB)",
            },
            participants: {
              type: "array",
              items: { type: "string" },
              description: "List of participant names to book (e.g. ['Atabak', 'Elmira']). If empty, books for the main account holder.",
            },
          },
          required: ["eventId"],
        },
      },
      {
        name: "get_my_bookings",
        description: "Retrieve your active reservations/bookings.",
        inputSchema: {
          type: "object",
          properties: {
            startDate: {
              type: "string",
              description: "Start date in YYYY-MM-DD format (default: today)",
            },
            endDate: {
              type: "string",
              description: "End date in YYYY-MM-DD format (default: 30 days from now)",
            },
          },
        },
      },
      {
        name: "cancel_booking",
        description: "Cancel an active Life Time Fitness class booking.",
        inputSchema: {
          type: "object",
          properties: {
            eventId: {
              type: "string",
              description: "The event ID of the class to cancel",
            },
          },
          required: ["eventId"],
        },
      },
    ],
  };
});

// Playwright helper functions
async function getBrowserContext(): Promise<{ browser: any; context: BrowserContext }> {
  const headless = process.env.LIFETIME_HEADLESS !== "false";
  const browser = await chromium.launch({ headless });
  
  let context: BrowserContext;
  if (fs.existsSync(STATE_FILE)) {
    context = await browser.newContext({ storageState: STATE_FILE });
  } else {
    context = await browser.newContext();
  }
  return { browser, context };
}

async function ensureLoggedIn(page: Page) {
  // Check if we are already logged in by going to reservations page
  await page.goto("https://my.lifetime.life/account/my-reservations.html");
  await page.waitForLoadState("networkidle");
  
  const currentUrl = page.url();
  if (currentUrl.includes("auth.lifetime.life")) {
    console.error("Not logged in. Performing login...");
    
    // Clear cookie dialog if it appears
    try {
      const cookieBtn = page.locator('button:has-text("Reject All"), button:has-text("Accept All")');
      if (await cookieBtn.isVisible()) {
        await cookieBtn.click();
      }
    } catch (e) {
      // Ignore if not visible
    }

    await page.waitForSelector("input#signInName", { timeout: 15000 });
    
    const username = process.env.LIFETIME_USERNAME;
    const password = process.env.LIFETIME_PASSWORD;
    if (!username || !password) {
      throw new Error("LIFETIME_USERNAME and LIFETIME_PASSWORD must be configured in environment variables.");
    }
    
    await page.fill("input#signInName", username);
    await page.fill("input#password", password);
    await page.click("button#next");
    
    // Wait for redirect
    await page.waitForURL("**/my.lifetime.life/**", { timeout: 30000 });
    await page.waitForLoadState("networkidle");
    
    // Save storage state for next time
    await page.context().storageState({ path: STATE_FILE });
    console.error("Login successful, session saved to state.json");
  } else {
    console.error("Already logged in (session restored).");
  }
}

// Tool handlers
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const club = (args?.club as string) || process.env.LIFETIME_CLUB || "va/ashburn-sterling";
  
  const { browser, context } = await getBrowserContext();
  const page = await context.newPage();
  
  try {
    // Log in first
    await ensureLoggedIn(page);
    
    if (name === "list_classes") {
      const rawDate = (args?.date as string) || new Date().toISOString().split("T")[0];
      const targetUrl = `https://my.lifetime.life/clubs/${club}/classes.html?selectedDate=${rawDate}&mode=week`;
      
      console.error(`Navigating to schedule: ${targetUrl}`);
      await page.goto(targetUrl);
      await page.waitForLoadState("networkidle");
      
      // Wait for calendar container to load
      await page.waitForSelector(".calendar, .planner-entry", { timeout: 15000 });
      
      const classes = await page.evaluate(() => {
        const dayElements = document.querySelectorAll(".calendar .day");
        const results: any[] = [];
        const dayHeaders = Array.from(
          document.querySelectorAll(".planner-date-controls .planner-date-day")
        ).map((el: any) => el.textContent?.trim() || "");
        
        dayElements.forEach((dayEl: any, dayIndex) => {
          const dayLabel = dayHeaders[dayIndex] || `Day ${dayIndex}`;
          const entries = dayEl.querySelectorAll(".planner-entry");
          
          entries.forEach((entryEl: any) => {
            const timeStartEl = entryEl.querySelector(".time-start");
            const timeEndEl = entryEl.querySelector(".time-end");
            
            const timeStart = timeStartEl ? timeStartEl.textContent?.trim() || "" : "";
            const timeEnd = timeEndEl ? timeEndEl.textContent?.trim() || "" : "";
            
            const titleLinkEl = entryEl.querySelector('a[data-testid="classLink"]');
            const className = titleLinkEl ? titleLinkEl.textContent?.trim() || "" : "";
            const href = titleLinkEl ? titleLinkEl.getAttribute("href") || "" : "";
            
            let eventId = "";
            if (href) {
              const match = href.match(/eventId=([^&]+)/);
              if (match) {
                eventId = match[1];
              }
            }
            
            const instructorEl = entryEl.querySelector('[data-testid^="instructorName_"]');
            const instructor = instructorEl ? instructorEl.textContent?.trim() || "" : "";
            
            const locationEl = entryEl.querySelector('[data-testid^="location_"]');
            const location = locationEl ? locationEl.textContent?.trim() || "" : "";
            
            const reserveLinkEl = entryEl.querySelector('[data-testid="reserveLink"]');
            const isBookable = !!reserveLinkEl;
            
            results.push({
              dayLabel,
              name: className,
              time: `${timeStart} to ${timeEnd}`,
              instructor,
              location,
              eventId,
              isBookable,
            });
          });
        });
        
        return results;
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(classes, null, 2),
          },
        ],
      };
    } else if (name === "book_class") {
      const eventId = args?.eventId as string;
      const targetParticipants = (args?.participants as string[]) || [];
      const targetUrl = `https://my.lifetime.life/clubs/${club}/classes/class-details.html?eventId=${eventId}`;
      
      console.error(`Navigating to class details: ${targetUrl}`);
      await page.goto(targetUrl);
      await page.waitForLoadState("networkidle");
      
      // Wait for participants checkboxes or status message
      await page.waitForSelector('input[type="checkbox"][data-testid="participantCheckBox"], .limitedAccessModalCloseButton, .disclaimer', { timeout: 15000 });
      
      // Check if registration window is closed
      const isClosed = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        return bodyText.includes("booking window is closed") || bodyText.includes("Registration Required") === false;
      });
      
      if (isClosed) {
        throw new Error("Cannot book class: The registration booking window is closed.");
      }
      
      // Get all available participant checkboxes
      const availableParticipants = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input[type="checkbox"][data-testid="participantCheckBox"]')).map((el: any) => {
          const labelText = el.closest("label")?.textContent?.trim() || el.nextElementSibling?.textContent?.trim() || "";
          return {
            name: labelText.split("\n")[0].trim(),
            value: (el as any).value,
            checked: (el as any).checked,
            disabled: (el as any).disabled,
          };
        });
      });
      
      if (availableParticipants.length === 0) {
        throw new Error("No participant checkboxes found. Check if already reserved or not eligible.");
      }
      
      console.error("Found participants: " + JSON.stringify(availableParticipants));
      
      // If targetParticipants is empty, default to checking the first enabled one
      const toCheck: string[] = [];
      if (targetParticipants.length === 0) {
        const defaultUser = availableParticipants.find(p => !p.disabled);
        if (defaultUser) {
          toCheck.push(defaultUser.name);
        }
      } else {
        toCheck.push(...targetParticipants);
      }
      
      // Click checkboxes for requested participants
      for (const nameOfUser of toCheck) {
        const p = availableParticipants.find(avail => avail.name.toLowerCase().includes(nameOfUser.toLowerCase()));
        if (!p) {
          throw new Error(`Participant "${nameOfUser}" not found in your membership list.`);
        }
        if (p.disabled) {
          throw new Error(`Participant "${nameOfUser}" cannot be selected (checkbox is disabled).`);
        }
        
        // If not already checked, click it
        if (!p.checked) {
          await page.click(`input[type="checkbox"][value="${p.value}"]`);
        }
      }
      
      // Click Reserve
      console.error("Clicking Reserve...");
      await page.click('button:has-text("Reserve"), input[type="submit"][value="Reserve"], button.btn-primary');
      
      // Wait for success confirmation or modals
      await page.waitForTimeout(3000);
      
      // Handle confirm/yes modal if it pops up
      const yesButton = page.locator('button:has-text("Yes"), .modal btn-primary:has-text("Yes")');
      if (await yesButton.isVisible()) {
        await yesButton.click();
        await page.waitForTimeout(3000);
      }
      
      const okButton = page.locator('button:has-text("OK"), #limitedAccessModalCloseButton');
      if (await okButton.isVisible()) {
        await okButton.click();
        await page.waitForTimeout(2000);
      }
      
      // Capture result confirmation page/text
      const bodyText = await page.innerText("body");
      const success = bodyText.toLowerCase().includes("reserved") || bodyText.toLowerCase().includes("success") || bodyText.toLowerCase().includes("calendar");
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success,
              message: success ? "Reservation completed successfully." : "Reservation submitted. Please verify in get_my_bookings.",
              participantsBooked: toCheck,
            }, null, 2),
          },
        ],
      };
    } else if (name === "get_my_bookings") {
      const todayStr = new Date().toISOString().split("T")[0];
      const thirtyDaysLater = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      
      const start = (args?.startDate as string) || todayStr;
      const end = (args?.endDate as string) || thirtyDaysLater;
      
      const targetUrl = `https://my.lifetime.life/account/my-reservations.html?startDate=${start}&endDate=${end}`;
      console.error(`Navigating to reservations: ${targetUrl}`);
      await page.goto(targetUrl);
      await page.waitForLoadState("networkidle");
      
      // Wait for container
      await page.waitForSelector(".reservations-container, .my-reservations", { timeout: 15000 });
      
      const reservations = await page.evaluate(() => {
        const container = document.querySelector(".reservations-container");
        if (!container || container.textContent?.includes("no reservations")) {
          return [];
        }
        
        // Find elements resembling reservation items
        const cards = Array.from(container.querySelectorAll(".planner-entry, [class*='reservation'], .card, .row"));
        if (cards.length === 0) return [];
        
        return cards.map((el: any) => {
          const titleEl = el.querySelector(".planner-entry-title, h3, h4, a[data-testid='classLink']");
          const title = titleEl ? titleEl.textContent?.trim() || "" : "";
          const href = titleEl?.getAttribute("href") || "";
          
          let eventId = "";
          if (href) {
            const match = href.match(/eventId=([^&]+)/);
            if (match) {
              eventId = match[1];
            }
          }
          
          const timeEl = el.querySelector(".small, time, [class*='time']");
          const time = timeEl ? timeEl.textContent?.trim() || "" : "";
          
          const locationEl = el.querySelector("[data-testid^='location_'], [class*='location']");
          const location = locationEl ? locationEl.textContent?.trim() || "" : "";
          
          const instructorEl = el.querySelector("[data-testid^='instructorName_'], [class*='instructor']");
          const instructor = instructorEl ? instructorEl.textContent?.trim() || "" : "";
          
          const participantEl = el.querySelector("[class*='participant'], [class*='member']");
          const participant = participantEl ? participantEl.textContent?.trim() || "" : "";
          
          return {
            name: title,
            time,
            location,
            instructor,
            participant,
            eventId,
          };
        });
      });
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(reservations, null, 2),
          },
        ],
      };
    } else if (name === "cancel_booking") {
      const eventId = args?.eventId as string;
      const targetUrl = "https://my.lifetime.life/account/my-reservations.html";
      
      console.error(`Navigating to reservations to cancel: ${targetUrl}`);
      await page.goto(targetUrl);
      await page.waitForLoadState("networkidle");
      
      await page.waitForSelector(".reservations-container, .my-reservations", { timeout: 15000 });
      
      const clicked = await page.evaluate((targetEventId) => {
        const container = document.querySelector(".reservations-container");
        if (!container) return false;
        
        const cards = Array.from(container.querySelectorAll(".planner-entry, [class*='reservation'], .card, .row"));
        for (const card of cards) {
          const link = card.querySelector("a");
          const href = link ? link.getAttribute("href") || "" : "";
          if (href && href.includes(targetEventId)) {
            // Find cancel button/link in this card
            const cancelBtn = card.querySelector('button, a:has-text("Cancel"), [class*="cancel"]');
            if (cancelBtn) {
              (cancelBtn as any).click();
              return true;
            }
          }
        }
        
        // Fallback: search by text context
        const allButtons = Array.from(document.querySelectorAll("button, a"));
        const cancelBtn = allButtons.find((el: any) => el.textContent?.includes("Cancel") && !el.className.includes("cookie"));
        if (cancelBtn) {
          (cancelBtn as any).click();
          return true;
        }
        
        return false;
      }, eventId);
      
      if (!clicked) {
        throw new Error(`Could not find a reservation card matching event ID: ${eventId}`);
      }
      
      // Confirm cancellation
      await page.waitForTimeout(3000);
      const confirmButton = page.locator('button:has-text("Yes"), button:has-text("Confirm"), button:has-text("OK")');
      if (await confirmButton.isVisible()) {
        await confirmButton.click();
        await page.waitForTimeout(2000);
      }
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              message: "Cancellation request submitted. Please check get_my_bookings to confirm.",
            }, null, 2),
          },
        ],
      };
    } else {
      throw new Error(`Unknown tool: ${name}`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
});

// Run server
async function main() {
  const transportType = process.env.LIFETIME_TRANSPORT || "stdio";
  
  if (transportType === "sse") {
    const app = express();
    app.use(express.json());
    
    const port = process.env.PORT || 3000;
    const transports = new Map<string, SSEServerTransport>();
    
    app.get("/sse", async (req, res) => {
      console.error("SSE connection requested");
      const transport = new SSEServerTransport("/messages", res);
      transports.set(transport.sessionId, transport);
      
      res.on("close", () => {
        console.error(`SSE connection closed for session: ${transport.sessionId}`);
        transports.delete(transport.sessionId);
      });
      
      await server.connect(transport);
    });
    
    app.post("/messages", async (req, res) => {
      const sessionId = req.query.sessionId as string;
      const transport = transports.get(sessionId);
      
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        res.status(404).send("Session not found");
      }
    });
    
    app.listen(port, () => {
      console.error(`Lifetime Fitness MCP server running on SSE at http://localhost:${port}`);
    });
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Lifetime Fitness MCP server running on stdio");
  }
}

main().catch((error) => {
  console.error("Fatal error in main:", error);
  process.exit(1);
});
