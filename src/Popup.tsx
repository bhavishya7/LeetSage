import React from "react";
import { useState, useEffect } from "react";

type CurrentProblem = { title?: string; url?: string };

const Popup: React.FC = () => {
  const [problem, setProblem] = useState<CurrentProblem | null>(null);

  console.log("Current problem:", problem);

  useEffect(() => {
    chrome.storage.local.get("currentProblem", (data) => {
      if (data.currentProblem) {
        setProblem(data.currentProblem);
      }
    });
  }, []);

  if (!problem?.title) {
    return (
      <div className="text-gray-600 text-sm">
        No problem detected on this tab yet.
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-lg font-semibold">{problem.title}</h3>
    </div>
  );
};
export default Popup;
