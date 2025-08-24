import { config } from "../config";
import path from "path";
import fs from "fs";
import { createFlowRouting } from "@builderbot-plugins/langchain";
import { EVENTS } from "@builderbot/bot";
import { menuFlow } from "./menuFlow";
import { faqFlow } from "./faqFlow";
import { registerFlow } from "./registerFlow";
import { createWebPageFlow } from "./createWebPageFlow";
import { subscriptionFlow } from "./subscriptionFlow";
import aiServices from "../services/AI/aiServices";
import supabaseAuth from "../services/cloud/supabaseAuth";

const PROMPT_DETECTED = path.join(process.cwd(), "assets/prompts", "prompt_Detection.txt");
const promptDetected = fs.readFileSync(PROMPT_DETECTED, "utf8");
const BOT_NUMBER = process.env.BOT_NUMBER || "573138381310"; // mismo formato que lines.number

export const DetectIntention = createFlowRouting
.setKeyword([EVENTS.ACTION, EVENTS.MEDIA, EVENTS.VOICE_NOTE])
.setIntentions({
intentions: ["MENU_OPCIONES", "FAQ", "SOLICITAR_COTIZACION", "SALUDO", "REGISTRAR_PROYECTO", "CREATE_WEB_PAGE", "STARTSUBSCRIPTION", "CHANCE_SUBSCRIPTION", "CANCEL_SUBSCRIPTION", "NO_DETECTED"],
  description: promptDetected,
})
.setAIModel({
modelName: "openai" as any,
args: { modelName: config.Model, apikey: config.ApiKey },
})
.create({
  afterEnd(flow) {
    return flow.addAction(async (ctx, { endFlow, gotoFlow }) => {
    console.log("ctx completo recibido:", JSON.stringify(ctx, null, 2));
  try {
  console.log("📩 Tipo de mensaje recibido:", ctx.type);
  let extractedText = "";
  if (ctx.type === "image") {
    extractedText = await aiServices.extractTextFromImage(ctx.url);
} else if (ctx.type === "audio") {
            extractedText = await aiServices.processAudio(ctx.url);
} else if (ctx.type === "text") {
            extractedText = ctx.body?.trim();
} else if (ctx.type === "button") {
extractedText = ctx.payload?.trim() || ctx.body?.trim();
}
if (!extractedText) {
  return endFlow("No pude entender tu mensaje. ¿Podrías intentar nuevamente?");
}

// Detección directa de keywords críticos antes de IA
let detectedIntent: string;
const normalizedText = extractedText.toLowerCase().trim();

if (normalizedText === 'suscribirse' || normalizedText === 'suscribirme' || normalizedText.includes('quiero suscrib')) {
    detectedIntent = 'STARTSUBSCRIPTION';
    console.log("🎯 Keyword directo detectado: STARTSUBSCRIPTION");
} else {
    detectedIntent = await aiServices.detectIntent(extractedText);
    console.log("🔍 Intención detectada por IA:", detectedIntent);
}

// Flujos que NO requieren registro previo
if (detectedIntent === "SALUDO") {
return endFlow("¡Hola! 👋 Soy tu asesora de diseño web.\n\n¿Cómo puedo ayudarte hoy?\n\n✨ Puedo ayudarte a:\n• Crear tu página web\n• Darte una cotización\n• Mostrarte ejemplos de mi trabajo\n• Responder tus dudas\n\n¿Qué te gustaría hacer?");
}
if (detectedIntent === "FAQ") {
return gotoFlow(faqFlow);
}
if (detectedIntent === "MENU_OPCIONES") {
  return gotoFlow(menuFlow);
          }

// CREATE_WEB_PAGE - Flujo directo para generación con V0
if (detectedIntent === "CREATE_WEB_PAGE") {
  // Verificar contacto en la línea; si no existe, mandar a registro primero
  const { exists } = await supabaseAuth.contactExistsInLine(ctx.from, BOT_NUMBER);
  if (!exists) {
    console.log("🆕 Usuario sin registro previo: enviando a registerFlow antes de CREATE_WEB_PAGE");
    return gotoFlow(registerFlow);
  }
  console.log("🎨 Iniciando flujo CREATE_WEB_PAGE");
  return gotoFlow(createWebPageFlow);
}

// STARTSUBSCRIPTION - Flujo de suscripción
if (detectedIntent === "STARTSUBSCRIPTION") {
  // Verificar contacto en la línea; si no existe, mandar a registro primero
  const { exists } = await supabaseAuth.contactExistsInLine(ctx.from, BOT_NUMBER);
  if (!exists) {
    console.log("🆕 Usuario sin registro previo: enviando a registerFlow antes de STARTSUBSCRIPTION");
    return gotoFlow(registerFlow);
  }
  console.log("💳 Iniciando flujo STARTSUBSCRIPTION");
  return gotoFlow(subscriptionFlow);
}

// CHANCE_SUBSCRIPTION - Cambio de plan
if (detectedIntent === "CHANCE_SUBSCRIPTION") {
  const { exists } = await supabaseAuth.contactExistsInLine(ctx.from, BOT_NUMBER);
  if (!exists) {
    console.log("🆕 Usuario sin registro previo: enviando a registerFlow antes de cambio de plan");
    return gotoFlow(registerFlow);
  }
  console.log("🔄 Procesando cambio de plan");
  return gotoFlow(subscriptionFlow); // Usa el mismo flujo, ya maneja casos existentes
}

// CANCEL_SUBSCRIPTION - Cancelación de suscripción
if (detectedIntent === "CANCEL_SUBSCRIPTION") {
  const { exists } = await supabaseAuth.contactExistsInLine(ctx.from, BOT_NUMBER);
  if (!exists) {
    return endFlow("❓ No tienes una cuenta registrada. Para crear una cuenta, escribe 'registro'.");
  }
  console.log("❌ Procesando cancelación de suscripción");
  return endFlow("😔 Lamentamos que quieras cancelar tu suscripción.\n\n📞 Para procesar la cancelación, contacta nuestro soporte:\n• WhatsApp: +57 300 123 4567\n• Email: soporte@miweb.com\n\n💡 Recuerda que puedes pausar tu plan temporalmente si lo necesitas.");
}

// Intenciones que disparan validación de registro / contacto
if (detectedIntent === "REGISTRAR_PROYECTO" || detectedIntent === "SOLICITAR_COTIZACION") {
  // Verificar contacto en la línea; si no existe, mandar a registro
            const { exists } = await supabaseAuth.contactExistsInLine(ctx.from, BOT_NUMBER);
  if (!exists) {
    console.log("🆕 Usuario sin registro previo: enviando a registerFlow");
    return gotoFlow(registerFlow);
            }
  if (detectedIntent === "SOLICITAR_COTIZACION") {
  return endFlow("¡Perfecto! 😊 Me encantaría prepararte una cotización personalizada.\n\nPara darte el mejor precio, necesito conocer algunos detalles de tu proyecto.\n\n¿Podrías contarme qué tipo de página web necesitas? (Ej: tienda online, página informativa, portafolio, etc.)");
}
  // REGISTRAR_PROYECTO y ya existe contacto -> continuar al flujo de registro por datos extendidos
            return gotoFlow(registerFlow);
}

return endFlow("😊 Disculpa, no entendí bien tu mensaje.\n\n¿Podrías decirme cómo puedo ayudarte?\n\nPuedes preguntarme sobre:\n• Crear una página web\n • Resolver dudas sobre diseño web");
        } catch (error) {
console.error("❌ Error al procesar la intención:", error);
return endFlow("Ocurrió un problema. Por favor, intenta nuevamente.");
}
      });
},
});
