---
volumeId: "wielding-intelligence"
volumeTitle: "Wielding Intelligence"
volumeOrder: 2
partId: "the-response"
partTitle: "The Response"
partOrder: 2
chapterId: "what-alignment-research-can-do"
chapterTitle: "What Alignment Research Can Do"
chapterOrder: 35
sectionId: "v02-what-alignment-research-can-do"
title: "What Alignment Research Can Do"
sectionOrder: 42
sourceDoc: "sources/manuscripts/coherence-thesis-vol2-wielding-intelligence.md"
sourceHash: "ec529fd16f1cc6050151bb9fb2709d40acdca9ecadcb4c3dd3098422aee0c785"
sourceParagraphStart: 805
sourceParagraphEnd: 818
---

The technical field that has emerged in response to AI safety, now called alignment research, is the most direct site where intelligence in right relationship is being attempted in practice. Its work deserves direct attention because the philosophical framing of “alignment” in popular discourse rarely captures the texture of what is being tried.

The dominant approach for several years has been reinforcement learning from human feedback, or RLHF. Human reviewers rank model outputs by quality and safety, and the model is trained to produce responses that maximize the reward signal those rankings generate. It is a remarkable technique. It is also limited. Human reviewers are expensive, inconsistent, and increasingly unable to evaluate outputs as model capabilities surpass their own. Reward hacking, in which models optimize for what the metric rewards rather than what it was meant to track, is a persistent problem. The approach also embeds the values of whoever labels the data in the trained model, raising the question Chapter Six asked but did not answer: aligned with which humans, under what conditions, and according to whose values?

In response, several research groups have developed approaches that try to operate at a different level. Constitutional AI, developed by Anthropic, attempts to encode a set of explicit principles, a constitution, that the model uses to critique and revise its outputs during training. Rather than relying primarily on human labelers to identify what is harmful, the model is trained to evaluate its responses against stated principles. Recent generations of the approach use constitutional self-play: the model generates training examples by critiquing and refining its responses against the constitution, which can itself be revised when the model identifies ambiguities or gaps. The 2026 version operates with over two hundred principles, up from fifty in earlier iterations.

From the perspective of this book’s argument, the approach attempts something dominant accounting systems have failed to do. It tries to make values legible to the system itself rather than relying on after-the-fact correction. In that precise sense, it experiments with encoding coherence in an intelligence’s operating layer rather than bolting coherence onto its outputs.

This is not a solved problem. Constitutional AI has its own failure modes. Particular humans in particular institutional contexts write the principles, and the constitution reflects their assumptions, blind spots, and cultural location. Critics have pointed out that “alignment” often means alignment with the values of well-resourced safety teams at well-resourced labs. That is not alignment with humanity broadly considered, much less with the conditions life requires. Recent academic literature on “Murphy’s Laws of AI Alignment” has argued that current approaches, including RLHF, Constitutional AI, RLAIF, Direct Preference Optimization, and their hybrids, share a structural limitation: they shape the curve of misalignment without eliminating it. The current generation of techniques can reduce harm and improve robustness, but it does not solve whether sufficiently capable systems will remain aligned as capabilities increase.

The field is working at the problem with increasing sophistication while acknowledging that the underlying question remains open. The honest assessment is closer to this book’s spirit than philosophical framing alone might suggest. People doing this work understand that the problem is civilizational before it is computational, and they are trying to build technical instruments adequate to a problem whose deepest dimensions are not technical.
