export default chrome.runtime.onInstalled.addListener(() => {
  console.log("Background Service Worker working...");
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "PROBLEM_DATA") {
    console.log("📩 Received problem data:", message.payload);

    // Save to chrome.storage.local so popup can read it
    chrome.storage.local.set({ problemData: message.payload });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open_side_panel") {
    chrome.windows.getCurrent((w) => {
      chrome.sidePanel.open({ windowId: w.id! });
      console.log("Command/Ctrl + Shift + L triggered! :)");
    });
  }
});
