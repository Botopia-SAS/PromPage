import supabaseClient from './supabaseClient'
import dotenv from 'dotenv'

dotenv.config()

class SupabaseTransaction {

    async saveTransaction(
        monto: string,
        comercio: string,
        metodoPago: string,
        entidadMetodoPago: string,
        categoria: string,
        subcategoria: string,
        tipo: string,
        userId: string | undefined,
        userPhone: string | undefined,
        canal: string,
        ctxFn: any
    ) {
        try {
            // Recuperar datos si faltan
            if (!userId) {
                const state = ctxFn.state.getMyState()
                userId = state.userId || ctxFn.from
                console.warn("⚠️ userId estaba undefined, recuperado de estado:", userId)
            }

            if (!userPhone) {
                const state = ctxFn.state.getMyState()
                userPhone = state.userPhoneNumber || ctxFn.from
                console.warn("⚠️ userPhone estaba undefined, recuperado de estado:", userPhone)
            }

            if (!userId && !userPhone) {
                throw new Error("❌ No se pudo determinar el usuario.")
            }

            // Obtener o crear contacto
            let contactId: string | null = null

            if (userPhone) {
                const { data: contacts } = await supabaseClient.getClient()
                    .from('contacts')
                    .select('id')
                    .eq('phone', userPhone)
                    .limit(1)

                if (contacts && contacts.length > 0) {
                    contactId = contacts[0].id
                } else {
                    // Crear contacto si no existe
                    const { data: newContact } = await supabaseClient.getClient()
                        .from('contacts')
                        .insert([{
                            phone: userPhone,
                            name: 'Usuario',
                            user_id: 1
                        }])
                        .select('id')
                        .single()
                    
                    contactId = newContact?.id
                }
            }

            console.log("💾 Guardando transacción en Supabase:", {
                monto,
                comercio,
                metodoPago,
                entidadMetodoPago,
                categoria,
                subcategoria,
                userId,
                userPhone,
                canal,
                tipo
            })

            // Crear evento de transacción
            const { data: event, error: eventError } = await supabaseClient.getClient()
                .from('events')
                .insert([{
                    contact_id: contactId,
                    type: 'transaction',
                    data: {
                        monto,
                        comercio,
                        metodo_pago: metodoPago,
                        entidad_metodo_pago: entidadMetodoPago,
                        categoria,
                        subcategoria,
                        tipo,
                        canal
                    },
                    user_id: 1 // Default user_id
                }])
                .select()
                .single()

            if (eventError) {
                throw eventError
            }

            console.log("✅ Transacción guardada correctamente en Supabase:", event)
            return event
        } catch (error) {
            console.error("❌ Error guardando transacción en Supabase:", error)
            throw new Error("Hubo un problema al guardar la transacción en Supabase.")
        }
    }

    async getUserIdByPhone(phoneNumber: string): Promise<string | null> {
        try {
            const normalizedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`
            console.log(`🔍 Buscando userId por teléfono: ${normalizedPhone}`)
            
            const { data: users, error } = await supabaseClient.getClient()
                .from('users')
                .select('id, contact_id')
                .eq('phone', normalizedPhone)
                .limit(1)
            
            if (error) {
                console.error("❌ Error obteniendo userId por teléfono:", error)
                return null
            }

            if (users && users.length > 0) {
                const userId = users[0].id
                console.log("✅ UserId encontrado para el teléfono:", userId)
                return userId
            } else {
                console.warn("⚠️ No se encontró un usuario con el teléfono:", normalizedPhone)
                return null
            }
        } catch (error) {
            console.error("❌ Error obteniendo userId por teléfono:", error)
            return null
        }
    }
}

export default new SupabaseTransaction()