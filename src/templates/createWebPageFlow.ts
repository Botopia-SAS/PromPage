import { addKeyword, EVENTS } from "@builderbot/bot";
import aiServices from "../services/AI/aiServices";
import usersDatabase from "../services/cloud/usersDatabase";

interface WebPageInfo {
    websiteType?: string;
    projectDescription?: string;
    mainObjective?: string;
    targetAudience?: string;
    features?: string;
    style?: string;
    sections?: string;
    callToAction?: string;
    userPhone?: string;
}

export const createWebPageFlow = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { endFlow, flowDynamic, state }) => {
        // Verificar límites INMEDIATAMENTE y decidir qué hacer
        const contactId = ctx.from;
        
        try {
            console.log("🔍 Verificando límites de páginas para usuario:", contactId);
            
            // Verificar si el usuario puede crear una página
            let limitResult = await usersDatabase.canCreatePage(contactId);
            
            if (!limitResult.success) {
                // Si el usuario no existe en la base de datos adicional, crearlo automáticamente
                if (limitResult.error === 'Usuario no encontrado') {
                    console.log("🔄 Usuario existe en contacts pero no en users DB. Creando automáticamente...");
                    
                    // Obtener el contact_id (UUID) de la tabla contacts
                    const contactUuid = await usersDatabase.getContactUuidByPhone(contactId);
                    if (!contactUuid) {
                        console.error("❌ No se pudo obtener UUID del contacto");
                        return endFlow("❌ Error configurando tu cuenta. Por favor, contacta soporte.");
                    }
                    
                    // Crear usuario básico en la base de datos adicional
                    const createResult = await usersDatabase.createUser({
                        name: ctx.name || ctx.pushName || `Usuario ${contactId.slice(-4)}`,
                        email: `${contactId}@temp.com`,
                        contact_id: contactUuid,
                        tokens: 1 // Plan gratuito: 1 página
                    });
                    
                    if (!createResult.success) {
                        console.error("❌ Error creando usuario automático:", createResult.error);
                        return endFlow("❌ Error configurando tu cuenta. Por favor, contacta soporte.");
                    }
                    
                    console.log("✅ Usuario creado automáticamente en DB adicional");
                    
                    // Reintentar verificación de límites
                    limitResult = await usersDatabase.canCreatePage(contactId);
                }
                
                if (!limitResult.success) {
                    console.error("❌ Error verificando límites después de crear usuario:", limitResult.error);
                    return endFlow("❌ Error verificando tu plan. Por favor, intenta nuevamente.");
                }
            }
            
            if (!limitResult.canCreate) {
                // Usuario ha alcanzado el límite - DETENER Y ENVIAR A SUSCRIPCIÓN
                let limitMessage = `🚫 **Has alcanzado el límite de tu plan ${limitResult.planName}**\n\n`;
                limitMessage += `📊 **Estado actual:**\n`;
                limitMessage += `• Páginas restantes: ${limitResult.remainingPages}\n`;
                limitMessage += `• Plan actual: ${limitResult.planName}\n\n`;
                
                limitMessage += `🎯 **Planes disponibles:**\n\n`;
                limitMessage += `⭐ **Plan Básico ($9.99)**\n`;
                limitMessage += `• 5 páginas web\n\n`;
                
                limitMessage += `🚀 **Plan Pro ($29.99)**\n`;
                limitMessage += `• 15 páginas web\n\n`;
                
                limitMessage += `💡 Escribe "suscribirse" para actualizar tu plan y crear más páginas.`;
                
                return endFlow(limitMessage);
            }
            
            // El usuario SÍ puede crear - CONTINUAR CON PRIMERA PREGUNTA
            console.log(`✅ Usuario puede crear página. Páginas restantes: ${limitResult.remainingPages}`);
            
            await state.update({ 
                userPhone: ctx.from,
                remainingPages: limitResult.remainingPages 
            });
            
            // Enviar la primera pregunta directamente desde aquí
            await flowDynamic("🎨 ¡Perfecto! Vamos a crear tu página web usando V0 de Vercel 🚀\n\n🌐 *¿Qué tipo de página web necesitas?*\n\nEjemplos: tienda online, portafolio, página corporativa, blog, etc.");
            
        } catch (error) {
            console.error("❌ Error verificando límites:", error);
            return endFlow("❌ Ocurrió un error verificando tu plan. Por favor, intenta nuevamente.");
        }
    })
    .addAnswer(
        "",
        { capture: true },
        async (ctx, ctxFn) => {
            const websiteType = ctx.body.trim();
            await ctxFn.state.update({ websiteType });
        }
    )
    .addAnswer(
        "📋 *Cuéntame sobre tu proyecto o negocio*\n\n¿A qué te dedicas? ¿Cuál es tu producto o servicio principal?",
        { capture: true },
        async (ctx, ctxFn) => {
            const projectDescription = ctx.body.trim();
            await ctxFn.state.update({ projectDescription });
        }
    )
    .addAnswer(
        "🎯 *¿Cuál es el objetivo principal de tu página web?*\n\nEjemplos: conseguir clientes, vender productos, mostrar trabajos, etc.",
        { capture: true },
        async (ctx, ctxFn) => {
            const mainObjective = ctx.body.trim();
            await ctxFn.state.update({ mainObjective });
        }
    )
    .addAnswer(
        "👥 *¿Quién es tu público objetivo?*\n\n¿A quién quieres llegar con tu página?",
        { capture: true },
        async (ctx, ctxFn) => {
            const targetAudience = ctx.body.trim();
            await ctxFn.state.update({ targetAudience });
        }
    )
    .addAnswer(
        "⚡ *¿Qué funcionalidades necesitas?*\n\nEjemplos: formulario de contacto, galería, chat, carrito de compras, etc.",
        { capture: true },
        async (ctx, ctxFn) => {
            const features = ctx.body.trim();
            await ctxFn.state.update({ features });
        }
    )
    .addAnswer(
        "🎨 *¿Qué estilo visual prefieres?*\n\n¿Tienes colores específicos? ¿Qué sensación quieres transmitir?",
        { capture: true },
        async (ctx, ctxFn) => {
            const style = ctx.body.trim();
            await ctxFn.state.update({ style });
        }
    )
    .addAnswer(
        "📑 *¿Qué secciones debe tener tu página?*\n\nEjemplos: inicio, servicios, sobre nosotros, testimonios, contacto, etc.",
        { capture: true },
        async (ctx, ctxFn) => {
            const sections = ctx.body.trim();
            await ctxFn.state.update({ sections });
        }
    )
    .addAnswer(
        "🚀 *¿Cuál es la acción principal que quieres que realicen los visitantes?*\n\nEjemplos: contactarme, comprar, registrarse, descargar, etc.",
        { capture: true },
        async (ctx, ctxFn) => {
            const callToAction = ctx.body.trim();
            await ctxFn.state.update({ callToAction });
            
            // Procesar generación de la página web (ya se verificaron límites al inicio)
            return await processWebPageGeneration(ctx, ctxFn);
        }
    );


async function processWebPageGeneration(_ctx: any, ctxFn: any) {
    try {
        const state = ctxFn.state.getMyState() as WebPageInfo;
        
        // Mostrar resumen
        let summary = "📋 *Resumen de tu página web:*\n\n";
        if (state.websiteType) summary += `• Tipo: ${state.websiteType}\n`;
        if (state.projectDescription) summary += `• Proyecto: ${state.projectDescription}\n`;
        if (state.mainObjective) summary += `• Objetivo: ${state.mainObjective}\n`;
        if (state.targetAudience) summary += `• Audiencia: ${state.targetAudience}\n`;
        if (state.features) summary += `• Funcionalidades: ${state.features}\n`;
        if (state.style) summary += `• Estilo: ${state.style}\n`;
        if (state.sections) summary += `• Secciones: ${state.sections}\n`;
        if (state.callToAction) summary += `• Call to Action: ${state.callToAction}\n`;
        
        await ctxFn.flowDynamic(summary);
        
        await ctxFn.flowDynamic("🔄 *Iniciando generación de tu página web...*\n\n⏱️ Este proceso puede tomar 1-3 minutos\n💡 Te mantendré informado del progreso");
        
        // Configurar feedback progresivo
        let lastProgressTime = Date.now();
        const progressCallback = async (message: string) => {
            const now = Date.now();
            // Enviar updates cada 10 segundos o en cambios importantes
            if (now - lastProgressTime > 10000 || message.includes('🎉') || message.includes('⚠️')) {
                await ctxFn.flowDynamic(`${message}`);
                lastProgressTime = now;
            }
        };
        
        // Generar página con V0 con callback de progreso
        const result = await aiServices.generateWithV0(state, progressCallback);
        
        if (!result.success) {
            throw new Error(result.error || "Error desconocido al generar página");
        }
        
        // Guardar página creada en la base de datos
        const contactId = state.userPhone;
        if (contactId) {
            const userResult = await usersDatabase.getUserByContactId(contactId);
            if (userResult.success && userResult.user) {
                const pageData = {
                    user_id: userResult.user.id!,
                    title: state.websiteType || 'Página Web',
                    description: state.projectDescription || '',
                    content: JSON.stringify({
                        websiteType: state.websiteType,
                        projectDescription: state.projectDescription,
                        mainObjective: state.mainObjective,
                        targetAudience: state.targetAudience,
                        features: state.features,
                        style: state.style,
                        sections: state.sections,
                        callToAction: state.callToAction
                    }),
                    public_link: result.demoUrl || '',
                    status: 'Active' as const,
                    requirements: `Objetivo: ${state.mainObjective}, Audiencia: ${state.targetAudience}, Funcionalidades: ${state.features}`
                };
                
                const saveResult = await usersDatabase.createPage(pageData);
                if (!saveResult.success) {
                    console.error("⚠️ Error guardando página en BD:", saveResult.error);
                    // Continuar aunque falle guardar en BD
                }
            }
        }
        
        // Respuesta exitosa
        let responseMessage = "🎉 *¡Tu página web ha sido generada exitosamente!*\n\n";
        
        if (result.demoUrl) {
            responseMessage += `🔗 *🌐 LINK DE TU PÁGINA WEB:*\n${result.demoUrl}\n\n`;
        }
        
        if (result.chatId) {
            responseMessage += `💬 *ID del Proyecto:* ${result.chatId}\n\n`;
        }
        
        responseMessage += "✨ *Tu página incluye:*\n";
        responseMessage += `• ${state.websiteType || 'Página web'} profesional\n`;
        responseMessage += `• Diseño responsive (móvil, tablet, desktop)\n`;
        responseMessage += `• Funcionalidades: ${state.features}\n`;
        responseMessage += `• Secciones: ${state.sections}\n`;
        responseMessage += `• Optimizado para: ${state.targetAudience}\n`;
        responseMessage += `• Tecnologías: React + Next.js + Tailwind CSS\n\n`;
        
        if (result.files && result.files.length > 0) {
            responseMessage += `📁 *Archivos generados:* ${result.files.length} archivos\n\n`;
        }
        
        responseMessage += "🛠️ *¿Necesitas modificaciones?*\nPuedes pedirme cambios específicos o crear otra página diferente.\n\n";
        responseMessage += "🚀 *¡Tu página está lista para compartir!*\n\n";
        responseMessage += "💡 *Siguiente paso:* Puedes personalizar el contenido, colores y funcionalidades directamente en V0.";
        
        return ctxFn.endFlow(responseMessage);
        
    } catch (error: any) {
        console.error("❌ Error generando página web:", error);
        
        let errorMessage = "😔 No pude completar la generación de tu página web.\n\n";
        
        // Mensajes de error más específicos y útiles
        if (error.message?.includes('conexión') || error.message?.includes('socket hang up')) {
            errorMessage += "🌐 **Problema de conexión**\n";
            errorMessage += "V0 está experimentando problemas temporales.\n\n";
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Espera 5-10 minutos e intenta nuevamente\n";
            errorMessage += "• Escribe 'crear página web' para reintentar\n";
            errorMessage += "• Si persiste, contacta soporte\n\n";
        } else if (error.message?.includes('Rate limit') || error.message?.includes('muy ocupado')) {
            errorMessage += "🚦 **V0 está saturado**\n";
            errorMessage += "Hay muchas solicitudes simultáneas.\n\n";
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Espera 10-15 minutos e intenta nuevamente\n";
            errorMessage += "• Tu solicitud está guardada, no necesitas empezar de nuevo\n\n";
        } else if (error.message?.includes('24 hours') || error.message?.includes('META ALERT')) {
            errorMessage += "⏰ **Ventana de conversación cerrada**\n";
            errorMessage += "Han pasado más de 24 horas desde tu último mensaje.\n\n";
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Envía cualquier mensaje para reabrir la conversación\n";
            errorMessage += "• Luego escribe 'crear página web' para continuar\n";
            errorMessage += "• Tu progreso está guardado\n\n";
        } else if (error.message?.includes('timeout') || error.message?.includes('demasiado tiempo')) {
            errorMessage += "⏱️ **Proceso muy largo**\n";
            errorMessage += "Tu descripción requiere mucho procesamiento.\n\n";
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Simplifica tu descripción\n";
            errorMessage += "• Divide tu proyecto en páginas más pequeñas\n";
            errorMessage += "• Intenta nuevamente con menos secciones\n\n";
        } else if (error.message?.includes('intentos')) {
            errorMessage += "🔄 **Múltiples intentos fallidos**\n";
            errorMessage += "El sistema intentó varias veces sin éxito.\n\n";
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Espera 15-20 minutos antes de reintentar\n";
            errorMessage += "• Contacta soporte si es urgente\n";
            errorMessage += "• Prueba con una descripción diferente\n\n";
        } else {
            errorMessage += `⚠️ **Error técnico:** ${error.message}\n\n`;
            errorMessage += "✅ **¿Qué puedes hacer?**\n";
            errorMessage += "• Intenta nuevamente en unos minutos\n";
            errorMessage += "• Contacta soporte si persiste\n\n";
        }
        
        errorMessage += "🆘 **Soporte:** Si necesitas ayuda inmediata, contacta +57 300 123 4567\n";
        errorMessage += "💡 **Tip:** Descripciones específicas pero concisas funcionan mejor";
        
        return ctxFn.endFlow(errorMessage);
    }
}