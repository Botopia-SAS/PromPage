import { addKeyword, EVENTS } from "@builderbot/bot";
import supabaseAuth from "../services/cloud/supabaseAuth";
import supabaseManager from "../services/cloud/supabaseManager";
import supabaseClient from "../services/cloud/supabaseClient";
import usersDatabase from "../services/cloud/usersDatabase";

const registerFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        "Para crear tu página web, necesito que te registres, será muy rápido",
        {
            capture: true,
            buttons: [
                { body: "¡Sí, empecemos!" },
                { body: "Quiero saber más" }
            ]
        },
        async (ctx, ctxFn) => {
            if (ctx.body === "Quiero saber más") {
                await ctxFn.flowDynamic("¡Por supuesto! 😊 Te ayudaré a crear una página web profesional y atractiva. Solo necesito conocer algunos detalles sobre tu proyecto para ofrecerte la mejor solución.");
                await ctxFn.flowDynamic("Podemos crear desde páginas informativas, tiendas online, portafolios, hasta sitios corporativos. ¿Listo para comenzar?");
                return;
            }
            await ctxFn.flowDynamic("¡Excelente decisión! 🎉 Vamos a crear algo increíble juntos. Te haré algunas preguntas para entender mejor tu visión.");
        }
    )
    .addAnswer(
        "1️⃣ *¿Cuál es tu nombre?* 😊",
        { capture: true },
        async (ctx, ctxFn) => {
            const name = ctx.body.trim();
            await ctxFn.state.update({ name });
        }
    )
    .addAnswer(
        "9️⃣ *¿Cuál es tu correo electrónico?* 📧\n\n_Te enviaré propuestas y avances del proyecto_",
        { capture: true },
        async (ctx, ctxFn) => {
            const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
            if (!emailRegex.test(ctx.body)) {
                return ctxFn.fallBack("Por favor, ingresa un correo electrónico válido. 💡");
            }

            await ctxFn.state.update({ email: ctx.body });
            
            // Procesar registro completo
            return await processUserRegistration(ctx, ctxFn);
        }
    );  

async function processUserRegistration(ctx: any, ctxFn: any) {
    try {
        const state = ctxFn.state.getMyState();
        const { name, email } = state;
        const userPhone = ctx.from;
        
        await ctxFn.flowDynamic("🔄 *Procesando tu registro...* Un momento por favor.");

        // 1. Crear contacto en la base de datos original
        console.log("📋 Creando contacto en base de datos original...");
        await supabaseManager.createUser(
            userPhone, name, name, "Colombia", "Bogotá", 
            "No especificada", "No especificado", "No especificado", 
            "Soltero", email
        );

        // 2. Obtener contact_id de la base de datos original
        console.log("🔍 Obteniendo contact_id de la base de datos original...");
        
        // Usar el método existente para obtener el contacto
        const { data: contacts } = await supabaseClient.getClient()
            .from('contacts')
            .select('id')
            .eq('phone', userPhone)
            .limit(1);
            
        let contact_id = null;
        if (contacts && contacts.length > 0) {
            contact_id = contacts[0].id;
            console.log("✅ Contact ID obtenido:", contact_id);
        } else {
            console.log("⚠️ No se pudo obtener contact_id, continuando sin él");
        }

        // 3. Crear usuario en la nueva base de datos
        console.log("📋 Creando usuario en base de datos adicional...");
        const usersResult = await usersDatabase.createUser({
            name,
            email,
            contact_id,
            tokens: 10 // Tokens iniciales por defecto
        });

        if (!usersResult.success) {
            console.error("❌ Error creando usuario en DB adicional:", usersResult.error);
            // Continuar aunque falle la DB adicional
            await ctxFn.flowDynamic("⚠️ Registro parcialmente completado. Por favor, contacta soporte si experimentas problemas.");
        } else {
            console.log("✅ Usuario creado en DB adicional:", usersResult.user);
        }

        // 4. Respuesta exitosa
        await ctxFn.flowDynamic(`✅ *¡Registro completado exitosamente!* 🎉

¡Hola ${name}! 👋 Ya estás registrado en nuestro sistema.

📧 Email confirmado: ${email}
🎫 Tokens iniciales: 10
💼 Tu cuenta está lista para crear páginas web increíbles

*¿Qué quieres hacer ahora?*`);
        
        return ctxFn.endFlow("Puedes escribir 'crear página web' para empezar un nuevo proyecto, o 'menú' para ver todas las opciones disponibles. 🚀");

    } catch (error) {
        console.error("❌ Error procesando registro:", error);
        return ctxFn.endFlow("Hubo un error inesperado. Por favor, intenta registrarte nuevamente.");
    }
}

export { registerFlow };
