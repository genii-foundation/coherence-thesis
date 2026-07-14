# Supabase Instructions

This file governs database migrations, storage integration, policies, grants, and server credentials under supabase/. Repository-wide policy remains in the root AGENTS.md.

## Data and privacy

- Keep anonymous local reading as the default product mode.
- Require explicit reader consent before uploading reading history.
- Isolate synchronized records with row-level security.
- Treat account deletion, cross-origin protection, grants, and service-role access as security-sensitive.
- Do not add analytics or new remote reader data without explicit product approval.

## Migrations

- Add a new migration for every schema or policy change.
- Never edit an applied production migration to disguise a later change.
- Make ownership, grants, row-level security, and rollback consequences explicit in review.
- Prefer additive, reversible changes. Explain any destructive or irreversible operation before execution.
- Do not run production migrations, destructive queries, bucket deletion, or remote cleanup without explicit authorization.

## Secrets and storage

- Keep service-role keys, database credentials, S3 credentials, and signed values in the environment.
- Never commit, print, paste, or expose secrets in logs or review evidence.
- Use immutable object paths for published audio.
- Validate planned uploads before changing remote storage.

## Validation routing

- Run focused tests for authorization, account deletion, and sync behavior affected by the change.
- Run type checking, unit tests, and the full repository validation before commit.
- Run browser coverage when authentication, consent, sync, or account behavior changes.
- Record any production migration or storage action separately from local validation.

## Licensing

Migration source, policies, and integration code use the software license in LICENSE. Reader content and published audio retain their content licenses.
