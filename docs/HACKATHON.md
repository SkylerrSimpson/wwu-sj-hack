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

**T** is when coding starts (planned 10:00). **D** is the 16:00 deadline; it never moves. If T slips, squeeze the middle, never the end. At each **gate** everyone stops and walks the live URL together for two minutes.

| When               | Skyler                                                                                            | Nathan                                                  | Luke                                | Willow                                                  |
| ------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------- |
| T−1:00             | Vercel (import repo, root `apps/web`, branch `main`, Node 24); challenge; rep questions; grilling | Accept invite, plugins, clone, `make setup`, `make dev` | Same                                | Accept invite, `make setup`, rep data questions         |
| T+0:00             | Land the plan commit; create the issues                                                           | Read AGENTS.md, standards, SPEC                         | Same                                | Agree the data format with Skyler, out loud             |
| T+0:15             | Dependency commit                                                                                 | `visit.ts` test-first                                   | Layout: banner, caveats, provenance | Schema, pass-through `build.py`, sample `data.json`     |
| T+0:30             | `VisitMap`                                                                                        |                                                         |                                     |                                                         |
| T+0:45             | `data.ts` within 10 min of Willow's commit                                                        |                                                         | Land layout                         | Land schema and sample                                  |
| **Gate 1, T+1:00** | **Live site shows sample visits with the banner**                                                 |                                                         |                                     |                                                         |
| T+1:00             | `VisitMap`                                                                                        | Land `visit.ts` by T+1:30; home page                    | Visit page; map placeholder         | `fetch()`: stream, strip identities, boundary           |
| T+2:00             | Land `VisitMap`; help Luke wire it                                                                | Home page lands                                         | Visit page lands                    | Visit rules test-first; approved list; synthetic vessel |
| T+2:30             | Review landings                                                                                   | Accessibility, mobile                                   | Slides and pitch doc                |                                                         |
| **Gate 2, T+3:00** | **Click-through works live: list → visit → map → record**                                         |                                                         |                                     |                                                         |
| T+3:00             | Integrate, polish                                                                                 | Help with slides                                        | Slides                              | Real `data.json` lands; `NOTES.md`                      |
| **Gate 3, D−2:15** | **Real data live, or ship the sample labeled "sample"**                                           |                                                         |                                     |                                                         |
| **D−2:00**         | **Freeze. Review; bug issues; fixes only**                                                        | Fixes                                                   | Slides                              | Data slide                                              |
| D−1:30             | README, environmental line, secret scan, repo public, Devpost                                     | Record the 90 s demo                                    | Finish slides and pitch doc         | Rehearse Q&A                                            |
| **Gate 4, D−0:30** | **Submit**                                                                                        |                                                         |                                     |                                                         |
| D+0:05             | Pitch                                                                                             |                                                         |                                     | Pitch                                                   |

If a gate slips: Gate 1, build against hand-written sample visits in tests; Gate 2, cut the map (the record stands alone); Gate 3, cut real data from the app, not from the pitch.

Before the repo goes public: `git grep -iE 'password|secret|token|api[_-]?key' -- . ':!pnpm-lock.yaml' ':!data/uv.lock'` prints nothing.
