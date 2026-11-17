# GCL Public Web Preview

Isolated public concept preview. No changes to the existing Mathematics Programme site or the organization Pages root.

Source idea and integration contract: https://github.com/grandchallenge/.github/pull/114

## Zensical Mathematics Programme staging

A separate, non-production renderer preview is built under
`https://grandchallenge.ai/gcl-public-web-preview/zensical/`.

The workflow pins `grandchallenge/MATH-PROGRAMME` to exact commit
`a55255f01b18139ddf045d4c82fb566c3e77f36d`, materializes the governed
Erdős and OAI26 sources in copied directories, checks parity against a fresh
MkDocs build, then builds again using only a staging-specific `site_url`.
The original preview homepage is preserved byte-for-byte in the Pages payload.

To refresh the staging renderer, make a reviewed pull request updating the
pinned source SHA in `.github/workflows/pages.yml` **in both places**; execute
the PR validation; merge only if exact-head checks pass. This does not change
MATH-PROGRAMME's production MkDocs workflow, DNS, SSL, Pages rules, or
`site_url`. This staging site is not an approval for a production cutover or a
claim of complete WCAG/screen-reader compliance.
