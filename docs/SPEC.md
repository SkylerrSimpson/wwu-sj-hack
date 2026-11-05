# Spec

Filled in Friday night. One page. Everything below the demo script is reference.

## Problem

In the nonprofit's words, with their OK to be quoted in this public repo; otherwise their role only, paraphrased. Who told us.

## The one user

A single person, by role, and what they do today without this tool.

## Demo script

Ninety seconds, step by step, what the audience sees. The demo script plus the safeguards table is the scope; everything else waits.

1.
2.
3.

## Out of scope

Things we were tempted by and are leaving out, each with its one-line reason.

## Data

Sources (who publishes it, how fresh, licence or terms) and the record fields. The contract is `data/schema.json`; this section says why those fields.

## Shape

The pages (route: what it shows), the functions in `apps/web/src/lib/` (name: input to output), and anything the browser has to remember between clicks. One line each. This is the design: a slice that needs something not listed here adds it here first.

## Risks and safeguards

| Risk to the user or community           | Safeguard we built                                                       | Where (file or screen)                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| Acting on wrong or outdated information | Every record names its source and retrieval date, shown next to the data | `data/schema.json` (required fields), `apps/web/src/app/page.tsx` footer |
|                                         |                                                                          |                                                                          |

Every row names a file or a screen, so the safeguard exists in the product and not only in a slide. The first row is generic; add the risks specific to this challenge's community.

## Glossary

At most five terms that the app, the issues and the slides all use the same way.
