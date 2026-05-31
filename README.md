# 🏋️‍♂️ Life Time Fitness Class Booking MCP Server

[![MCP Protocol](https://img.shields.io/badge/MCP-Supported-blue.svg)](https://modelcontextprotocol.io)
[![Playwright](https://img.shields.io/badge/Playwright-Automated-green.svg)](https://playwright.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-orange.svg)](https://nodejs.org)

Automate checking schedules, reserving classes, and managing bookings at **Life Time Fitness** using your favorite AI assistants (Claude, ChatGPT, Cursor, and more). Built on top of the **Model Context Protocol (MCP)** and automated with **Playwright**.

---

## ✨ Features

- 📅 **List Classes**: View weekly group class schedules for your home club by date.
- ⚡ **Book Classes**: Reserve spots instantly for yourself or family members on your membership.
- 📁 **Session Persistence**: Stores session cookies securely in `state.json` to avoid login cycles and prevent bot-detection triggers.
- 🔔 **Cancel Bookings**: Easily cancel reservations from the AI interface.
- 🌐 **SSE & Stdio Transports**: Run locally over standard I/O (stdio) or deploy to the cloud using Server-Sent Events (SSE) for remote mobile access.

---

## 🛠️ Expose Tools

The server exposes the following capabilities:
1. `list_classes(date?: string, club?: string)` - Fetches the weekly schedule.
2. `book_class(eventId: string, club?: string, participants?: string[])` - Books class for specific family/membership users.
3. `get_my_bookings(startDate?: string, endDate?: string)` - Lists your active reservations.
4. `cancel_booking(eventId: string)` - Cancels a reservation.

---

## 🚀 Setup & Installation

### 1. Prerequisites
Make sure you have Node.js (v18+) and npm installed.

### 2. Install Project
Clone the repository and install dependencies:
```bash
git clone https://github.com/amardan/lifetime-mcp.git
cd lifetime-mcp
npm install
npx playwright install chromium
```

### 3. Environment Configuration
Copy `.env.template` to `.env` and enter your credentials:
```bash
cp .env.template .env
```
Edit `.env`:
```env
# Life Time Fitness Login
LIFETIME_USERNAME=your_username@gmail.com
LIFETIME_PASSWORD=your_password

# Default Club Location (e.g. va/ashburn-sterling)
LIFETIME_CLUB=va/ashburn-sterling

# Running mode
LIFETIME_HEADLESS=true
```

### 4. Build the Project
```bash
npm run build
```

---

## 🤖 Integrating with AI Clients

### 1. Claude Desktop App
To use this with the official Claude Desktop client on your machine, edit your config file:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add the server:
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

### 2. Cursor, Windsurf, or Cline (IDE Extensions)
Add a new MCP server in your editor settings:
- **Type**: `command`
- **Name**: `lifetime-mcp`
- **Command**: `node /absolute/path/to/lifetime-mcp/build/index.js`
- **Env Variables**: Add `LIFETIME_USERNAME`, `LIFETIME_PASSWORD`, `LIFETIME_CLUB`, and `LIFETIME_HEADLESS` as config keys.

### 3. Remote/Mobile Access (e.g., ChatGPT Actions)
To book gym classes directly from the **ChatGPT Mobile App**:

1. **Start the server in SSE Mode**:
   Host the server online (Render, Heroku, Fly.io, or on a home server exposed via `ngrok`) and start it with:
   ```bash
   LIFETIME_TRANSPORT=sse PORT=3000 npm start
   ```
2. **Create a Custom GPT**:
   - In ChatGPT, click **Explore GPTs** -> **Create**.
   - Under **Configure**, add a new **Action**.
   - Import your server's OpenAPI specification pointing to your hosted HTTP server endpoints (`GET /sse` and `POST /messages`).
3. **Now ask your phone**: *"Claude, book the Monday morning 6:00 AM class at Life Time."*

---

## 🧪 Local Testing / CLI Debugging

You can test the JSON-RPC interface locally using standard input/output stream piping:

```bash
# Verify tools list
echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | npm start

# Retrieve classes for a specific date
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"list_classes","arguments":{"date":"2026-06-01"}},"id":2}' | npm start
```

## 📄 License
This project is licensed under the MIT License - see the LICENSE file for details.
