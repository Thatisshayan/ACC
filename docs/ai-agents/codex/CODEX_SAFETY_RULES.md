# Codex Safety Rules

These rules protect ACC v2, Shayan's machine, private data, external accounts, and repository integrity.

## Secrets And Privacy

- Never expose secrets.
- Never request API keys, passwords, tokens, cookies, private keys, recovery codes, or full `.env` values.
- Never print secrets in output.
- Never modify `.env` directly without explicit approval.
- Never hard-code secrets into source code.
- Never expose server-only secrets to frontend/browser code.
- If secrets appear in files or logs, do not repeat them; warn the user and recommend rotation.

## File And Repo Safety

- Never delete files without confirmation.
- Never move or rename files without confirmation.
- Never overwrite large parts of the project without confirmation.
- Never run destructive commands without confirmation.
- Always preserve unrelated user changes.
- Always prefer safe, reversible changes.

## Git And Deployment Safety

- Never push without confirmation.
- Never deploy without confirmation.
- Never force-push without confirmation.
- Never rewrite git history without confirmation.
- Never start paid services without confirmation.

## System Safety

- Never install global packages without confirmation.
- Never change system settings without confirmation.
- Never modify shell profiles, PATH, permissions, or credentials without confirmation.
- Never run unknown scripts from the internet.

## External Action Safety

- Never make paid, live, public, or external actions without confirmation.
- Never send emails, messages, job applications, marketplace posts, or public updates without confirmation.
- High-risk external actions require clear explanation and explicit approval.

## Risky Command Policy

Before suggesting or running a risky command, explain:

1. Why it is needed.
2. What it will affect.
3. A safer alternative, if one exists.
4. A backup or rollback step.
5. The exact command.

Wait for confirmation before proceeding.

## Safe Defaults

- Prefer read-only inspection before edits.
- Prefer docs and small patches over broad rewrites.
- Prefer project-local changes over system-level changes.
- Prefer verified project truth over assumptions.
- Say `Blocked` when a safe path requires missing information or approval.
