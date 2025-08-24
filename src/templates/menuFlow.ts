import { addKeyword, EVENTS } from "@builderbot/bot";

const menuFlow = addKeyword(EVENTS.ACTION)
    .addAnswer(
        "🌟 ¡Excelente! Estos son nuestros servicios principales:\n\n¿Qué te interesa más?",
        {
            capture: true,
            buttons: [
                { body: "Ver portafolio 🎨" },
                { body: "Solicitar cotización 💰" },
                { body: "Proceso de trabajo 🛠️" },
            ]
        },
        async (ctx, ctxFn) => {
          if (ctx.body.trim() === "Ver portafolio 🎨") {
            await ctxFn.flowDynamic("🎆 ¡Te mostraré algunos de nuestros trabajos más destacados!\n\n✨ Hemos creado:\n• Tiendas online con carritos de compra\n• Páginas corporativas profesionales\n• Portafolios creativos\n• Blogs y sitios de noticias\n• Landing pages de alta conversión\n\n¿Qué tipo de página te interesa ver?");
        }
         else if (ctx.body.trim() === "Solicitar cotización 💰") {
                await ctxFn.flowDynamic("💰 ¡Perfecto! Prepararé una cotización personalizada para ti.\n\nNuestros paquetes incluyen:\n• Diseño responsive\n• Optimización SEO\n• Certificado SSL\n• Integración con redes sociales\n• Panel de administración\n\nPara darte el mejor precio, ¿podrías contarme qué tipo de página necesitas?");
            } else if (ctx.body.trim() === "Proceso de trabajo 🛠️") {
                await ctxFn.flowDynamic("🛠️ Nuestro proceso es simple y transparente:\n\n1️⃣ **Consulta inicial** - Entendemos tu visión\n2️⃣ **Propuesta y diseño** - Creamos mockups personalizados\n3️⃣ **Desarrollo** - Construimos tu sitio\n4️⃣ **Revisión** - Ajustamos según tu feedback\n5️⃣ **Lanzamiento** - ¡Tu sitio en línea!\n6️⃣ **Soporte** - Te acompañamos después del lanzamiento\n\n¿Te gustaría comenzar con tu proyecto?");
            } else {
                return ctxFn.fallBack("Por favor, selecciona una opción válida. 😊");
            }
        }
    )
    .addAction(async (ctx, { provider }) => {
        const list = {
            "header": {
                "type": "text",
                "text": "Servicios de Diseño Web"
            },
            "body": {
                "text": "Selecciona el servicio que más te interese 🌐"
            },
            "footer": {
                "text": ""
            },
            "action": {
                "button": "Opciones",
                "sections": [
                    {
                        "title": "Servicios Disponibles",
                        "rows": [
                            {
                                "id": "WEB001",
                                "title": "Página Corporativa",
                                "description": "🏢 Sitio web profesional para empresas"
                            },
                            {
                                "id": "WEB002",
                                "title": "Tienda Online",
                                "description": "🛍️ E-commerce con carrito de compras"
                            },
                            {
                                "id": "WEB003",
                                "title": "Landing Page",
                                "description": "🚀 Página de conversión de alta efectividad"
                            }
                        ]
                    }
                ]
            }
        };

        // Enviar el mensaje de tipo lista al usuario
        await provider.sendList(`${ctx.from}@s.whatsapp.net`, list);
    });

export { menuFlow };
