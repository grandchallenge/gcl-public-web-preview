# Source-authorized public console — first producer

Publicity is an explicit source contract, not absence of a detected credential.
The first producer is the public website's existing `validate.py`. The review
pins its SHA-256 and the actual Python stdin in public_console_policy.json.
The build requires committed input bytes, exact Git revision, public repository
identity, isolated temporary input directory, minimal subprocess environment and
an exact allowed stdout grammar. Nonzero exit, unexpected stdout or any stderr
fails publication; the captured unknown bytes are not released. No fake stderr
record is emitted for an empty stream.

This is a build-time publication snapshot, not continuous CONTROL/MCP capture.
Additional producers require their own protected disclosure contract and tests.
Private CHAD journals and CONTROL's private viewer are not inputs. The static
Pages viewer has no execution service, credentials, private journal, or proxy.
The existing public metadata-only CONTROL viewer remains unchanged.

Necessity: prior local redaction audit proved unlabeled secrets cannot be
reliably classified by masking. Reuse existing Pages build, no daemon, queue,
new secrets, database or tunnel. Existing GitHub revision and Pages deployment
are the evidence/authority surfaces. The snapshot is rebuilt on website release;
no claim of all operations or continuous capture. Rollback: revert these scoped
assets and build-hook changes; private CONTROL remains untouched.
