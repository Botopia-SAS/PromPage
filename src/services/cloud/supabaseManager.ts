import supabaseClient from './supabaseClient'
import dotenv from 'dotenv'

dotenv.config()

class SupabaseManager {
    
    async userExists(number: string): Promise<boolean> {
        try {
            const { data, error } = await supabaseClient.getClient()
                .from('contacts')
                .select('id')
                .eq('phone', number)
                .limit(1)

            if (error) {
                console.error("Error verificando usuario:", error)
                return false
            }

            return data && data.length > 0
        } catch (error) {
            console.error("Error verificando usuario:", error)
            return false
        }
    }

    async createUser(
        number: string, 
        name: string, 
        nickname: string, 
        country: string, 
        city: string, 
        address: string, 
        occupation: string, 
        gender: string, 
        civilStatus: string, 
        email: string
    ): Promise<void> {
        try {
            // Crear contacto
            const { data: contact, error: contactError } = await supabaseClient.getClient()
                .from('contacts')
                .insert([{
                    phone: number,
                    name: name,
                    funnel_stage: 'registered',
                    priority: 'normal',
                    is_ai_enabled: true,
                    user_id: 1 // Default user_id
                }])
                .select()
                .single()

            if (contactError) {
                throw contactError
            }

            // Crear usuario completo
            const { error: userError } = await supabaseClient.getClient()
                .from('users')
                .insert([{
                    contact_id: contact.id,
                    identification_type: 'CC', // Default
                    document_number: number, // Temporal
                    first_name: name.split(' ')[0] || name,
                    second_name: name.split(' ')[1] || null,
                    first_last_name: name.split(' ')[2] || '',
                    second_last_name: name.split(' ')[3] || null,
                    birth_date: '1990-01-01', // Default
                    phone: number,
                    email: email,
                    referral_source: country,
                    gender: gender,
                    entity: occupation
                }])

            if (userError) {
                throw userError
            }

            console.log("Usuario creado exitosamente en Supabase.")
        } catch (error) {
            console.error("Error al crear usuario:", error)
            throw error
        }
    }

    async addConverToUser(number: string, conversation: { role: string; content: string }[], userName?: string): Promise<void> {
        try {
            const question = conversation.find(c => c.role === "user")?.content
            const answer = conversation.find(c => c.role === "assistant")?.content

            if (!question || !answer) {
                throw new Error("La conversación debe contener tanto una pregunta como una respuesta.")
            }

            // Obtener contacto por número de teléfono
            const { data: contacts, error: contactError } = await supabaseClient.getClient()
                .from('contacts')
                .select('id, line_id')
                .eq('phone', number)
                .limit(1)

            let contact: { id: any; line_id: any };

            if (contactError || !contacts || contacts.length === 0) {
                // Contacto no existe, crearlo automáticamente con datos básicos
                console.log(`📋 Creando contacto automático para número: ${number}`);
                
                const { data: newContact, error: createError } = await supabaseClient.getClient()
                    .from('contacts')
                    .insert([{
                        phone: number,
                        name: userName || `Usuario ${number.slice(-4)}`, // Usar nombre de WhatsApp o generar uno
                        funnel_stage: 'new_contact',
                        priority: 'normal',
                        is_ai_enabled: true,
                        user_id: 1 // Default user_id
                    }])
                    .select('id, line_id')
                    .single()

                if (createError) {
                    console.error("❌ Error creando contacto automático:", createError);
                    throw new Error(`Error creando contacto automático: ${createError.message}`);
                }

                contact = newContact;
                console.log("✅ Contacto automático creado:", contact);
            } else {
                contact = contacts[0];
            }

            // Guardar conversación
            const { error: conversationError } = await supabaseClient.getClient()
                .from('conversations')
                .insert([
                    {
                        contact_id: contact.id,
                        line_id: contact.line_id,
                        sender: 'user',
                        message: question,
                        user_id: 1 // Default user_id
                    },
                    {
                        contact_id: contact.id,
                        line_id: contact.line_id,
                        sender: 'assistant',
                        message: answer,
                        user_id: 1 // Default user_id
                    }
                ])

            if (conversationError) {
                throw conversationError
            }

            console.log("Conversación guardada en Supabase.")
        } catch (error) {
            console.error("Error al guardar la conversación:", error)
            throw error
        }
    }

    async getUserConv(number: string): Promise<any[]> {
        try {
            // Obtener contacto
            const { data: contacts, error: contactError } = await supabaseClient.getClient()
                .from('contacts')
                .select('id')
                .eq('phone', number)
                .limit(1)

            if (contactError || !contacts || contacts.length === 0) {
                return []
            }

            const contactId = contacts[0].id

            // Obtener conversaciones
            const { data: conversations, error: conversationError } = await supabaseClient.getClient()
                .from('conversations')
                .select('sender, message, timestamp')
                .eq('contact_id', contactId)
                .order('timestamp', { ascending: false })
                .limit(6) // 3 conversaciones (user + assistant)

            if (conversationError) {
                console.error("Error al obtener conversaciones:", conversationError)
                return []
            }

            if (!conversations) {
                return []
            }

            // Convertir a formato esperado
            return conversations.map(conv => ({
                role: conv.sender === 'user' ? 'user' : 'assistant',
                content: conv.message
            }))
        } catch (error) {
            console.error("Error al obtener la conversación:", error)
            return []
        }
    }
}

export default new SupabaseManager()