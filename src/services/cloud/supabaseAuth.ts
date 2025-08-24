import supabaseClient from './supabaseClient'
import dotenv from 'dotenv'

dotenv.config()

interface UserRegistrationData {
    identification_type: string
    document_number: string
    first_name: string
    second_name?: string
    first_last_name: string
    second_last_name?: string
    birth_date: string
    phone: string
    email?: string
    referral_source?: string
    gender: string
    entity?: string
}

class SupabaseAuth {
    /** Sanitiza número: sólo dígitos (sin +) */
    private sanitize(value: string): string { return value ? value.replace(/\D/g, '') : '' }

    /** 
     * Obtiene el line_id a partir del número del bot (lines.number)
     * ⚠️ IMPORTANTE: Tabla 'lines' es SOLO LECTURA - NO escribir nunca en esta tabla
     */
    async getLineIdByNumber(botNumber: string): Promise<string | null> {
        try {
            botNumber = this.sanitize(botNumber)
            console.log('🔍 Obteniendo line_id para botNumber:', botNumber)
            
            // SOLO SELECT - NO INSERT/UPDATE/DELETE en tabla 'lines'
            const { data, error } = await supabaseClient.getClient()
                .from('lines')
                .select('id')
                .eq('number', botNumber)
                .limit(1)
                .single()
            if (error) {
                console.warn('⚠️ Error obteniendo línea:', error.message)
                return null
            }
            console.log('✅ Data', data)
            return data?.id || null
        } catch (e) {
            console.error('🚨 Excepción obteniendo line_id:', e)
            return null
        }
    }
    
    async registerUser(
        email: string, 
        password: string, 
        name: string, 
        phone: string,
        country: string, 
        birthdate: string, 
        civilStatus: string,
        occupation: string, 
        gender: string, 
        address: string, 
        city: string, 
        typeId: string, 
        numberId: string, 
        nickname: string
    ) {
        try {
            phone = this.sanitize(phone)
            console.log('📌 Registrando usuario en Supabase:', { email, name, phone })

            if (phone.length > 15) {
                throw new Error(`❌ Error: Teléfono con ${phone.length} caracteres (máx 15).`)
            }

            const userData: UserRegistrationData = {
                identification_type: typeId,
                document_number: numberId,
                first_name: name.split(' ')[0] || name,
                second_name: name.split(' ')[1] || null,
                first_last_name: name.split(' ')[2] || '',
                second_last_name: name.split(' ')[3] || null,
                birth_date: birthdate,
                phone: phone,
                email: email,
                referral_source: country,
                gender: gender,
                entity: occupation
            }

            const { data: user, error: userError } = await supabaseClient.getClient()
                .from('users')
                .insert([userData])
                .select()
                .single()
            if (userError) throw new Error(`Error creando usuario: ${userError.message}`)
            console.log('✅ Usuario registrado:', user?.id)

            const { data: contact, error: contactError } = await supabaseClient.getClient()
                .from('contacts')
                .insert([{ phone: phone, name: name, funnel_stage: 'registered', priority: 'normal', is_ai_enabled: true, user_id: 1 }])
                .select()
                .single()
            if (contactError) {
                console.warn('⚠️ Error creando contacto:', contactError.message)
            } else {
                await supabaseClient.getClient()
                    .from('users')
                    .update({ contact_id: contact.id })
                    .eq('id', user.id)
            }
            return user
        } catch (error: any) {
            console.error('🚨 Error registrando usuario:', error.message)
            throw new Error(error.message)
        }
    }

    /** Verifica si existe contacto para phone y line. Si existe sin line_id lo adjunta (opción A) */
    async contactExistsInLine(phone: string, botNumber: string): Promise<{ exists: boolean, contactId?: string, lineId?: string }> {
        try {
            phone = this.sanitize(phone)
            botNumber = this.sanitize(botNumber)
            console.log('🔍 Verificando contacto. phone:', phone, 'botNumber:', botNumber)
            const lineId = await this.getLineIdByNumber(botNumber)
            console.log('🔍 Obtenido lineId:', lineId)
            if (!lineId) return { exists: false }

            // Buscar contacto ya asociado a la línea
            const { data, error } = await supabaseClient.getClient()
                .from('contacts')
                .select('id,line_id')
                .eq('phone', phone)
                .eq('line_id', lineId)
                .limit(1)
            if (error) {
                console.error('❌ Error consultando contacts (line match):', error.message)
                return { exists: false, lineId }
            }

            if (data && data.length > 0) {
                console.log('✅ Contacto ya ligado a la línea')
                return { exists: true, contactId: data[0].id, lineId }
            }

            // Opción A: existe contacto sin line_id -> ligarlo automáticamente
            const { data: orphanContacts, error: orphanErr } = await supabaseClient.getClient()
                .from('contacts')
                .select('id,line_id')
                .eq('phone', phone)
                .is('line_id', null)
                .limit(1)
            if (orphanErr) {
                console.error('❌ Error buscando contacto huérfano:', orphanErr.message)
                return { exists: false, lineId }
            }
            if (orphanContacts && orphanContacts.length > 0) {
                const orphanId = orphanContacts[0].id
                console.log('🔗 Asociando contacto huérfano a line_id:', lineId)
                const { error: updateErr } = await supabaseClient.getClient()
                    .from('contacts')
                    .update({ line_id: lineId })
                    .eq('id', orphanId)
                if (updateErr) {
                    console.error('❌ Error actualizando contacto huérfano:', updateErr.message)
                    return { exists: false, lineId }
                }
                return { exists: true, contactId: orphanId, lineId }
            }

            // No existe
            return { exists: false, lineId }
        } catch (e) {
            console.error('🚨 Error contactExistsInLine:', e)
            return { exists: false }
        }
    }

    /** Crea contacto si no existe */
    async getOrCreateContactInLine(phone: string, botNumber: string, name?: string): Promise<{ created: boolean, contactId: string, lineId: string }> {
        phone = this.sanitize(phone)
        botNumber = this.sanitize(botNumber)
        const lineId = await this.getLineIdByNumber(botNumber)
        if (!lineId) throw new Error('No se encontró la línea del bot')
        const { exists, contactId } = await this.contactExistsInLine(phone, botNumber)
        if (exists) return { created: false, contactId, lineId }
        const { data, error } = await supabaseClient.getClient()
            .from('contacts')
            .insert([{ line_id: lineId, phone, name: name || phone, funnel_stage: 'new', priority: 'normal', is_ai_enabled: true, user_id: 1 }])
            .select('id')
            .single()
        if (error) throw new Error(`Error creando contacto: ${error.message}`)
        return { created: true, contactId: data.id, lineId }
    }

    async existsInContext(phone: string, botNumber: string): Promise<{ contactInLine: boolean, contactId?: string, lineId?: string }> {
        const res = await this.contactExistsInLine(phone, botNumber)
        return { contactInLine: res.exists, contactId: res.contactId, lineId: res.lineId }
    }
}

export default new SupabaseAuth()