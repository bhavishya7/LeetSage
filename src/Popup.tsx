import React from "react";
import { useState, useEffect } from "react";

type CurrentProblem = { title?: string; url?: string };

const Popup: React.FC = () => {
  const [problemData, setProblemData] = useState<CurrentProblem | null>(null);

  console.log("Problem data received:", problemData);

  useEffect(() => {
    chrome.storage.local.get("problemData", (data) => {
      if (data.problemData) {
        setProblemData(data.problemData);
      }
    });
  }, []);

  if (!problemData?.title) {
    return (
      <div className="text-gray-600 text-sm">
        No problem detected on this tab yet.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold">{problemData.title}</h3>
    </div>
  );
};
export default Popup;
