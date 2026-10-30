import {portalStudyLyrics as v4LyricsModule} from './scenes/portal-study/StudyLyrics';
import {portalStudyModule as journeyRevealModule, portalStudyContinuation as journeyRevealLegacyModule} from './scenes/portal-study/PortalMaterialScene';

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
  v4LyricsModule,
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
