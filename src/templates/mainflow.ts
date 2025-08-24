import { addKeyword, EVENTS } from "@builderbot/bot";
import { DetectIntention } from "./intention.flow";

// Flujo principal ahora sólo enruta a detección de intención, sin forzar registro
const mainFlow = addKeyword([EVENTS.WELCOME, EVENTS.ACTION, EVENTS.MEDIA, EVENTS.VOICE_NOTE])
  .addAction(async (_ctx, ctxFn) => {
    return ctxFn.gotoFlow(DetectIntention);
  });

export { mainFlow };

