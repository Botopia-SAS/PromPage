import OpenAI from 'openai';
import { config } from '../../config';
import { processImage } from "../../services/AI/ocrService";
import fs from "fs";
import fetch from "node-fetch";
import path, { dirname } from "path";
import { exec } from "child_process";
import util from "util";
import { fileURLToPath } from "url";

// Definir __dirname en ES Module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class aiServices {
    private openAI: OpenAI;
    private processingQueue: Map<string, boolean> = new Map();
    private maxConcurrentRequests = 3; // Máximo 3 generaciones simultáneas

    constructor() {
        this.openAI = new OpenAI({
            apiKey: config.ApiKey,
        });
    }

    async chat(
        prompt: string,
        messages: { role: string; content: string }[]
      ): Promise<string> {
        // Configurar mensaje para asesoría de diseño web
        const systemPrompt = `Eres una asesora experta en diseño y desarrollo web. Tu personalidad es:
        - Muy amigable y profesional
        - Paciente y comprensiva con clientes que no conocen términos técnicos
        - Entusiasta sobre los proyectos web
        - Siempre das sugerencias útiles y constructivas
        - Usas lenguaje simple y evitas tecnicismos innecesarios
        - Incluyes emojis ocasionalmente para ser más cercana
        - Respondes de forma concisa pero completa
        - Nunca pongas más dos asteriscos (*) juntos o seguidos
        
        Contexto del negocio:
        - Ofrecemos diseño web personalizado
        - Incluimos SEO básico en todos los proyectos
        - Ofrecemos mantenimiento mensual opcional
        - Aceptamos pagos en efectivo, transferencia y tarjeta
        
        Responde la siguiente pregunta del cliente de manera útil y amigable:`;
        
        // Construir mensajes para OpenAI
        const conversationMessages = [
            { role: "system" as const, content: systemPrompt },
            ...messages.map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content })),
            { role: "user" as const, content: prompt }
        ];
      
        try {
          const response = await this.openAI.chat.completions.create({
            model: config.Model || 'gpt-4o-mini',
            messages: conversationMessages,
            max_tokens: 400,
            temperature: 0.7,
          });
          
          return response.choices[0]?.message?.content?.trim() || "-ERROR-";
        } catch (err: any) {
          console.error("❌ Error OpenAI:", err);
          return "-ERROR-";
        }
      }

    async detectIntent(text: string): Promise<string> {
        try {
            console.log("🔍 Enviando texto a IA para analizar intención...");

            const prompt = `Eres un clasificador de intenciones para un asistente de creación de sitios web (similar a V0 pero en WhatsApp).
                            Devuelve SOLO una (1) etiqueta EXACTA de la siguiente lista (sin comillas, sin texto adicional):
                            - FAQ
                            - CREATE_WEB_PAGE
                            - STARTSUBSCRIPTION
                            - CHANCE_SUBSCRIPTION
                            - CANCEL_SUBSCRIPTION
                            - NO_DETECTED

                            Criterios:
                            FAQ: El usuario saluda o hace una pregunta general o técnica (hosting, dominio, SEO, cómo funciona, precios en abstracto, diferencias de tecnologías, soporte, dudas sobre el servicio, preguntas abiertas o saludos normales).
                            CREATE_WEB_PAGE: El usuario expresa que quiere crear / hacer / desarrollar / levantar / construir / lanzar / montar una página, sitio, landing, web, ecommerce, tienda online, portafolio, blog o empezar un proyecto web. También si pide que le empieces a crear algo concreto para su web.
                            STARTSUBSCRIPTION: El usuario quiere iniciar, activar, contratar, suscribirse, pagar plan, comenzar membresía, adquirir suscripción. IMPORTANTE: Si dice exactamente "suscribirse" es SIEMPRE STARTSUBSCRIPTION.
                            CHANCE_SUBSCRIPTION: (Cambio de plan) El usuario quiere cambiar, mejorar, bajar, migrar, modificar su plan o tipo de suscripción.
                            CANCEL_SUBSCRIPTION: El usuario quiere cancelar, dar de baja, terminar, finalizar, suspender su suscripción/plan.
                            NO_DETECTED: No encaja claramente en ninguna de las anteriores (mensajes vacíos, ruido, irrelevante).

                            Reglas:
                            - Si menciona crear o tener una web Y también pregunta algo técnico, prioriza CREATE_WEB_PAGE.
                            - Si menciona cancelar y también cambiar, prioriza CANCEL_SUBSCRIPTION.
                            - No inventes etiquetas.
                            - Si el usuario saluda sienmpre es FAQ.

                            Texto a clasificar: "${text}"`;

            const response = await this.openAI.chat.completions.create({
                model: config.Model || 'gpt-4o-mini',
                messages: [{ role: "user", content: prompt }],
                max_tokens: 100,
                temperature: 0.1,
            });

            console.log("✅ Respuesta de IA recibida.");
            console.log("Respuesta completa de IA:", JSON.stringify(response, null, 2));
            
            let intentText = response.choices[0]?.message?.content?.trim() || "NO_DETECTED";
            
            // Sanitizar: dejar solo etiqueta válida
            const valid = ["FAQ","CREATE_WEB_PAGE","STARTSUBSCRIPTION","CHANCE_SUBSCRIPTION","CANCEL_SUBSCRIPTION","NO_DETECTED"];
            if (!valid.includes(intentText)) intentText = "NO_DETECTED";
            return intentText;
        } catch (error) {
            console.error("❌ Error detectando intención:", error);
            return "NO_DETECTED";
        }
    }

    async extractTextFromImage(imageUrl: string): Promise<string> {
        try {

            // Configurar headers con el token de WhatsApp (si es necesario)
            const headers = {
                "Authorization": `Bearer ${process.env.jwtToken}`,
                "Accept": "image/jpeg, image/png, image/webp"
            };

            console.log("🔄 Realizando solicitud HTTP para descargar la imagen...");
            const response = await fetch(imageUrl, { headers });

            console.log("🔍 Código de estado HTTP:", response.status);
            if (!response.ok) {
                console.error("❌ Error al descargar la imagen:", response.statusText);
                return "";
            }

            console.log("✅ Imagen descargada correctamente.");
            const imageBuffer = Buffer.from(await response.arrayBuffer());

            // Guarda la imagen temporalmente en disco antes de procesarla
            const tempDir = path.resolve(__dirname, "../../temp");
            await fs.promises.mkdir(tempDir, { recursive: true });

            const imagePath = path.join(tempDir, `temp_image_${Date.now()}.jpg`);
            console.log("💾 Guardando imagen en:", imagePath);
            await fs.promises.writeFile(imagePath, imageBuffer);

            console.log("🔍 Verificando si el archivo fue guardado correctamente...");
            if (!fs.existsSync(imagePath)) {
                console.error("❌ Error: La imagen no fue guardada correctamente en el sistema de archivos.");
                return "";
            }

            console.log("✅ Imagen guardada con éxito. Procediendo con el OCR...");

            // Procesa la imagen con OCR
            const extractedText = await processImage(imagePath);

            console.log("✅ OCR completado. Texto extraído:", extractedText);

            // Elimina el archivo temporal después de procesarlo
            await fs.promises.unlink(imagePath);
            console.log("🗑️ Imagen temporal eliminada.");

            return extractedText || "";
        } catch (error) {
            console.error("❌ Error en OCR:", error);
            return "";
        }
    }

    async processAudio(audioUrl: string): Promise<string> {
        try {
            console.log(`🔽 Descargando audio desde: ${audioUrl}`);
            const execPromise = util.promisify(exec);


            const response = await fetch(audioUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${process.env.jwtToken}`, // Token de WhatsApp
                    "Accept": "audio/ogg"
                }
            });

            if (!response.ok) throw new Error(`Error al descargar el audio. Código: ${response.status}`);

            const audioBuffer = Buffer.from(await response.arrayBuffer());
            // Simular __dirname en ES Module
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = dirname(__filename);

            const tempDir = path.resolve(__dirname, "../../temp");

            await fs.promises.mkdir(tempDir, { recursive: true });

            const inputAudioPath = path.join(tempDir, "temp_audio.ogg");
            const outputAudioPath = path.join(tempDir, "temp_audio.wav");

            await fs.promises.writeFile(inputAudioPath, audioBuffer);
            console.log("✅ Audio descargado correctamente.");

            console.log("🎙️ Convirtiendo audio a WAV...");
            await execPromise(`ffmpeg -y -i "${inputAudioPath}" -ar 16000 -ac 1 -c:a pcm_s16le "${outputAudioPath}"`);

            console.log("✅ Conversión completada.");


            console.log("⏳ Enviando audio a OpenAI Whisper...");
            const transcriptionResponse = await this.openAI.audio.transcriptions.create({
                file: fs.createReadStream(outputAudioPath),
                model: "whisper-1",
                language: "es",
            });

            const transcription = transcriptionResponse.text;

            console.log("✅ Transcripción completada:", transcription);

            // Eliminar archivos temporales
            await fs.promises.unlink(inputAudioPath);
            await fs.promises.unlink(outputAudioPath);

            return transcription || "";
        } catch (error) {
            console.error("❌ Error en la transcripción de audio:", error);
            return "";
        }
    }

    // Método heredado para compatibilidad - ya no se usa para diseño web
    async extractTransactionData(_text: string): Promise<any> {
        console.log("⚠️ extractTransactionData llamado pero no se usa en el bot de diseño web");
        return null;
    }

    // Analizar mensaje inicial del usuario para extraer información de la página web
    async analyzeWebPageRequest(userMessage: string): Promise<any> {
        try {
            const systemPrompt = `Eres un analizador experto de solicitudes de páginas web.
            
            Tu tarea es extraer toda la información relevante del mensaje del usuario sobre la página web que quiere crear.
            
            Debes devolver un JSON con los siguientes campos (null si no se menciona):
            {
                "websiteType": "tipo de página (landing, portfolio, e-commerce, blog, corporativo, etc.)",
                "projectDescription": "descripción del proyecto o negocio",
                "mainObjective": "objetivo principal de la página",
                "targetAudience": "público objetivo",
                "features": "funcionalidades mencionadas",
                "style": "estilo visual o preferencias de diseño",
                "colors": "colores mencionados",
                "content": "contenido disponible mencionado",
                "references": "referencias o ejemplos mencionados",
                "sections": "secciones específicas mencionadas",
                "callToAction": "acción principal que quiere lograr",
                "additionalInfo": "cualquier otra información relevante"
            }
            
            IMPORTANTE: Solo extrae lo que el usuario menciona explícitamente. No inventes información.`;

            const response = await this.openAI.chat.completions.create({
                model: config.Model || 'gpt-4o-mini',
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: `Analiza este mensaje y extrae la información sobre la página web solicitada:\n\n"${userMessage}"` }
                ],
                max_tokens: 500,
                temperature: 0.3,
                response_format: { type: "json_object" }
            });

            const extracted = JSON.parse(response.choices[0]?.message?.content || '{}');
            console.log("🤖 Información extraída del mensaje:", extracted);
            return extracted;
        } catch (error) {
            console.error("❌ Error analizando mensaje:", error);
            return {};
        }
    }

    // Obtener estado de generación de V0
    async getV0ChatStatus(chatId: string): Promise<{ success: boolean; status?: string; demoUrl?: string; error?: string }> {
        try {
            const response = await fetch(`https://api.v0.dev/v1/chats/${chatId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${process.env.V0_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            });

            if (!response.ok) {
                throw new Error(`Error obteniendo estado: ${response.status}`);
            }

            const result = await response.json() as any;
            
            return {
                success: true,
                status: result.status,
                demoUrl: result.demo || result.preview_url,
            };
        } catch (error: any) {
            console.error("❌ Error obteniendo estado de V0:", error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Generar prompt optimizado para V0 usando ChatGPT
    async generateOptimizedV0Prompt(userInfo: any): Promise<string> {
        try {
            const systemPrompt = `Eres un experto en crear prompts para V0 (generador de páginas web con IA de Vercel).
            
            Tu tarea es convertir la información del usuario en un prompt optimizado que genere una página web moderna, profesional y completamente funcional.
            
            ESTRUCTURA DEL PROMPT:
            1. Descripción general del proyecto y objetivo
            2. Tecnologías específicas a usar (React, Next.js 14, Tailwind CSS, shadcn/ui)
            3. Estructura de secciones y layout
            4. Funcionalidades específicas
            5. Estilo visual y branding
            6. Optimizaciones (SEO, performance, responsive)
            
            REGLAS IMPORTANTES:
            - Usa Next.js 14 con App Router
            - Incluye componentes de shadcn/ui
            - Usa Lucide React para iconos
            - Implementa modo oscuro con next-themes
            - Asegura diseño responsive con Tailwind
            - Incluye animaciones con Framer Motion
            - Optimiza para Core Web Vitals
            - Implementa SEO con meta tags apropiados
            - Si no puede colocar imágenes que use íconos de Lucide React
            - Si no tiene contenido, genera texto de ejemplo relevante
            - No dejar contenido vacío
            
            Genera un prompt de 400-600 palabras que sea extremadamente detallado y técnico.`;

            const userPrompt = `Información completa del proyecto:
            
            INFORMACIÓN BÁSICA:
            - Tipo de página: ${userInfo.websiteType || 'Sitio web moderno'}
            - Descripción del proyecto: ${userInfo.projectDescription || 'Proyecto web profesional'}
            - Objetivo principal: ${userInfo.mainObjective || 'Presentar servicios/productos de manera efectiva'}
            
            AUDIENCIA Y PROPÓSITO:
            - Público objetivo: ${userInfo.targetAudience || 'Audiencia general'}
            - Call to Action principal: ${userInfo.callToAction || 'Contacto/Conversión'}
            
            DISEÑO Y ESTILO:
            - Estilo visual: ${userInfo.style || 'Moderno y minimalista'}
            - Colores: ${userInfo.colors || 'Esquema de colores profesional'}
            - Branding: ${userInfo.brandingDetails || userInfo.hasBranding || 'Sin branding específico, crear uno moderno'}
            
            ESTRUCTURA Y CONTENIDO:
            - Secciones: ${userInfo.sections || 'Hero, Servicios, Sobre nosotros, Testimonios, Contacto'}
            - Contenido disponible: ${userInfo.contentDetails || 'Generar contenido de ejemplo relevante'}
            
            FUNCIONALIDADES:
            - Features requeridas: ${userInfo.features || 'Formulario de contacto, galería, responsive'}
            
            REFERENCIAS Y ADICIONAL:
            - Referencias de diseño: ${userInfo.referenceDetails || 'Sitios web modernos y profesionales'}
            - Información adicional: ${userInfo.additionalInfo || 'N/A'}
            
            Crea un prompt técnico y detallado para V0 que genere exactamente lo que el usuario necesita.`;

            const response = await this.openAI.chat.completions.create({
                model: config.Model || 'gpt-4o-mini',
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                max_tokens: 800,
                temperature: 0.7,
            });

            const generatedPrompt = response.choices[0]?.message?.content?.trim();
            
            console.log("📝 Prompt generado para V0:", generatedPrompt);
            
            return generatedPrompt || `Create a modern ${userInfo.websiteType} website using React, Next.js 14, and Tailwind CSS with responsive design and professional styling.`;
        } catch (error) {
            console.error("❌ Error generando prompt optimizado:", error);
            return `Create a modern ${userInfo.websiteType || 'website'} using Next.js 14, React, Tailwind CSS, and shadcn/ui components. Include responsive design, dark mode, and modern animations.`;
        }
    }

    // Generar página web con V0 Platform API con reintentos y manejo robusto
    async generateWithV0(userInfo: any, onProgress?: (message: string) => void): Promise<{ success: boolean; demoUrl?: string; chatId?: string; files?: any[]; error?: string }> {
        const userId = userInfo.userPhone || 'anonymous';
        
        // Sistema de cola para evitar saturar la API
        const currentProcessing = Array.from(this.processingQueue.values()).filter(Boolean).length;
        
        if (currentProcessing >= this.maxConcurrentRequests) {
            onProgress?.(`🚦 Cola de generación: ${currentProcessing} usuarios procesando. Esperando turno...`);
            
            // Esperar hasta que haya espacio en la cola
            let waitTime = 0;
            while (Array.from(this.processingQueue.values()).filter(Boolean).length >= this.maxConcurrentRequests) {
                await new Promise(resolve => setTimeout(resolve, 5000)); // Esperar 5 segundos
                waitTime += 5;
                
                if (waitTime % 15 === 0) { // Cada 15 segundos dar feedback
                    const currentQueue = Array.from(this.processingQueue.values()).filter(Boolean).length;
                    onProgress?.(`⏳ Esperando turno... ${currentQueue} usuarios adelante (${waitTime}s esperando)`);
                }
                
                // Timeout de cola después de 5 minutos
                if (waitTime >= 300) {
                    return {
                        success: false,
                        error: "La cola está muy saturada. Por favor, intenta nuevamente en 10-15 minutos."
                    };
                }
            }
        }
        
        // Marcar como procesando
        this.processingQueue.set(userId, true);
        onProgress?.("🟢 Iniciando tu generación...");
        
        try {
            const maxRetries = 3;
            let currentRetry = 0;

        // Función para hacer una pausa
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Función para calcular el tiempo de espera (backoff exponencial)
        const getBackoffDelay = (retry: number) => Math.min(1000 * Math.pow(2, retry), 30000);

        while (currentRetry <= maxRetries) {
            try {
                if (currentRetry > 0) {
                    onProgress?.(`🔄 Reintentando... (${currentRetry}/${maxRetries})`);
                    await delay(getBackoffDelay(currentRetry - 1));
                }

                onProgress?.("🤖 Optimizando prompt con ChatGPT...");
                console.log("🚀 Generando prompt optimizado para V0...");
                const optimizedPrompt = await this.generateOptimizedV0Prompt(userInfo);
                
                onProgress?.("🚀 Enviando solicitud a V0 Platform...");
                console.log("🚀 Enviando solicitud a V0 Platform API...");
                console.log("📝 Prompt optimizado:", optimizedPrompt);
                
                // Crear AbortController para timeout personalizado (aumentado a 10 minutos)
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutos timeout

                // Configurar feedback progresivo durante la espera
                const startTime = Date.now();
                let progressCount = 0;
                const progressInterval = setInterval(() => {
                    progressCount++;
                    const timeElapsed = Math.floor((Date.now() - startTime) / 1000);
                    
                    if (progressCount === 1) {
                        onProgress?.("⏳ V0 está analizando tu solicitud...");
                    } else if (progressCount === 2) {
                        onProgress?.("🔧 Generando componentes de tu página...");
                    } else if (progressCount === 3) {
                        onProgress?.("🎨 Aplicando estilos y diseño...");
                    } else {
                        onProgress?.(`⚡ V0 sigue trabajando en tu página... (${timeElapsed}s transcurridos)`);
                    }
                }, 45000); // Cada 45 segundos
                
                try {
                    // Usando V0 Platform API para crear chat y generar aplicación
                    const response = await fetch('https://api.v0.dev/v1/chats', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${process.env.V0_API_KEY}`,
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            message: optimizedPrompt,
                            model: 'v0-1.5-md' // Modelo recomendado para generación de UI
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error("❌ Error response de V0:", response.status, errorText);
                        
                        // Si es un error 429 (rate limit), esperar más tiempo
                        if (response.status === 429) {
                            throw new Error(`Rate limit alcanzado. Reintentando en ${getBackoffDelay(currentRetry) / 1000}s...`);
                        }
                        
                        throw new Error(`V0 API Error: ${response.status} - ${errorText}`);
                    }

                    onProgress?.("⚡ Procesando respuesta de V0...");
                    const result = await response.json() as any;
                    console.log("✅ Respuesta de V0 recibida:", JSON.stringify(result, null, 2));
                    
                    // Extraer información de la respuesta
                    const demoUrl = result.demo || result.preview_url || result.url;
                    const chatId = result.id;
                    const files = result.files || [];
                    
                    if (!demoUrl && !chatId) {
                        throw new Error("No se recibió URL de demo ni ID de chat de V0");
                    }
                    
                    onProgress?.("🎉 ¡Página generada exitosamente!");
                    return {
                        success: true,
                        demoUrl,
                        chatId,
                        files,
                    };

                } catch (fetchError: any) {
                    clearTimeout(timeoutId);
                    clearInterval(progressInterval);
                    throw fetchError;
                } finally {
                    clearInterval(progressInterval);
                }

            } catch (error: any) {
                console.error(`❌ Error generando con V0 (intento ${currentRetry + 1}):`, error);
                currentRetry++;

                // Errores que no ameritan reintento
                const noRetryErrors = [
                    'Invalid API key',
                    'Unauthorized',
                    'Forbidden',
                    'Bad Request'
                ];
                
                // AbortError sí amerita reintento (puede ser problema temporal de V0)
                const isAbortError = error.type === 'aborted' || error.message?.includes('aborted');

                const shouldRetry = currentRetry <= maxRetries && 
                                 !noRetryErrors.some(noRetry => error.message?.includes(noRetry));

                if (!shouldRetry) {
                    return {
                        success: false,
                        error: this.formatV0Error(error, currentRetry)
                    };
                }

                // Si hay más intentos, informar al usuario
                if (currentRetry <= maxRetries) {
                    const waitTime = Math.ceil(getBackoffDelay(currentRetry - 1) / 1000);
                    
                    if (isAbortError) {
                        onProgress?.(`⏰ V0 tardó demasiado (timeout). Reintentando en ${waitTime}s... (${currentRetry}/${maxRetries})`);
                    } else {
                        onProgress?.(`⚠️ Error temporal. Reintentando en ${waitTime}s... (${currentRetry}/${maxRetries})`);
                    }
                }
            }
        }

            return {
                success: false,
                error: "Se agotaron todos los intentos de generación"
            };
            
        } finally {
            // Limpiar de la cola cuando termine (éxito o error)
            this.processingQueue.delete(userId);
        }
    }

    private formatV0Error(error: any, attempts: number): string {
        if (error.type === 'aborted' || error.message?.includes('aborted')) {
            return `La generación de V0 tomó más de 5 minutos después de ${attempts} intentos. V0 está experimentando alta demanda. Intenta nuevamente en 10-15 minutos o simplifica tu descripción.`;
        }
        if (error.message?.includes('socket hang up')) {
            return `Error de conexión con V0 después de ${attempts} intentos. Por favor, intenta nuevamente en unos minutos.`;
        }
        if (error.message?.includes('timeout')) {
            return `La generación tomó demasiado tiempo después de ${attempts} intentos. Intenta con una descripción más simple.`;
        }
        if (error.message?.includes('Rate limit')) {
            return `V0 está muy ocupado en este momento. Por favor, intenta nuevamente en 5-10 minutos.`;
        }
        return `Error después de ${attempts} intentos: ${error.message || 'Error desconocido'}`;
    }

}

export default new aiServices();
