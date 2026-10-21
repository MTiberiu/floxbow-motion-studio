import {Canvas,Fade} from '@motion/sdk';
import {ChatBubble,ComicPop,Counter,KineticText} from '@motion/animations';
export default function ToolkitScene(){return (
        <Canvas background="#1c1b2b">
          <Fade>
            <div style={{ padding: 90 }}>
              <div style={{ fontSize: 24, color: "#bce78a", letterSpacing: 6 }}>
                03 / THE TOOLKIT
              </div>
              <div style={{ marginTop: 110 }}>
                <ComicPop text="CREATE. REUSE. EVOLVE." />
              </div>
              <div style={{ display: "flex", gap: 100, marginTop: 90 }}>
                {[
                  { n: 3, label: "animated scenes" },
                  { n: 6, label: "reusable components" },
                  { n: 1, label: "independent project" },
                ].map((s) => (
                  <div key={s.label}>
                    <div
                      style={{
                        fontSize: 130,
                        color: "#c5f18a",
                        fontWeight: 800,
                      }}
                    >
                      <Counter to={s.n} frames={70} />
                    </div>
                    <div style={{ fontSize: 28, color: "#a3adbf" }}>
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 70, fontSize: 30 }}>
                The next story is yours.
              </div>
            </div>
          </Fade>
        </Canvas>
      );}
