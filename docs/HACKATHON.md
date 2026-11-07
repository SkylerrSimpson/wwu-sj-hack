# The day

WWU Social Justice Hackathon, Sat Nov 7 2026, Kaiser Borsari Building. Rules: https://wwu-sj-hack.devpost.com/rules. The agreement we sign at check-in overrides the website.

Event schedule: 9:00 challenges announced and teams form; 10:00 work starts; 11:00 lunch; **16:00 deadline to submit**; 16:05 pitches (CF 110); 18:00 winners.

## How we are scored: 45 points

Review stage, six rows, 1 to 5 each (30):

| Row                            | What a 5 looks like                                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Innovation & Creativity        | highly original; novel use of technology                                                                   |
| Impact & Community Relevance   | deep understanding of community needs                                                                      |
| Design & User Experience       | polished, intuitive, accessible                                                                            |
| Feasibility & Scalability      | the Nation could actually run it                                                                           |
| Technical Execution            | fully functional                                                                                           |
| Equity & Ethical Consideration | risks named, concrete safeguards implemented, and an environmental impact estimate if AI was used to build |

Presentation stage, three rows, 1 to 5 each (15): Delivery (time limit, recovery, engagement), Content (slides with visible effort), Knowledge (answering questions confidently; judges are told to spot projects "vibe-coded or AI-generated without intent").

Code is a fraction of the points. The rest is understanding the problem, the user, the ethics, and the pitch. Confirm the rubric at check-in.

## What we submit

- The live site, opened in a private window to confirm it needs no login.
- The GitHub repo, public before submitting.
- Slides, with the pre-recorded demo embedded or linked.
- The pitch document, on the organizers' template.
- Two presenters: Skyler (architecture, web) and Willow (data, coverage, ethics).

## Schedule

**T** is when coding starts. **D** is the 16:00 deadline; it never moves. If T slips, squeeze the middle, never the end. At each **gate** everyone stops and walks the app together for two minutes.

| When               | Skyler                                                                                                            | Willow                                                               | Nathan                                                                                                                           | Luke                                                                                |
| ------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| T+0:00             | Land the team's plan; create the issues                                                                           | `schema.json` for vessels and tracks                                 | `lib/vessel.ts` test-first: `isInside`, `positionAt`                                                                             | Make the Resend account (its inbox is the demo inbox); key in `apps/web/.env.local` |
| T+0:45             | The map: boundary and dots from Willow's first `data.json`                                                        | **First `data.json`**: real tracks from the event file, the boundary | `newEntries` test-first                                                                                                          | `sendAlert` server function, address checked                                        |
| **Gate 1, T+1:00** | **Ships appear on the map at their positions**                                                                    |                                                                      |                                                                                                                                  |                                                                                     |
| T+1:00             | The replay clock: play, pause, speed                                                                              | Priority list, synthetic vessel, private-boat names                  | **Land `lib/vessel.ts`**; test it against the real `data.json` (one entry from the synthetic vessel, none from the moored boats) | `AlertPanel`: email box, test button, alert log                                     |
| T+1:45             | Wire `newEntries` and `AlertPanel` into the replay; banner, caveats, sources                                      | `NOTES.md`: sources, cleaning, what AIS can't see                    | Help where a gate is red                                                                                                         | **Land alerts**; the test email arrives                                             |
| **Gate 2, T+2:15** | **End to end: press play, the synthetic vessel crosses in, the email arrives**                                    |                                                                      |                                                                                                                                  |                                                                                     |
| T+2:15             | Polish, accessibility, walk the demo                                                                              | The data slide                                                       | Help Luke with slides                                                                                                            | **Slides and pitch doc**                                                            |
| **D−2:00**         | **Freeze.** `/mattpocock-skills:code-review` against `90ab845`; each finding becomes a bug issue; then fixes only | Fixes                                                                | Fixes                                                                                                                            | Slides                                                                              |
| D−1:30             | README, Vercel and its Resend key, environmental line, repo public, Devpost                                       | Rehearse the Q&A                                                     | Record the 90 s demo                                                                                                             | Finish slides and pitch doc                                                         |
| **Gate 3, D−0:30** | **Submit: live URL, repo, slides with the video, pitch doc**                                                      |                                                                      |                                                                                                                                  |                                                                                     |
| D+0:05             | Pitch                                                                                                             | Pitch                                                                |                                                                                                                                  |                                                                                     |

If Gate 1 slips, Skyler draws dots from a hand-written sample. If Gate 2 slips, the test button's email is the demo moment.

Before the repo goes public: `git grep -iE 'password|secret|token|api[_-]?key' -- . ':!pnpm-lock.yaml' ':!data/uv.lock'` prints nothing.
