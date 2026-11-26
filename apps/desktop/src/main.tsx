import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router";
import { AnalysisPage } from "./features/analysis/AnalysisPage";
import { BoardSettingsPage } from "./features/settings/BoardSettingsPage";
import { AppShell, OnboardingShell } from "./app/AppShell";
import { Root } from "./app/Root";
import { SECTIONS } from "./app/sections";
import { HomePage } from "./features/home/HomePage";
import { SectionPage } from "./features/sections/SectionPage";
import { SignInPage } from "./features/signin/SignInPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import { KeepYourCardPage } from "./features/welcome/KeepYourCardPage";
import { WelcomePage } from "./features/welcome/WelcomePage";
import "./styles/global.css";

const pages = SECTIONS.filter((s) => s.opensIn).map((s) => ({ path: s.path, element: <SectionPage section={s} /> }));

const router = createHashRouter([
  {
    element: <Root />,
    children: [
      {
        element: <OnboardingShell />,
        children: [
          { path: "/sign-in", element: <SignInPage /> },
          { path: "/welcome", element: <WelcomePage /> },
          { path: "/welcome/keep", element: <KeepYourCardPage /> },
        ],
      },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <HomePage /> },
          { path: "/analyze", element: <AnalysisPage /> },
          { path: "/settings", element: <SettingsPage /> },
          { path: "/settings/board", element: <BoardSettingsPage /> },
          ...pages,
        ],
      },
    ],
  },
]);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
