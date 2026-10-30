import { lazy, Suspense, useMemo, useState, type ComponentType } from "react";
import { Player } from "@remotion/player";
import rawRegistry from "../../../packages/animation-library/registry.json";
import { parseCapabilityRegistry, type CapabilityExample } from "@motion/animations/registry";
import {
  CanvasExample,
  ChatBubbleExample,
  ComicPopExample,
  CounterExample,
  FadeExample,
  KaraokeWordsExample,
  KineticTextExample,
} from "../../../examples/capabilities/visual";
import SubtitleClipExample from "../../../examples/capabilities/subtitle";
import "./capabilities.css";

const ThreeSceneExample = lazy(() =>
  import("../../../examples/capabilities/threejs").then(({ ThreeSceneExample }) => ({
    default: ThreeSceneExample,
  })),
);

const registry = parseCapabilityRegistry(rawRegistry);
const previewCompositions: Record<string, ComponentType<Record<string, never>>> = {
  canvas: CanvasExample,
  fade: FadeExample,
  "kinetic-text": KineticTextExample,
  "chat-bubble": ChatBubbleExample,
  "comic-pop": ComicPopExample,
  counter: CounterExample,
  "karaoke-words": KaraokeWordsExample,
  "subtitle-clip": SubtitleClipExample,
  threejs: ThreeSceneExample,
};
const initialFrames: Record<string, number> = {
  canvas: 60,
  fade: 45,
  "kinetic-text": 72,
  "chat-bubble": 60,
  "comic-pop": 32,
  counter: 80,
  "karaoke-words": 60,
  "subtitle-clip": 48,
  threejs: 60,
};

export function CapabilitiesExplorer() {
  const [view, setView] = useState<"creator" | "developer">("creator");
  const [selectedId, setSelectedId] = useState(registry.capabilities[0].id);
  const [resource, setResource] = useState<{ title: string; content: string }>();
  const [resourceError, setResourceError] = useState("");
  const capability = registry.capabilities.find((item) => item.id === selectedId)!;
  const examples = useMemo(
    () => registry.examples.filter((item) => capability.exampleIds.includes(item.id)),
    [capability],
  );

  async function openResource(title: string, path: string) {
    setResourceError("");
    try {
      const response = await fetch(`/api/capability-resource?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error(await response.text());
      setResource({ title, content: await response.text() });
    } catch (error) {
      setResourceError(error instanceof Error ? error.message : String(error));
    }
  }

  return (
    <section className="capability-explorer" aria-label="Capabilities explorer">
      <header className="capability-heading">
        <div>
          <span className="eyebrow">CAPABILITIES EXPLORER</span>
          <h2>Discover what you can build</h2>
          <p>Reusable code modules and small technical examples. Projects remain your own videos.</p>
        </div>
        <div className="capability-views" role="tablist" aria-label="Explorer view">
          <button role="tab" aria-selected={view === "creator"} className={view === "creator" ? "selected" : ""} onClick={() => setView("creator")}>For creators</button>
          <button role="tab" aria-selected={view === "developer"} className={view === "developer" ? "selected" : ""} onClick={() => setView("developer")}>Developer / AI</button>
        </div>
      </header>

      <div className="capability-layout">
        <nav className="capability-list" aria-label="Available capabilities">
          {registry.capabilities.map((item) => (
            <button
              key={item.id}
              className={item.id === selectedId ? "active" : ""}
              aria-pressed={item.id === selectedId}
              onClick={() => { setSelectedId(item.id); setResource(undefined); setResourceError(""); }}
            >
              <small>{item.category}</small>
              <strong>{item.name}</strong>
              <span>{item.purpose}</span>
            </button>
          ))}
        </nav>

        <article className="capability-detail">
          {resource ? (
            <section className="capability-resource" aria-label={resource.title}>
              <div className="capability-resource-heading">
                <div><span className="eyebrow">PROJECT REFERENCE</span><h2>{resource.title}</h2></div>
                <button onClick={() => setResource(undefined)}>Back to capability</button>
              </div>
              <pre>{resource.content}</pre>
            </section>
          ) : (
            <>
              <div className="capability-detail-heading">
                <span className="pill">{capability.category}</span>
                <h2>{capability.name}</h2>
                <p>{capability.purpose}</p>
              </div>

              {view === "creator" ? (
                <>
                  <section className="cap-section">
                    <h3>What you can make</h3>
                    <ul>{capability.creatorActions.map((action) => <li key={action}>{action}</li>)}</ul>
                  </section>
                  <ExampleCard example={examples[0]} onOpen={openResource} />
                  {examples[0]?.preview && previewCompositions[examples[0].preview] && (
                    <div className="capability-preview" aria-label={`${capability.name} working preview`}>
                      <Suspense fallback={<div className="capability-no-preview">Loading 3D preview…</div>}>
                        <Player
                          component={previewCompositions[examples[0].preview]}
                          durationInFrames={180}
                          compositionWidth={1920}
                          compositionHeight={1080}
                          fps={30}
                          initialFrame={initialFrames[examples[0].preview] ?? 30}
                          controls
                          loop
                          style={{ width: "100%", height: "100%" }}
                        />
                      </Suspense>
                    </div>
                  )}
                  {!examples[0]?.preview && <p className="capability-no-preview">This API example has no visual preview. The example file uses the real module directly.</p>}
                  <section className="cap-section prompt-section">
                    <h3>Try asking an AI agent</h3>
                    {capability.suggestedPrompts.map((prompt) => <blockquote key={prompt}>{prompt}</blockquote>)}
                  </section>
                </>
              ) : (
                <>
                  <div className="cap-api-line"><span>Public API</span><code>{capability.api.importPath}</code></div>
                  <pre className="cap-import">import &#123; {capability.api.symbol} &#125; from '{capability.api.importPath}';</pre>
                  <div className="capability-columns">
                    <section className="cap-section">
                      <h3>Editable parameters / inputs</h3>
                      {capability.parameters.length ? capability.parameters.map((parameter) => (
                        <div className="cap-parameter" key={parameter.name}>
                          <code>{parameter.name}{parameter.required ? " *" : ""}</code>
                          <span>{parameter.type}{parameter.default ? ` · default ${parameter.default}` : ""}</span>
                          <p>{parameter.description}</p>
                        </div>
                      )) : <p>No runtime parameters are declared.</p>}
                    </section>
                    <section className="cap-section">
                      <h3>Editor integration</h3>
                      <p><strong>Timeline:</strong> {capability.integration.timeline}</p>
                      <p><strong>Editor:</strong> {capability.integration.editor}</p>
                      <h3>Dependencies</h3>
                      <ul>{capability.dependencies.map((dependency) => <li key={dependency}>{dependency}</li>)}</ul>
                    </section>
                  </div>
                  <section className="cap-section">
                    <h3>Limitations</h3>
                    <ul>{capability.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
                  </section>
                  <ExampleCard example={examples[0]} onOpen={openResource} />
                  <section className="cap-section prompt-section">
                    <h3>Suggested AI prompts</h3>
                    {capability.suggestedPrompts.map((prompt) => <blockquote key={prompt}>{prompt}</blockquote>)}
                  </section>
                </>
              )}

              <footer className="capability-links">
                <button onClick={() => openResource("Documentation", capability.documentation)}>Read {capability.documentation}</button>
                <button onClick={() => examples[0] && openResource(examples[0].title, examples[0].path)}>View working example</button>
              </footer>
              {resourceError && <p className="capability-error" role="alert">{resourceError}</p>}
            </>
          )}
        </article>
      </div>
    </section>
  );
}

function ExampleCard({ example, onOpen }: { example: CapabilityExample | undefined; onOpen: (title: string, path: string) => void }) {
  if (!example) return null;
  return (
    <section className="cap-example">
      <div>
        <span className="eyebrow">TECHNICAL EXAMPLE</span>
        <h3>{example.title}</h3>
        <p>{example.summary}</p>
        <code>{example.path}</code>
      </div>
      <button onClick={() => onOpen(example.title, example.path)}>View source</button>
    </section>
  );
}
