import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { EventProvider } from "./context/EventContext";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <EventProvider>
      <App />
    </EventProvider>
  </React.StrictMode>,
);
