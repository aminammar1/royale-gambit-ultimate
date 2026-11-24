import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import { AppShell } from "./app/AppShell";
import { SECTIONS } from "./app/sections";
import { HomePage } from "./features/home/HomePage";
import { SectionPage } from "./features/sections/SectionPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import "./styles/global.css";

const pages = SECTIONS.filter((s) => s.opensIn).map((s) => ({ path: s.path, element: <SectionPage section={s} /> }));

const router = createHashRouter([
  {
    element: <AppShell />,
    children: [{ path: "/", element: <HomePage /> }, { path: "/settings", element: <SettingsPage /> }, ...pages],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
