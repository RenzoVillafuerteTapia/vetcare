import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "@/app/app";

import "@fontsource-variable/fredoka";
import "@fontsource-variable/nunito";

import "./index.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("No se encontró el elemento #root.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
