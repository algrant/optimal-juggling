import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import Optimal from "./Optimal";
import "./base.css";

// A hash router: GitHub Pages serves one file, so the siteswap lives after the # (…/#/531).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <HashRouter>
      <main>
        <Routes>
          <Route path="/:ss?" element={<Optimal />} />
        </Routes>
      </main>
    </HashRouter>
  </StrictMode>,
);
