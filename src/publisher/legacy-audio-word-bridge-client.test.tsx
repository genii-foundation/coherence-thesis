import { afterEach, describe, expect, it, vi } from "vitest";

const clientMocks = vi.hoisted(() => ({
  activeSections: [] as CoherencePublisherAudioWordRouteSection[],
  host: vi.fn(() => null),
  layoutEffect: null as null | (() => void | (() => void)),
  setActiveSections: vi.fn(),
}));

vi.mock("react", () => ({
  useLayoutEffect(effect: () => void | (() => void)) {
    clientMocks.layoutEffect = effect;
  },
  useState() {
    return [clientMocks.activeSections, clientMocks.setActiveSections];
  },
}));
vi.mock("@/components/ReaderAudioWordInteractionIsland", () => ({
  ReaderAudioWordInteractionHostIsland: clientMocks.host,
}));

import {
  bindCoherencePublisherAudioWords,
  CoherencePublisherAudioWordBridgeClient,
} from "./legacy-audio-word-bridge-client";
import type {
  CoherencePublisherAudioWordRouteModel,
  CoherencePublisherAudioWordRouteSection,
} from "./legacy-audio-word-bridge-contract";

const transitionRootSelector =
  "[data-coherence-publisher-transition-root='true']";
const publisherSectionSelector = "[data-publisher-section]";
const publisherNarrationWordSelector =
  "[data-publisher-narration-word='true']";

class FakeClassList {
  readonly values = new Set<string>();

  add(...tokens: string[]): void {
    for (const token of tokens) this.values.add(token);
  }

  contains(token: string): boolean {
    return this.values.has(token);
  }

  remove(...tokens: string[]): void {
    for (const token of tokens) this.values.delete(token);
  }
}

class FakeElement {
  readonly attributes = new Map<string, string>();
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string | undefined> = {};
  readonly selectorResults = new Map<string, readonly FakeElement[]>();
  closestSection: FakeElement | null = null;
  id = "";
  textContent: string | null = null;
  throwOnAttribute: string | null = null;

  closest<T>(): T | null {
    return this.closestSection as unknown as T | null;
  }

  hasAttribute(name: string): boolean {
    return name === "id" ? this.id !== "" : this.attributes.has(name);
  }

  querySelectorAll<T>(selector: string): T[] {
    return [...(this.selectorResults.get(selector) ?? [])] as unknown as T[];
  }

  removeAttribute(name: string): void {
    if (name === "id") this.id = "";
    else this.attributes.delete(name);
  }

  setAttribute(name: string, value: string): void {
    if (this.throwOnAttribute === name) {
      throw new TypeError(`Refused ${name}`);
    }
    if (name === "id") this.id = value;
    else this.attributes.set(name, value);
  }
}

class FakeDocument {
  readonly elements: readonly FakeElement[];
  readonly roots: readonly FakeElement[];

  constructor(
    roots: readonly FakeElement[],
    elements: readonly FakeElement[],
  ) {
    this.roots = roots;
    this.elements = elements;
  }

  getElementById(id: string): FakeElement | null {
    return this.elements.find((element) => element.id === id) ?? null;
  }

  querySelectorAll<T>(selector: string): T[] {
    return (
      selector === transitionRootSelector ? [...this.roots] : []
    ) as unknown as T[];
  }
}

function routeSection(
  sectionId: string,
  body = "Alpha beta",
): CoherencePublisherAudioWordRouteSection {
  const profileText = `Title\n\n${body}`;
  return Object.freeze({
    bodyStartCharacter: 7,
    bodyWordCount: 2,
    profileText,
    queueIdentity: Object.freeze({
      audioVersionId: `${sectionId}-audio`,
      contentHash: "0123456789abcdef",
    }),
    sectionId,
    titleWordCount: 1,
  });
}

function routeModel(
  sections: readonly CoherencePublisherAudioWordRouteSection[],
): CoherencePublisherAudioWordRouteModel {
  return Object.freeze({
    authorityBuildId:
      "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    schemaVersion: 1,
    sections: Object.freeze([...sections]),
  });
}

function sectionDom(
  section: CoherencePublisherAudioWordRouteSection,
  texts: readonly string[] = ["Alpha", "beta"],
) {
  const root = new FakeElement();
  root.dataset.publisherSection = section.sectionId;
  root.dataset.publisherNarrationBodyWords = String(section.bodyWordCount);
  root.dataset.publisherNarrationTextCharacters = String(
    section.profileText.length,
  );
  root.dataset.publisherNarrationTitleWords = String(section.titleWordCount);
  const words = texts.map((text) => {
    const word = new FakeElement();
    word.textContent = text;
    word.closestSection = root;
    return word;
  });
  root.selectorResults.set(publisherNarrationWordSelector, words);
  return Object.freeze({ root, words: Object.freeze(words) });
}

function documentFor(
  sections: readonly ReturnType<typeof sectionDom>[],
  extraElements: readonly FakeElement[] = [],
): FakeDocument {
  const transitionRoot = new FakeElement();
  transitionRoot.selectorResults.set(
    publisherSectionSelector,
    sections.map(({ root }) => root),
  );
  return new FakeDocument(
    [transitionRoot],
    [
      transitionRoot,
      ...sections.flatMap(({ root, words }) => [root, ...words]),
      ...extraElements,
    ],
  );
}

function expectUndecorated(word: FakeElement): void {
  expect(word.id).toBe("");
  expect([...word.attributes.keys()]).toEqual([]);
  expect([...word.classList.values]).toEqual([]);
}

describe("Coherence Publisher audio word client bridge", () => {
  afterEach(() => {
    clientMocks.activeSections = [];
    clientMocks.host.mockClear();
    clientMocks.layoutEffect = null;
    clientMocks.setActiveSections.mockClear();
  });

  it("passes every active section to one singleton interaction host", () => {
    const first = routeSection("section-a");
    const second = routeSection("section-b");
    clientMocks.activeSections = [first, second];

    const output = CoherencePublisherAudioWordBridgeClient({
      model: routeModel([first, second]),
    }) as {
      props: {
        sections: readonly {
          queueIdentity: Readonly<{
            audioVersionId: string;
            contentHash: string;
          }>;
          sectionId: string;
        }[];
      };
      type: unknown;
    };

    expect(output.type).toBe(clientMocks.host);
    expect(output.props.sections).toEqual([
      {
        queueIdentity: first.queueIdentity,
        sectionId: "section-a",
      },
      {
        queueIdentity: second.queueIdentity,
        sectionId: "section-b",
      },
    ]);
  });

  it("renders no interaction host before the DOM binding succeeds", () => {
    const section = routeSection("section-a");

    expect(
      CoherencePublisherAudioWordBridgeClient({
        model: routeModel([section]),
      }),
    ).toBeNull();
    expect(clientMocks.layoutEffect).toBeTypeOf("function");
  });

  it("decorates only after full preflight and removes every owned mutation", () => {
    const section = routeSection("section-a");
    const dom = sectionDom(section);
    const cleanup = bindCoherencePublisherAudioWords(
      routeModel([section]),
      documentFor([dom]) as unknown as Document,
    );

    expect(cleanup).toBeTypeOf("function");
    expect(dom.words[0]?.id).toBe("audio-word-section-a-0");
    expect(dom.words[0]?.attributes).toEqual(
      new Map([
        ["data-audio-word", "true"],
        ["data-audio-word-id", "audio-word-section-a-0"],
        ["data-audio-section-id", "section-a"],
        ["data-audio-char-start", "0"],
        ["data-audio-char-end", "5"],
      ]),
    );
    expect(dom.words[1]?.attributes.get("data-audio-char-start")).toBe("6");
    expect(dom.words[1]?.attributes.get("data-audio-char-end")).toBe("10");
    dom.words[0]?.classList.add("is-audio-current");
    dom.words[1]?.classList.add("is-audio-focused");

    cleanup?.();

    for (const word of dom.words) expectUndecorated(word);
  });

  it("leaves earlier sections untouched when a later section fails preflight", () => {
    const first = routeSection("section-a");
    const second = routeSection("section-b");
    const firstDom = sectionDom(first);
    const secondDom = sectionDom(second, ["WRONG", "beta"]);

    expect(
      bindCoherencePublisherAudioWords(
        routeModel([first, second]),
        documentFor([firstDom, secondDom]) as unknown as Document,
      ),
    ).toBeNull();
    for (const word of [...firstDom.words, ...secondDom.words]) {
      expectUndecorated(word);
    }
  });

  it("rolls back the current word and all prior words after a mutation error", () => {
    const section = routeSection("section-a");
    const dom = sectionDom(section);
    dom.words[1]!.throwOnAttribute = "data-audio-char-end";

    expect(
      bindCoherencePublisherAudioWords(
        routeModel([section]),
        documentFor([dom]) as unknown as Document,
      ),
    ).toBeNull();
    for (const word of dom.words) expectUndecorated(word);
  });

  it("rejects malformed identity shape and existing owned DOM state", () => {
    const section = routeSection("section-a");
    const malformed = Object.freeze({
      ...section,
      queueIdentity: Object.freeze({
        ...section.queueIdentity,
        extra: true,
      }),
    }) as CoherencePublisherAudioWordRouteSection;
    const malformedDom = sectionDom(section);
    expect(
      bindCoherencePublisherAudioWords(
        routeModel([malformed]),
        documentFor([malformedDom]) as unknown as Document,
      ),
    ).toBeNull();

    const ownedDom = sectionDom(section);
    ownedDom.words[1]?.setAttribute("data-audio-word", "true");
    expect(
      bindCoherencePublisherAudioWords(
        routeModel([section]),
        documentFor([ownedDom]) as unknown as Document,
      ),
    ).toBeNull();
    expectUndecorated(ownedDom.words[0]!);
    expect(ownedDom.words[1]?.attributes.get("data-audio-word")).toBe("true");

    for (const ownedClass of ["is-audio-current", "is-audio-focused"]) {
      const classDom = sectionDom(section);
      classDom.words[1]?.classList.add(ownedClass);
      expect(
        bindCoherencePublisherAudioWords(
          routeModel([section]),
          documentFor([classDom]) as unknown as Document,
        ),
      ).toBeNull();
      expectUndecorated(classDom.words[0]!);
      expect([...classDom.words[1]!.classList.values]).toEqual([ownedClass]);
    }
  });

  it("rejects duplicate transition roots and stable ID collisions", () => {
    const section = routeSection("section-a");
    const dom = sectionDom(section);
    const duplicateRootDocument = documentFor([dom]);
    const secondRoot = new FakeElement();
    const duplicateRoots = new FakeDocument(
      [...duplicateRootDocument.roots, secondRoot],
      [...duplicateRootDocument.elements, secondRoot],
    );
    expect(
      bindCoherencePublisherAudioWords(
        routeModel([section]),
        duplicateRoots as unknown as Document,
      ),
    ).toBeNull();

    const collisionDom = sectionDom(section);
    const collision = new FakeElement();
    collision.id = "audio-word-section-a-0";
    expect(
      bindCoherencePublisherAudioWords(
        routeModel([section]),
        documentFor([collisionDom], [collision]) as unknown as Document,
      ),
    ).toBeNull();
    for (const word of collisionDom.words) expectUndecorated(word);
  });

  it("rejects colliding generated IDs across distinct section IDs", () => {
    const dotted = routeSection("section.a");
    const dashed = routeSection("section-a");
    const dottedDom = sectionDom(dotted);
    const dashedDom = sectionDom(dashed);

    expect(
      bindCoherencePublisherAudioWords(
        routeModel([dotted, dashed]),
        documentFor([dottedDom, dashedDom]) as unknown as Document,
      ),
    ).toBeNull();
    for (const word of [...dottedDom.words, ...dashedDom.words]) {
      expectUndecorated(word);
    }
  });

  it("rejects a route payload beyond the fixed client byte bound", () => {
    const oversized = routeSection(
      "section-a",
      `Alpha beta${".".repeat(33_000)}`,
    );
    const dom = sectionDom(oversized);

    expect(
      bindCoherencePublisherAudioWords(
        routeModel([oversized]),
        documentFor([dom]) as unknown as Document,
      ),
    ).toBeNull();
    for (const word of dom.words) expectUndecorated(word);
  });
});
