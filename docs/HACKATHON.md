# The weekend

WWU Social Justice Hackathon, Fri Nov 6 to Sun Nov 8, 2026, Kaiser Borsari Building. Rules: https://wwu-sj-hack.devpost.com/rules. The agreement we sign at check-in overrides the website.

Devpost deadline: written here Friday night.

## How we are scored: 50 points

Review stage, seven rows, 1 to 5 each (35):

| Row                          | What a 5 looks like                                           |
| ---------------------------- | ------------------------------------------------------------- |
| Innovation & Creativity      | novel use of technology                                       |
| Impact & Community Relevance | deep understanding of the community's need                    |
| Design & UX                  | polished, intuitive, accessible                               |
| Feasibility & Scalability    | the nonprofit could actually run it                           |
| Technical Execution          | fully functional                                              |
| Equity & Ethics              | risks named and a concrete safeguard implemented              |
| Fitness                      | directly addresses the problem statement, then goes beyond it |

Presentation stage, three rows, 1 to 5 each (15): Delivery (time limit, recovery, engagement), Content (slides with visible effort), Knowledge (answering questions confidently; judges are told to spot projects "vibe-coded or AI-generated without intent").

Code is 5 of 50. The rest is understanding the problem, the user, the ethics, and the pitch.

## What we submit

- The live site: the production domain from `SETUP.md`, opened in a private window to confirm it needs no login.
- The GitHub repo, public by Sunday.
- Slides, with the pre-recorded demo embedded or linked.
- The pitch document, on the organizers' template.
- Two presenters at most.

## Before Friday

- [ ] Both of us: `SETUP.md` on our laptops and on a lab machine, through to the site running locally.
- [ ] Read the rules on pre-event code; the check-in agreement overrides them. The scaffold is declared in `README.md`.
- [ ] Skyler: Vercel, per `SETUP.md`.
- [ ] Willow: one throwaway issue end to end, so the first real one is not the first time.

## Friday night, about two hours once we have the challenge

1. Download the pitch template. Write the Devpost deadline at the top of this file.
2. Talk to the nonprofit rep. Write down their words, and ask whether we may quote them in a public repo. Willow asks what data they have today, how often it changes, and what in it is private.
3. Thirty minutes of hard questions, then stop: who is the one user; what do they do today; what is the smallest tool that changes that; what could go wrong for them; what language do they read; what device and connection do they have (a phone on cellular is the default); who is excluded if it is English only.
4. Fill `SPEC.md`. The demo script plus the safeguards table is the scope; everything else waits.
5. Agree the record fields. Willow lands the schema, sample rows and regenerated data first; Skyler types the fields on the web side after. From then on neither of us waits on the other.
6. Write five to eight small issues, each one thing you could watch happen in the demo, with "done when" lines. The owner is the assignee.
7. Deploy the walking skeleton: real schema, sample data, one page, a real title and description. Then `git tag friday && git push origin friday`.

## Saturday

- Work the issues one at a time each. Land on `main` after every one, and walk the demo on the live site after every landing.
- 3pm: start the slides and the pitch document, and fill `README.md` for a reader who has never seen the project.
- 5pm: feature freeze. One review of everything since the `friday` tag; each finding becomes a bug issue; then fixes only.
- Evening: record the demo. Upload it unlisted, paste the link into the slides and the Devpost form, and keep the mp4 and a PDF of the slides on the presenting laptop in case the wifi dies.

## Sunday

- Polish the demo path.
- Q&A drill: each of us explains the other's half. Expect to be asked where the data came from and how we know it is right.
- Make the repo public once `git grep -iE 'password|secret|token|api[_-]?key' -- . ':!pnpm-lock.yaml' ':!data/uv.lock'` prints nothing.
- Submit all four items before the deadline.
