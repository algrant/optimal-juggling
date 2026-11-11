import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Optimal from "./Optimal";
import "./base.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <Optimal />
    </main>
  </StrictMode>,
);
