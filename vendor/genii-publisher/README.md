# GENII Publisher candidate archives

This directory retains the exact package archives used by the Publisher migration
preview. They are candidate inputs, not published releases. Every candidate
directory contains a `candidate.json` record that binds its archives to one
Publisher commit, exact Node and npm versions, byte sizes, and SHA256 digests.

Do not replace an archive in place. A newer Publisher candidate belongs in a new
commit-named directory with a new record and a reviewed dependency update.

GENII Publisher is licensed under CPAL 1.0. Each archive includes its applicable
license, notices, and source. Canonical source is available at
<https://github.com/genii-foundation/publisher>.
