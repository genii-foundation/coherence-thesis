# Security Policy

The Coherence Thesis welcomes responsible reports that help protect readers, contributors, and the publishing infrastructure.

## Supported Versions

Security fixes target the current production site and the latest commit on `main`. Older commits, abandoned branches, local modifications, and unofficial deployments are not maintained security releases.

## Report a Vulnerability Privately

Use GitHub's private vulnerability reporting form:

[Report a vulnerability](https://github.com/genii-foundation/coherence-thesis/security/advisories/new)

Do not open a public issue, discussion, or pull request containing exploit details. Do not include real credentials, session tokens, private reader data, or unnecessary personal information in a report.

Include enough information to investigate safely:

- A clear description of the vulnerability and its likely impact
- The affected URL, route, component, dependency, or commit
- Reproduction steps or a minimal proof of concept
- Required account state, browser, device, and configuration
- Any suggested mitigation or evidence that limits the impact
- Whether you believe the issue is already being exploited

## Relevant Security Areas

Reports may concern:

- Authentication, sessions, account deletion, or optional reader sync
- Authorization boundaries and Supabase row level security
- Exposure of secrets, credentials, private data, or administrative APIs
- Cross-site scripting, request forgery, injection, or unsafe redirects
- Security header, content security policy, or clickjacking bypasses
- Dependency and build pipeline compromise
- GitHub Actions, generated artifacts, deployment, or release integrity
- A realistic privacy failure affecting local reading history or synchronized data

Content disagreements, ordinary manuscript corrections, broken links, feature requests, and automated scanner output without a plausible security impact belong in public issues instead.

## Responsible Testing

- Test only against accounts, data, and systems you own or have permission to use.
- Stop if testing could expose another person's data, degrade service, or alter production content.
- Do not use denial of service, destructive actions, social engineering, spam, credential stuffing, or broad automated scanning.
- Minimize the data you collect and delete it when the report is resolved.
- Give the maintainer a reasonable opportunity to investigate and fix the issue before public disclosure.

Good faith research that follows these guidelines is welcome. This policy does not authorize activity that violates law, third party terms, or the rights of others.

## Response and Disclosure

The maintainer will confirm receipt as soon as practical, assess scope and severity, and communicate through the private advisory. Resolution timing depends on impact, complexity, and coordination with affected services.

Please coordinate public disclosure through the advisory. When appropriate, the project will publish a security advisory with affected versions, impact, remediation, and credit requested by the reporter.

## Project Security Model

- Manuscripts and core reading work without an account.
- Reading progress remains local unless a signed-in reader explicitly enables sync.
- Synchronized records rely on Supabase row level security for isolation.
- Destructive account requests require authentication and same-origin checks.
- GitHub Actions use read-only default tokens and an allowlist of GitHub-owned actions.
- Production changes enter through protected pull requests, required validation, and maintainer-only merges to `main`.
- GitHub secret scanning, push protection, and Dependabot security updates are enabled.

Security is a process, not a ceremonial checkbox wearing a tiny helmet. Reports that sharpen this model are appreciated.
