import {Canvas,Fade} from '@motion/sdk';
import {ChatBubble,ComicPop,Counter,KineticText} from '@motion/animations';
export default function ConversationScene(){return (
        <Canvas background="#15231f">
          <Fade>
            <div style={{ padding: 90 }}>
              <div
                style={{
                  fontSize: 24,
                  color: "#bce78a",
                  letterSpacing: 6,
                  marginBottom: 60,
                }}
              >
                02 / THE CONVERSATION
              </div>
              <KineticText
                text="Describe it. Build it. Refine it."
                size={100}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 35,
                  marginTop: 85,
                }}
              >
                <ChatBubble
                  delay={20}
                  text="Create an explainer about a better way to make videos."
                />
                <ChatBubble
                  delay={45}
                  side="right"
                  text="Three scenes. Reusable motion. Your story."
                />
                <ChatBubble
                  delay={80}
                  text="Keep the toolkit. Make the next idea even better."
                />
              </div>
            </div>
          </Fade>
        </Canvas>
      );}
