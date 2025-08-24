import { addKeyword, EVENTS } from "@builderbot/bot";
import aiServices from "~/services/AI/aiServices";
import supabaseManager from "~/services/cloud/supabaseManager";

export const faqFlow = addKeyword(EVENTS.ACTION)
  .addAction(async (ctx, { endFlow }) => {
    try {
      // 1) Recuperar o iniciar historial
      const history = (await supabaseManager.getUserConv(ctx.from)) || [];

      // 2) Extraer texto según el tipo que ya detectó DetectIntention
      let promptText: string;
      if (ctx.type === "audio" || ctx.type === "voice_note") {
        // ctx.url viene de createFlowRouting
        promptText = await aiServices.processAudio(ctx.url!);
      } else if (ctx.type === "image") {
        promptText = await aiServices.extractTextFromImage(ctx.url!);
      } else {
        promptText = ctx.body.trim();
      }

      // 3) Si no obtuvimos nada
      if (!promptText) {
        return endFlow(
          "No pude entender tu mensaje. ¿Podrías reformularlo?"
        );
      }

      // 4) Añadir al historial y llamar al chat
      history.push({ role: "user", content: promptText });
      const respuesta = await aiServices.chat(promptText, history);

      // 5) Guardar intercambio en Supabase (crear contacto automático si no existe)
      await supabaseManager.addConverToUser(ctx.from, [
        { role: "user", content: promptText },
        { role: "assistant", content: respuesta },
      ], ctx.name || ctx.pushName); // Usar el nombre de WhatsApp disponible

      // 6) Devolver la respuesta al usuario
      return endFlow(respuesta);
    } catch (error) {
      console.error("Error en FAQ flow:", error);
      return endFlow(
        "Ocurrió un problema procesando tu mensaje, por favor intenta de nuevo."
      );
    }
  });
