# LeetSmith — Privacy Policy

**Last updated: 2026-10-10**

LeetSmith is a browser extension that acts as an AI learning coach on LeetCode
problem pages. This policy explains, in plain language, what data LeetSmith
handles and what it does not. It is written to be honest and complete — privacy
matters, and LeetSmith is built to keep your data yours.

> **LeetSmith is an independent project. It is not affiliated with, endorsed by,
> sponsored by, or produced by LeetCode. "LeetCode" is a trademark of its
> respective owner.**

---

## The short version

- **No accounts. No backend. No tracking. No analytics. No cookies. No ads.**
- **LeetSmith does not have a server.** It cannot and does not collect, store, or
  receive any of your data.
- Everything LeetSmith saves (your API key, your notes, your progress) is stored
  **locally on your own device**, in your browser.
- The **only** data that ever leaves your device is the current problem and the
  code you choose to get coaching on — and it goes to **Google**, using **your
  own Google Gemini key**, to generate the coaching response. Nothing is routed
  through LeetSmith.
- **We do not sell or share your personal information.** (We never receive it in
  the first place.)

---

## What LeetSmith stores (locally, on your device)

LeetSmith uses your browser's local extension storage (`chrome.storage.local`).
This data lives on your computer and is never transmitted to LeetSmith:

- **Your Google Gemini key** — so you don't have to re-enter it. Stored locally;
  used only to authenticate your requests to Google.
- **Your coaching session and chat** for the current problem.
- **Your saved study notes / progress records** (the ones you choose to save).
- **Your settings** (model choice, theme, usage limits, and your acknowledgement
  of this notice).

You can view, export, and delete this data at any time from within the extension
(see **Your data, your control** below).

## What LeetSmith sends off your device — and to whom

To generate coaching, LeetSmith sends the following to **Google's Gemini
service**, over a secure (HTTPS) connection, authenticated with **your own key**:

- the text of the LeetCode problem you are currently viewing, and
- the code in your editor (only when an action needs it — e.g. "analyze my code").

That is the **only** outbound transmission LeetSmith makes, and it goes **directly
from your browser to Google** — never to any LeetSmith server (there isn't one).

## Important: how Google handles the data you send

Once your problem and code reach Google, Google's own terms and privacy policy
govern that data — not this policy. One point is worth calling out clearly,
because it is easy to miss:

- **On Google's free Gemini API tier, Google may use the content you send
  (prompts and responses) to improve its products**, and that content may be
  reviewed. Google's **paid** tier is the one that excludes your content from
  being used to improve Google's products.
- Most LeetSmith users will be on a **free** key. If you would prefer that your
  submitted content not be used to improve Google's services, you can use a Google
  Gemini key on a paid plan, or simply avoid sending code you consider sensitive.

This is **Google's practice, not LeetSmith's** — LeetSmith has no control over and
no insight into what Google does with the data after it is sent. We surface it
here so your decision is fully informed. For details, see Google's documentation:

- Google Gemini API terms / data use: <https://ai.google.dev/gemini-api/terms>
- Google Privacy Policy: <https://policies.google.com/privacy>

## What LeetSmith does NOT do

- It does **not** run a server, so it cannot collect or store your data.
- It does **not** use analytics, telemetry, cookies, or any tracking.
- It does **not** sell, rent, trade, or share your personal information with
  anyone.
- It does **not** show ads or use your data for advertising or profiling.
- No LeetSmith employee or operator can read your data — there is nowhere for us
  to read it from.

## Your data, your control

- **View / export:** Open **My Progress** inside the extension to see your saved
  notes and export them as a Markdown report or a JSON backup.
- **Delete:** Clear your API key in Settings, clear the extension's data via your
  browser, or **remove the extension** — uninstalling LeetSmith deletes all of its
  locally stored data from your device.
- **Retention:** LeetSmith keeps your local data only until you delete it by one
  of the means above. LeetSmith has no copy anywhere else.

## Your rights (GDPR, UK GDPR, CCPA/CPRA, and similar)

Because LeetSmith stores your data only on your own device and never collects it,
you already have direct, full control over it:

- **Access & portability:** everything is on your device and exportable from the
  extension at any time.
- **Deletion / erasure:** delete it yourself at any time (see above). There is no
  server-side copy for us to delete.
- **No sale or sharing:** LeetSmith does **not** sell or share your personal
  information, as those terms are used under the CCPA/CPRA. California residents
  have the right to know, delete, and opt out of sale/sharing — and since we
  neither collect nor sell your data, there is nothing to opt out of.
- **Legal basis (GDPR):** the only off-device transmission (to Google) happens on
  the basis of **your explicit, in-product consent**, which you give before the
  extension can be used, and which you can withdraw by removing your key or the
  extension.

For data once it reaches Google, exercise your rights with Google under their
policy linked above.

## Children

LeetSmith is **not directed to children under 13** and does not knowingly handle
their data. (LeetCode's own Terms also require account holders to be 18 or older.)

## Chrome Web Store Limited Use disclosure

LeetSmith's use of information received from Google APIs adheres to the
[Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
including the **Limited Use** requirements. LeetSmith uses data only to provide
its single, user-facing purpose — coaching you on the LeetCode problem you are
working on — and for no other purpose. LeetSmith does not transfer this data
except as required to provide that feature (the request you initiate to Google
using your own key), and never for advertising, profiling, or sale.

## Changes to this policy

If this policy changes, the **"Last updated"** date above will change, and
material changes to how your data is handled will be reflected in the extension's
in-product disclosure (which you may be asked to acknowledge again). Continued use
after an update means you accept the revised policy.

## Contact

Questions about this policy or your data? Open an issue on the LeetSmith GitHub
repository (linked from the Chrome Web Store listing), or reach the developer
through the contact listed there.
