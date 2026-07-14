# Agent System Instructions

This file governs project skills, agent metadata, and reusable agent assets under .agents/. Repository-wide policy remains in the root AGENTS.md.

## Skills

- Keep each skill in .agents/skills/<skill-name>/.
- Require SKILL.md with only name and description in YAML frontmatter.
- Make the folder name match the skill name.
- Put complete trigger language in the description.
- Keep the body concise, imperative, and specific to the task.
- Put detailed references one level below the skill and link to them directly.
- Do not duplicate repository policy or human editorial standards inside a skill.
- Do not add README, changelog, installation, or quick-reference files to a skill.

## Agent metadata

- Give every skill an agents/openai.yaml file.
- Quote every string value.
- Provide display_name, a short_description from 25 to 64 characters, and a one-sentence default_prompt that explicitly names the skill with a dollar-sign prefix.
- Express invocation behavior with policy.allow_implicit_invocation.
- Do not put invocation policy in SKILL.md frontmatter.
- Add icons or brand color only when the user supplies them.

## Canonical references

- Keep human editorial standards, schemas, and templates under editorial/.
- Keep repository path constants and validators under scripts/repository/.
- Keep shared pull request structure in the approved repository template.
- A skill may route to these resources. It must not fork their policy into a second copy.

## Audits and remote state

- Treat repository, branch, pull request, and dependency audits as read-only unless the user explicitly authorizes a mutation.
- Refresh remote references when safe, then inspect every branch and map it to all pull requests before recommending deletion.
- Check open pull request heads and bases before declaring a branch removable.
- Distinguish squash-merged residue from unique unmerged work with pull request metadata and content comparison.
- Do not delete branches, close pull requests, merge, push, post, or alter remote settings as an incidental part of an audit.

## Validation

- Run `npm run repository:validate-agents` after changing instructions, skills, metadata, or agent assets.
- Validate every changed skill folder with the current skill validator when it is available.
- Confirm every linked resource exists and every default prompt names the correct skill.
- Forward-test a materially changed complex skill when doing so is safe and within the authorized scope.

## Licensing

Agent instructions, skills, metadata, and agent-only assets use the software license in LICENSE. Creative source and editorial evidence remain under the content license even when a skill reads them.
