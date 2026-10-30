import { journeyRevealModule } from './scenes/JourneyReveal';
import { journeyRevealLegacyModule } from './scenes/JourneyRevealLegacy';
import { burdenSceneModule } from './scenes/BurdenScene';
import { phonePerformanceModule } from './scenes/PhonePerformance';
import { Canvas } from "@motion/sdk";
import { TimelineComposition, type EditableVideoProps } from "@motion/sdk/editor";
import { parseEditTimeline } from "@motion/sdk/timeline";
import savedTimeline from "./edit-timeline.json";
import {
  directorAccentModule,
  directorActorModule,
  directorLyricsModule,
  directorPlateModule,
  directorPaperFallModule,
} from "./scenes/DirectorComponents";

export const editorComponents = [
  journeyRevealModule,
  journeyRevealLegacyModule,
  burdenSceneModule,
  phonePerformanceModule,
  directorLyricsModule,
  directorActorModule,
  directorAccentModule,
  directorPlateModule,
  directorPaperFallModule,
];

export default function Video({ timeline }: EditableVideoProps) {
  return (
    <Canvas background="#fbfaf7" style={{ padding: 0 }}>
      <TimelineComposition
        timeline={timeline ?? parseEditTimeline(savedTimeline)}
        components={editorComponents}
      />
    </Canvas>
  );
}
