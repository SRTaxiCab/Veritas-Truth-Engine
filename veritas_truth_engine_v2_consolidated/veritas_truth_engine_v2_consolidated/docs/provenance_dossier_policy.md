# Provenance Dossier Policy

## Core release rule

No dossier should be treated as fit for public release unless all claims included in it satisfy the release gate for their current state.

## Release states

- `auto_release` — claim can appear in a controlled release dossier
- `review_required` — claim may appear only in internal restricted dossiers
- `hold` — claim should not be released externally and should be prominently flagged internally

## Dossier recommendations

The dossier builder computes a recommendation based on the most restrictive claim state in the packet:

- If any claim is `hold` -> `Do not release externally`
- Else if any claim is `review_required` -> `Restricted internal release only`
- Else -> `Eligible for controlled external release`

## Chain-of-custody policy

Each dossier should explicitly note:

- evidence count
- source class diversity
- the probabilistic nature of conclusions
- unresolved contradiction or provenance weaknesses

## Reviewer expectations

A reviewer using the dossier should be able to answer:

1. What is the claim?
2. What evidence supports or contradicts it?
3. Where did that evidence originate?
4. What truth state was assigned?
5. Was human review triggered?
6. Is the packet releasable?
