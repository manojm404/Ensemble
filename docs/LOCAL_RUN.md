# 🚀 How to Run Ensemble Locally

This guide will help you get Ensemble up and running on your macOS machine (the same steps generally apply for Linux and Windows).

---

## 🛠️ Prerequisites

Ensure you have the following installed:

-   **Python 3.11+**: The core service and agent logic.
-   **Node.js 18+ and npm**: The desktop UI build tools.
-   **Rust and Cargo**: Required for building the [Tauri](https://tauri.app/) application.
-   **Gemini API Key**: Obtain a free key from the [Google AI Studio](https://aistudio.google.com/).
-   **(Optional) Ollama**: If you want to run 100% local models like Llama 3.2 or Qwen.

---

## 📦 Installation

### 1. Repository Setup
Clone this repository and navigate to the root directory:

```bash
git clone https://github.com/your-org/ensemble.git
cd ensemble
```

### 2. Python Backend
Create a virtual environment and install the required dependencies:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Desktop UI
Install the frontend and Tauri dependencies:

```bash
cd ui
npm install
cd ..
```

---

## ⚙️ Environment Configuration

Ensemble requires a **Gemini API Key** to function out of the box. You can configure this in two ways:

1.  **File-based**: Create a `.env` file in the root directory (based on `.env.example`):
    ```bash
    GEMINI_API_KEY=your_actual_key_here
    APPROVAL_COST_THRESHOLD=0.0001
    ```
2.  **Shell-based**: Export the key directly in your terminal:
    ```bash
    export GEMINI_API_KEY=your_actual_key_here
    ```

---

## 🏎️ Running the Platform

To run the full Ensemble platform, you need to start two services:

### 1. Start the Governance Backend
Open a new terminal session, activate the `venv`, and run the FastAPI server:

```bash
source venv/bin/activate
uvicorn backend.ensemble.api.governance:app --reload --port 8088
```
*Expected output: `Uvicorn running on http://127.0.0.1:8000`*

### 2. Start the Desktop App (Tauri)
Open **another** terminal session and run the UI in development mode:

```bash
cd ui
npm run tauri dev
```
*Expected output: The Ensemble desktop window will open on your machine.*

---

## 🔥 First Steps in Ensemble

Once the app is open, try these common workflows:

-   **Chat**: Navigate to the **Chat** tab and send a message to the `default_agent`.
-   **Magic Generate**: Go to the **Studio** tab, click the 🪄 icon, and enter: *"Create a 2-step workflow where a researcher finds facts and a writer drafts an article."*
-   **Governance**: Run an SOP. If it triggers a sensitive action (like `shell_cmd`), check the **Dashboard** to **Approve** or **Deny** the request.
-   **Audit Log**: View the **Dashboard** to see a real-time log of every action taken by the agents.

---

## 🔧 Troubleshooting

-   **`cargo` not found**: Ensure Rust is installed. Run `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh` and restart your terminal.
-   **Tailwind CSS Errors**: If you see Tailwind v4 warnings, ensure you are running `npm run dev` inside the `ui/` directory.
-   **WebSocket connection refused**: Make sure the backend (port 8000) is running before launching the UI.
-   **API Key issues**: Verify your `.env` file exists and contains a valid key.

---
*Support: For advanced and enterprise configuration, please refer to the Ensemble V1 Blueprint.*
