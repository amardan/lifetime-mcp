# 🏋️‍♂️ Life Time Fitness Class Booking MCP Server

[![MCP Protocol](https://img.shields.io/badge/MCP-Supported-blue.svg)](https://modelcontextprotocol.io)
[![Playwright](https://img.shields.io/badge/Playwright-Automated-green.svg)](https://playwright.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-orange.svg)](https://nodejs.org)

Automate checking schedules, reserving classes, and managing bookings at **Life Time Fitness** using your favorite AI assistants (Claude, Cursor, Windsurf, and more). Built on top of the **Model Context Protocol (MCP)** and powered by **Playwright**.

---

## ✨ Features

* 📅 **List Classes**: View weekly group class schedules for your home club by date.
* ⚡ **Book Classes**: Reserve spots instantly for yourself or family members on your membership.
* 🛡️ **Session Persistence**: Stores session cookies securely to avoid repeated login prompts and prevent bot-detection triggers.
* 🔔 **Cancel Bookings**: Easily cancel reservations directly from your AI conversation.
* 🌐 **SSE & Stdio Transports**: Run locally over standard I/O (stdio) or deploy to the cloud using Server-Sent Events (SSE) for remote mobile access.

---

## 📖 Quick Start Guide (For Non-Technical Users)

If you've never used the terminal or built code before, follow these simple steps to get the server running with your AI client (like Claude Desktop).

### Step 1: Install Node.js
Go to [nodejs.org](https://nodejs.org) and download the **LTS (Long Term Support)** version for Mac or Windows. Run the installer and accept all default settings.

### Step 2: Download the Code
1. Click the green **Code** button at the top of this GitHub page and click **Download ZIP**.
2. Extract the downloaded ZIP file into a folder on your computer (for example, in your Documents folder).

### Step 3: Configure Your Credentials
1. Inside the extracted folder, find the file named `.env.template`.
2. Rename this file to `.env` (remove the `.template` extension).
3. Open the `.env` file in a text editor (like Notepad or TextEdit) and fill in your Life Time Fitness credentials and preferred club:
   ```env
   LIFETIME_USERNAME=your_email@gmail.com
   LIFETIME_PASSWORD=your_password
   LIFETIME_CLUB=va/ashburn-sterling
   LIFETIME_HEADLESS=true
   ```
4. Save the file.

### Step 4: Install and Build (One-Time Setup)
Open your terminal (Terminal app on Mac, or Command Prompt/PowerShell on Windows), navigate to the folder, and run these three commands:
```bash
# Install dependencies
npm install

# Download the browser automation tools
npx playwright install chromium

# Compile the code
npm run build
```

### Step 5: Connect to Claude Desktop
1. Open the Claude Desktop configuration file in a text editor:
   - **Mac**: Press `Cmd + Shift + G` in Finder and paste `~/Library/Application Support/Claude/` then open `claude_desktop_config.json`.
   - **Windows**: Press `Win + R`, type `%APPDATA%\Claude\`, press Enter, and open `claude_desktop_config.json`.
2. Replace its content with the configuration below, making sure to replace `/absolute/path/to/` with the actual folder path where you extracted the project:
   ```json
   {
     "mcpServers": {
       "lifetime-mcp": {
         "command": "node",
         "args": [
           "/absolute/path/to/lifetime-mcp/build/index.js"
         ],
         "env": {
           "LIFETIME_USERNAME": "your_email@gmail.com",
           "LIFETIME_PASSWORD": "your_password",
           "LIFETIME_CLUB": "va/ashburn-sterling",
           "LIFETIME_HEADLESS": "true"
         }
       }
     }
   }
   ```
3. Restart Claude Desktop. You will see a small plug icon showing that the Life Time Fitness integration is active!

---

## 🛠️ Developer Setup & Integration

### Exposed MCP Tools
1. `list_classes(date?: string, club?: string)` - Fetches the weekly schedule.
2. `book_class(eventId: string, club?: string, participants?: string[])` - Books class for specific family/membership users.
3. `get_my_bookings(startDate?: string, endDate?: string)` - Lists active reservations.
4. `cancel_booking(eventId: string)` - Cancels a reservation.

### Environment Configuration
```env
# Life Time Fitness Login
LIFETIME_USERNAME=your_username@gmail.com
LIFETIME_PASSWORD=your_password

# Default Club Location (e.g. va/ashburn-sterling)
LIFETIME_CLUB=va/ashburn-sterling

# Running mode (true = hide browser, false = show browser window)
LIFETIME_HEADLESS=true
```

### Cloud / Remote Access (SSE Mode)
To connect the server to remote AI clients like ChatGPT Custom Actions or a cloud-hosted interface:
1. Start the server in Server-Sent Events (SSE) mode:
   ```bash
   LIFETIME_TRANSPORT=sse PORT=3000 npm start
   ```
2. Expose the port to the internet (using a hosting service or an `ngrok` tunnel) and map your client's requests to `GET /sse` and `POST /messages`.

---

## ⚙️ Advanced Architectural Optimizations

The server includes several technical enhancements for production stability:

* **Persistent Browser Session**: Utilizes a single, long-lived global browser instance instead of launching Chromium on every request, reducing response latency by up to 80%.
* **Atomic State Saves**: Writes session states to temporary files before replacing the main configuration, preventing data corruption during concurrent operations.
* **Corrupt State Detection**: Gracefully detects and handles damaged or empty session files, falling back to a clean context automatically to prevent crashes.
* **Keep-Alive Heartbeats**: Automatically sends periodic `: ping` packets over SSE connections to clean up resources immediately if a client connection drops silently.
* **Robust UI Selectors**: Employs dynamic wait states (`locator.waitFor`) and multiple locator candidates rather than relying on brittle, static timeouts.

---

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
