import { Canvas, Fade, useCurrentFrame } from "@motion/sdk";
import { KineticText } from "@motion/animations";
export default function TitleScene() {
  const frame = useCurrentFrame();
  return (
    <Canvas>
      <Fade>
        <div
          style={{
            padding: 90,
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <div style={{ fontSize: 24, letterSpacing: 8, color: "#bce78a" }}>
            A NEW WAY TO CREATE
          </div>
          <div style={{ maxWidth: 1250, marginTop: 120 }}>
            <KineticText text="Great stories start with an idea." size={142} />
          </div>
          <div style={{ marginTop: 60, fontSize: 34, color: "#97a7bb" }}>
            Give it a toolkit. Put it in motion.
          </div>
          <div
            style={{
              position: "absolute",
              right: 120,
              bottom: 120,
              width: 220,
              height: 220,
              border: "3px solid #bce78a",
              borderRadius: 45,
              transform: `rotate(${frame * 0.3}deg)`,
            }}
          />
          <div style={{ marginTop: "auto", color: "#71839b", fontSize: 22 }}>
            AI MOTION STUDIO{" "}
            <span style={{ marginLeft: 45, color: "#bce78a" }}>
              01 / THE IDEA
            </span>
          </div>
        </div>
      </Fade>
    </Canvas>
  );
}
