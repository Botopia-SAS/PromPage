import { addKeyword, EVENTS } from "@builderbot/bot";
import usersDatabase from "../services/cloud/usersDatabase";
import fetch from "node-fetch";

// Interfaz para la respuesta del DLO API
interface DLOResponse {
    payment_link?: string;
    paymentLink?: string;
    link?: string;
    subscribeLink?: string; // La respuesta real del DLO API
    success?: boolean;
    error?: string;
    message?: string;
}

export const subscriptionFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        "💳 *¡Perfecto! Te ayudo a elegir el plan ideal para ti*\n\n🎯 Nuestros planes disponibles:\n\n🆓 **Plan Gratuito**\n• 1 página web\n• Tecnologías: React + Next.js\n• Soporte básico\n• ✅ **Precio: GRATIS**\n\n⭐ **Plan Básico - $9.99 USD**\n• 5 páginas web\n• Tecnologías premium\n• Soporte prioritario\n• Actualizaciones menores\n\n🚀 **Plan Pro - $29.99 USD**\n• 15 Páginas\n• Tecnologías avanzadas\n• Soporte 24/7\n• Actualizaciones y modificaciones\n\n🚀 **Plan Business - $49.99 USD**\n• 30 Páginas\n• Tecnologías avanzadas\n• Soporte 24/7\n• Actualizaciones y modificaciones\n• Hosting optimizado\n\n¿Qué plan te interesa?",
        { capture: true },
        async (ctx, ctxFn) => {
            const planChoice = ctx.body.trim().toLowerCase();
            await ctxFn.state.update({ 
                planChoice,
                userPhone: ctx.from 
            });
            
            return await processPlanSelection(planChoice, ctx, ctxFn);
        }
    )
    .addAnswer(
        "💳 *Esperando confirmación de pago...*\n\nEscribe 'listo' o 'pagado' cuando hayas completado el pago:",
        { capture: true },
        async (ctx, ctxFn) => {
            const confirmationMessage = ctx.body.trim().toLowerCase();
            const contactId = ctx.from;
            const state = ctxFn.state.getMyState();
            
            // Verificar que el usuario dice que pagó
            if (!confirmationMessage.includes('listo') && !confirmationMessage.includes('pagado') && !confirmationMessage.includes('pague') && !confirmationMessage.includes('complete')) {
                return ctxFn.flowDynamic("⏳ Por favor, completa tu pago y luego escribe 'listo' o 'pagado' para verificar tu suscripción.");
            }
            
            return await verifyPaymentAndActivatePlan(contactId, state, ctxFn);
        }
    );

// Utilidades de normalización y mapeo
function normalize(text: string): string {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .trim();
}

function classifyCanonical(name: string): 'free' | 'basic' | 'pro' | 'business' | 'unknown' {
    const n = normalize(name);
    if (n.includes('gratis') || n === 'free') return 'free';
    if (n === 'basic' || n === 'basico' || n === 'basic plan') return 'basic';
    if (n === 'pro' || n.includes('premium') || n.includes('avanzado')) return 'pro';
    if (n === 'business' || n === 'empresa' || n === 'negocio') return 'business';
    return 'unknown';
}

function mapUserInputToCanonical(choice: string): 'free' | 'basic' | 'pro' | 'business' | 'unknown' {
    const n = normalize(choice);
    if (/gratis|free|gratuit/.test(n)) return 'free';
    if (/basico|basic/.test(n)) return 'basic';
    if (/pro|premium|avanzad/.test(n)) return 'pro';
    if (/business|empresa|negocio|bussines|busines/.test(n)) return 'business';
    return 'unknown';
}

async function processPlanSelection(planChoice: string, ctx: any, ctxFn: any) {
    try {
        const contactId = ctx.from;
        
        // Obtener planes disponibles
        const plansResult = await usersDatabase.getAllPlans();
        if (!plansResult.success || !plansResult.plans) {
            return ctxFn.endFlow("❌ Error obteniendo planes disponibles. Por favor, intenta nuevamente.");
        }
        
        const canonicalRequested = mapUserInputToCanonical(planChoice);
        console.log('🔍 Canonical solicitado:', canonicalRequested);
        
        let selectedPlan: any = null;
        if (canonicalRequested === 'free') {
            selectedPlan = { plan_name: 'Free', price: 0, tokens: 1, id: 'free-plan' };
        } else {
            // Buscar en la lista de planes retornados por la DB comparando por canonical
            selectedPlan = plansResult.plans.find(p => classifyCanonical(p.plan_name) === canonicalRequested);
        }
        
        console.log('🔍 Planes disponibles en DB (raw):', plansResult.plans.map(p => p.plan_name));
        console.log('🔍 Plan seleccionado (post-mapping):', selectedPlan);
        
        if (!selectedPlan) {
            const availablePlans = plansResult.plans.map(p => p.plan_name).join(', ');
            return ctxFn.endFlow(`❓ No entendí qué plan quieres. Responde con: Básico, Pro o Business.\n\nTambién puedes decir "El Básico", "Plan Pro", "Plan Business".\n\nPlanes en sistema: ${availablePlans}`);
        }
        
        // Verificar plan actual del usuario
        const currentPlanResult = await usersDatabase.getUserPlan(contactId);
        if (currentPlanResult.success && currentPlanResult.plan) {
            const currentCanonical = classifyCanonical(currentPlanResult.plan.plan_name);
            const selectedCanonical = classifyCanonical(selectedPlan.plan_name);
            if (currentCanonical !== 'free' && currentCanonical === selectedCanonical) {
                return ctxFn.endFlow(`✅ Ya tienes el plan ${selectedPlan.plan_name}. ¡Puedes seguir creando páginas!`);
            }
        }
        
        if (classifyCanonical(selectedPlan.plan_name) === 'free') {
            // Plan gratuito - activar inmediatamente
            const updateResult = await usersDatabase.updateUserPlan(contactId, selectedPlan.id);
            
            if (!updateResult.success) {
                return ctxFn.endFlow("❌ Error activando plan gratuito. Por favor, contacta soporte.");
            }
            
            return ctxFn.endFlow(`🎉 *¡Plan Gratuito activado!*\n\n✅ Ya puedes crear tu primera página web\n📝 Escribe 'crear página web' para empezar\n\n🎁 Con tu plan tienes:\n• 1 página web gratis\n• Tecnología React + Next.js\n• Soporte básico`);
        } else {
            // Plan de pago - crear suscripción directamente con DLO
            return await createSubscriptionWithDLO(selectedPlan, contactId, ctxFn);
        }
        
    } catch (error) {
        console.error("❌ Error procesando selección de plan:", error);
        return ctxFn.endFlow("❌ Ocurrió un error. Por favor, intenta nuevamente.");
    }
}

async function createSubscriptionWithDLO(plan: any, contactId: string, ctxFn: any) {
    try {
        console.log("🔄 Creando suscripción con DLO API...");
        
        // Obtener el user_id del usuario
        const userResult = await usersDatabase.getUserByContactId(contactId);
        if (!userResult.success || !userResult.user) {
            throw new Error("Usuario no encontrado");
        }
        
        const userId = userResult.user.id;
        console.log(`🔍 Usuario ID: ${userId}, Plan ID: ${plan.id}`);
        
        // Llamar a la API de DLO para crear la suscripción
        const dloResponse = await fetch('https://microservicio-dlo-production.up.railway.app/api/subscriptions/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                user_id: userId,
                plan_id: plan.id
            })
        });
        
        if (!dloResponse.ok) {
            const errorText = await dloResponse.text();
            console.error("❌ Error response de DLO:", dloResponse.status, errorText);
            throw new Error(`Error del microservicio DLO: ${dloResponse.status} - ${errorText}`);
        }
        
        const dloResult = await dloResponse.json() as DLOResponse;
        console.log("✅ Respuesta de DLO:", dloResult);
        
        // Verificar que recibimos el link de pago
        const paymentLink = dloResult.subscribeLink || dloResult.payment_link || dloResult.paymentLink || dloResult.link;
        console.log("🔗 Payment link encontrado:", paymentLink);
        
        if (!paymentLink) {
            console.error("❌ No se encontró link de pago en la respuesta:", {
                subscribeLink: dloResult.subscribeLink,
                payment_link: dloResult.payment_link,
                paymentLink: dloResult.paymentLink,
                link: dloResult.link
            });
            throw new Error("No se recibió link de pago del microservicio DLO");
        }
        
        // Construir mensaje de respuesta
        let linkMessage = `🎉 *¡Suscripción creada exitosamente!*\n\n`;
        linkMessage += `💳 **Plan seleccionado:** ${plan.plan_name}\n`;
        linkMessage += `💰 **Precio:** $${plan.price} USD\n`;
        linkMessage += `🌐 **Páginas incluidas:** ${plan.tokens === 999 ? 'Ilimitadas' : plan.tokens}\n\n`;
        
        linkMessage += `🔗 **Link seguro de pago:**\n${paymentLink}\n\n`;
        
        linkMessage += `🔒 **Pago seguro con DLO**\n`;
        linkMessage += `• Acepta todas las tarjetas de crédito y débito\n`;
        linkMessage += `• Proceso 100% encriptado y seguro\n`;
        linkMessage += `• Confirmación inmediata por WhatsApp\n\n`;
        
        linkMessage += `💡 **Una vez completes el pago, escribe "listo" o "pagado" para activar tu plan.**`;
        
        // Guardar información en el estado para el siguiente paso
        await ctxFn.state.update({ 
            selectedPlan: plan, 
            paymentLink: paymentLink,
            userId: userId,
            subscriptionStartedAt: Date.now()
        });
        
        await ctxFn.flowDynamic(linkMessage);
        
        // No terminar el flujo - continuar al siguiente paso
        
    } catch (error) {
        console.error("❌ Error creando suscripción con DLO:", error);
        
        let errorMessage = `😔 No pude crear tu suscripción en este momento.\n\n`;
        errorMessage += `❌ **Error:** ${error.message}\n\n`;
        errorMessage += `🔄 **¿Qué puedes hacer?**\n`;
        errorMessage += `• Intenta nuevamente en unos minutos\n`;
        errorMessage += `• Verifica tu conexión a internet\n`;
        errorMessage += `• Contacta soporte si persiste el problema\n\n`;
        errorMessage += `📞 **Soporte:** +57 300 123 4567`;
        
        return ctxFn.endFlow(errorMessage);
    }
}

async function verifyPaymentAndActivatePlan(contactId: string, state: any, ctxFn: any) {
    try {
        console.log("🔍 Verificando plan_id para contactId:", contactId);

        // Obtener usuario y verificar si tiene plan_id asignado
        const userResult = await usersDatabase.getUserByContactId(contactId);
        if (!userResult.success || !userResult.user) {
            return ctxFn.endFlow("❌ Usuario no encontrado. Por favor, contacta soporte.");
        }

        const user = userResult.user;
        console.log("🔍 Usuario plan_id:", user.plan_id);

        // Verificación simple: plan_id debe ser diferente de null
        if (!user.plan_id) {
            return ctxFn.endFlow("⏳ Aún no se ha confirmado tu pago. Por favor, espera unos minutos e intenta nuevamente escribiendo 'listo'.");
        }

        // Si tiene plan_id, obtener detalles del plan para mostrar información
        const userPlanResult = await usersDatabase.getUserPlan(contactId);
        if (!userPlanResult.success || !userPlanResult.plan) {
            return ctxFn.endFlow("✅ ¡Pago confirmado! Tu plan está activo. Escribe 'crear página web' para comenzar.");
        }

        const userPlan = userPlanResult.plan;
        console.log('✅ Plan activado:', userPlan.plan_name);

        // Mensaje de confirmación de éxito
        let successMessage = `🎉 *¡Pago confirmado y plan activado!*\n\n`;
        successMessage += `✅ **Plan:** ${userPlan.plan_name}\n`;
        successMessage += `🌐 **Páginas disponibles:** ${userPlan.tokens === 999 ? 'Ilimitadas' : userPlan.tokens}\n\n`;
        successMessage += `🚀 **Ya puedes crear tus páginas web!**\n`;
        successMessage += `📝 Escribe "crear página web" para comenzar.`;

        return ctxFn.endFlow(successMessage);

    } catch (error) {
        console.error('❌ Error verificando plan_id:', error);
        return ctxFn.endFlow('❌ Error verificando tu plan. Intenta nuevamente en unos minutos.');
    }
}