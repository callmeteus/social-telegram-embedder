import { installChromeDevShim } from "./chrome-shim";
import "../OptionsPage.css";
import "../SendChannels.css";
import "../TelegramAccountSection.css";
import "../SetupWizard.css";
import "./dev.css";

installChromeDevShim();

const layoutParams = new URLSearchParams(window.location.search);

if (layoutParams.get("popup") !== "0") {
    document.documentElement.classList.add("x2tg-options-dev--popup");
    document.documentElement.classList.add("x2tg-options--popup");
}

void import("../OptionsPage");
