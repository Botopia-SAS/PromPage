import { createClient, SupabaseClient } from '@supabase/supabase-js';

interface UserData {
    id?: string;
    contact_id?: string;
    name: string;
    email: string;
    created_at?: string;
    updated_at?: string;
    plan_id?: string;
    tokens: number;
}

interface PlanData {
    id: string;
    plan_name: 'Free' | 'Basic' | 'Pro' | 'Business';
    tokens: number;
    price: number;
}

interface PageData {
    id?: string;
    user_id: string;
    title: string;
    description?: string;
    content: string;
    images?: any;
    logo?: string;
    requirements?: string;
    public_link?: string;
    status: 'Active' | 'Inactive' | 'Draft';
    created_at?: string;
    updated_at?: string;
}

interface PaymentData {
    id?: string; // id del pago (UUID propio de la fila)
    user_id?: string; // referencia al usuario
    contact_id?: string; // referencia alternativa
    amount: number;
    currency: string;
    status: 'Pending' | 'Completed' | 'Failed';
    description: string;
    dlo_payment_id: string; // id / token del proveedor (dLocal / DLO)
    plan_id?: string;
    subscription_id?: string;
    subscription_token?: string;
    created_at?: string;
}

class UsersDatabase {
    private usersSupabase: SupabaseClient;
    private mainSupabase: SupabaseClient;

    constructor() {
        // Base de datos adicional (users, pages, plans, payments)
        const usersSupabaseUrl = process.env.USERS_SUPABASE_URL;
        const usersSupabaseKey = process.env.USERS_SUPABASE_KEY;

        if (!usersSupabaseUrl || !usersSupabaseKey) {
            throw new Error('Faltan las credenciales para la base de datos de usuarios');
        }

        this.usersSupabase = createClient(usersSupabaseUrl, usersSupabaseKey);

        // Base de datos principal (contacts)
        const mainSupabaseUrl = process.env.SUPABASE_URL;
        const mainSupabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!mainSupabaseUrl || !mainSupabaseKey) {
            throw new Error('Faltan las credenciales para la base de datos principal');
        }

        this.mainSupabase = createClient(mainSupabaseUrl, mainSupabaseKey);
    }

    // Método auxiliar para obtener line_id del bot
    // ⚠️ IMPORTANTE: Tabla 'lines' es SOLO LECTURA - NO escribir nunca en esta tabla
    async getLineIdByBotNumber(botNumber: string): Promise<string | null> {
        try {
            console.log('🔍 Obteniendo line_id para BOT_NUMBER:', botNumber);

            // SOLO SELECT - NO INSERT/UPDATE/DELETE en tabla 'lines'
            const { data: line, error: lineError } = await this.mainSupabase
                .from('lines')
                .select('id')
                .eq('number', botNumber)
                .eq('is_active', true)
                .single();

            if (lineError) {
                console.error('❌ Error obteniendo line_id:', lineError);
                return null;
            }

            console.log('✅ Line_id obtenido:', line.id);
            return line.id;

        } catch (error: any) {
            console.error('❌ Error inesperado obteniendo line_id:', error);
            return null;
        }
    }

    // Método auxiliar para obtener UUID del contacto por número de teléfono y line_id
    async getContactUuidByPhone(phoneNumber: string): Promise<string | null> {
        try {
            console.log('🔍 Obteniendo UUID de contacto para:', phoneNumber);

            // Primero obtener el line_id del bot
            const botNumber = process.env.BOT_NUMBER || '573138381310';
            const lineId = await this.getLineIdByBotNumber(botNumber);
            
            if (!lineId) {
                console.error('❌ No se pudo obtener line_id para el bot');
                return null;
            }

            // Buscar contacto específico de esta línea/bot
            const { data: contacts, error: contactError } = await this.mainSupabase
                .from('contacts')
                .select('id, line_id, created_at')
                .eq('phone', phoneNumber)
                .eq('line_id', lineId) // Filtrar por line_id específico
                .order('created_at', { ascending: false })
                .limit(1);

            if (contactError) {
                console.error('❌ Error obteniendo UUID de contacto:', contactError);
                return null;
            }

            if (!contacts || contacts.length === 0) {
                console.log('ℹ️ No se encontró contacto para número y line_id:', phoneNumber, lineId);
                return null;
            }

            const contact = contacts[0];
            console.log('✅ UUID de contacto obtenido:', contact.id, 'para line_id:', lineId);

            return contact.id;

        } catch (error: any) {
            console.error('❌ Error inesperado obteniendo UUID de contacto:', error);
            return null;
        }
    }

    async createUser(userData: {
        name: string;
        email: string;
        contact_id?: string;
        plan_id?: string;
        tokens?: number;
    }): Promise<{ success: boolean; user?: UserData; error?: string }> {
        try {
            console.log('🔄 Creando usuario en base de datos adicional...');
            
            const userToInsert: Partial<UserData> = {
                name: userData.name,
                email: userData.email,
                contact_id: userData.contact_id,
                plan_id: userData.plan_id,
                tokens: userData.tokens || 0,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.usersSupabase
                .from('users')
                .insert(userToInsert)
                .select()
                .single();

            if (error) {
                console.error('❌ Error al crear usuario:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Usuario creado exitosamente:', data);
            return { success: true, user: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al crear usuario:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserByContactId(phoneNumber: string): Promise<{ success: boolean; user?: UserData; error?: string }> {
        try {
            console.log('🔍 Buscando usuario por número de teléfono:', phoneNumber);

            // Primero obtener el line_id del bot
            const botNumber = process.env.BOT_NUMBER || '573138381310';
            const lineId = await this.getLineIdByBotNumber(botNumber);
            
            if (!lineId) {
                console.error('❌ No se pudo obtener line_id para el bot');
                return { success: false, error: 'Error obteniendo configuración del bot' };
            }

            // Obtener el contact_id (UUID) de la tabla contacts filtrando por phone Y line_id
            const { data: contacts, error: contactError } = await this.mainSupabase
                .from('contacts')
                .select('id, line_id')
                .eq('phone', phoneNumber)
                .eq('line_id', lineId) // Filtrar por line_id específico del bot
                .order('created_at', { ascending: false })
                .limit(1);

            if (contactError) {
                console.error('❌ Error al buscar contacto:', contactError);
                return { success: false, error: contactError.message };
            }

            if (!contacts || contacts.length === 0) {
                console.log('ℹ️ Contacto no encontrado para número y line_id:', phoneNumber, lineId);
                return { success: true, user: undefined };
            }

            const contact = contacts[0];
            console.log('✅ Contacto encontrado:', contact.id, 'para line_id:', lineId);

            // Ahora buscar el usuario usando el contact_id (UUID)
            const { data, error } = await this.usersSupabase
                .from('users')
                .select('*')
                .eq('contact_id', contact.id)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    console.log('ℹ️ Usuario no encontrado para contact_id:', contact.id);
                    return { success: true, user: undefined };
                }
                console.error('❌ Error al buscar usuario:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Usuario encontrado:', data);
            return { success: true, user: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al buscar usuario:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserTokens(userId: string, tokens: number): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`🔄 Actualizando tokens del usuario ${userId} a ${tokens}...`);

            const { error } = await this.usersSupabase
                .from('users')
                .update({ 
                    tokens,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            if (error) {
                console.error('❌ Error al actualizar tokens:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Tokens actualizados exitosamente');
            return { success: true };

        } catch (error: any) {
            console.error('❌ Error inesperado al actualizar tokens:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserTokens(contactId: string): Promise<{ success: boolean; tokens?: number; error?: string }> {
        try {
            const result = await this.getUserByContactId(contactId);
            
            if (!result.success) {
                return { success: false, error: result.error };
            }

            if (!result.user) {
                return { success: true, tokens: 0 }; // Usuario nuevo, 0 tokens
            }

            return { success: true, tokens: result.user.tokens };

        } catch (error: any) {
            console.error('❌ Error inesperado al obtener tokens:', error);
            return { success: false, error: error.message };
        }
    }

    // Métodos para manejo de páginas
    async createPage(pageData: Omit<PageData, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; page?: PageData; error?: string }> {
        try {
            console.log('🔄 Creando página en base de datos...');
            
            const pageToInsert = {
                ...pageData,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.usersSupabase
                .from('pages')
                .insert(pageToInsert)
                .select()
                .single();

            if (error) {
                console.error('❌ Error al crear página:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Página creada exitosamente:', data);
            return { success: true, page: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al crear página:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserPagesCount(userId: string): Promise<{ success: boolean; count?: number; error?: string }> {
        try {
            console.log(`🔍 Contando páginas del usuario ${userId}...`);

            const { error, count } = await this.usersSupabase
                .from('pages')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', userId);

            if (error) {
                console.error('❌ Error al contar páginas:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Páginas contadas exitosamente:', count);
            return { success: true, count: count || 0 };

        } catch (error: any) {
            console.error('❌ Error inesperado al contar páginas:', error);
            return { success: false, error: error.message };
        }
    }

    // Métodos para manejo de planes
    async getAllPlans(): Promise<{ success: boolean; plans?: PlanData[]; error?: string }> {
        try {
            console.log('🔍 Obteniendo todos los planes...');

            const { data, error } = await this.usersSupabase
                .from('plans')
                .select('*')
                .order('price', { ascending: true });

            if (error) {
                console.error('❌ Error al obtener planes:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Planes obtenidos exitosamente:', data);
            return { success: true, plans: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al obtener planes:', error);
            return { success: false, error: error.message };
        }
    }

    async getUserPlan(contactId: string): Promise<{ success: boolean; plan?: PlanData; error?: string }> {
        try {
            console.log(`🔍 Obteniendo plan del usuario ${contactId}...`);

            const userResult = await this.getUserByContactId(contactId);
            if (!userResult.success || !userResult.user) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            if (!userResult.user.plan_id) {
                // Usuario sin plan asignado, retornar plan gratuito por defecto
                return { success: true, plan: { id: 'free', plan_name: 'Free', tokens: 1, price: 0 } };
            }

            const { data, error } = await this.usersSupabase
                .from('plans')
                .select('*')
                .eq('id', userResult.user.plan_id)
                .single();

            if (error) {
                console.error('❌ Error al obtener plan:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Plan obtenido exitosamente:', data);
            return { success: true, plan: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al obtener plan:', error);
            return { success: false, error: error.message };
        }
    }

    // Métodos para verificación de límites
    async canCreatePage(contactId: string): Promise<{ success: boolean; canCreate?: boolean; remainingPages?: number; planName?: string; error?: string }> {
        try {
            console.log(`🔍 Verificando si usuario ${contactId} puede crear página...`);

            const userResult = await this.getUserByContactId(contactId);
            if (!userResult.success || !userResult.user) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            const planResult = await this.getUserPlan(contactId);
            if (!planResult.success || !planResult.plan) {
                return { success: false, error: 'Plan de usuario no encontrado' };
            }

            const pagesResult = await this.getUserPagesCount(userResult.user.id!);
            if (!pagesResult.success) {
                return { success: false, error: pagesResult.error };
            }

            const currentPages = pagesResult.count || 0;
            const maxPages = planResult.plan.tokens; // tokens representa el límite de páginas
            const canCreate = currentPages < maxPages;
            const remainingPages = Math.max(0, maxPages - currentPages);

            console.log(`✅ Verificación completada: ${canCreate ? 'Puede crear' : 'No puede crear'} (${currentPages}/${maxPages})`);
            
            return {
                success: true,
                canCreate,
                remainingPages,
                planName: planResult.plan.plan_name
            };

        } catch (error: any) {
            console.error('❌ Error inesperado verificando límites:', error);
            return { success: false, error: error.message };
        }
    }

    // Métodos para manejo de pagos
    async createPaymentRecord(paymentData: Omit<PaymentData, 'id' | 'created_at'>): Promise<{ success: boolean; payment?: PaymentData; error?: string }> {
        // DEBUG: imprimir campos recibidos
        console.log('🧪 createPaymentRecord payload recibido:', paymentData);
        try {
            console.log('🔄 Creando registro de pago...');
            
            const paymentToInsert = {
                ...paymentData,
                created_at: new Date().toISOString()
            };

            const { data, error } = await this.usersSupabase
                .from('payments')
                .insert(paymentToInsert)
                .select()
                .single();

            console.log('🧪 Resultado insert payments:', { data, error });

            if (error) {
                console.error('❌ Error al crear registro de pago:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Registro de pago creado exitosamente:', data);
            return { success: true, payment: data };

        } catch (error: any) {
            console.error('❌ Error inesperado al crear registro de pago:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyPaymentStatus(userId: string): Promise<{ success: boolean; status?: string; payment?: any; source?: string; error?: string }> {
        try {
            console.log(`🔍 Verificando estado de pago para userId: ${userId}`);
            
            // Intento 1: buscar por user_id
            let source = 'user_id';
            const { data: initialData, error } = await this.usersSupabase
                .from('payments')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(1);
            let data = initialData;

            if (error) {
                console.error('❌ Error (user_id) al verificar estado de pago:', error);
            }

            if (!data || data.length === 0) {
                console.log('ℹ️ Sin filas por user_id. Probando fallback por id (legacy schema)...');
                source = 'id';
                const fallback = await this.usersSupabase
                    .from('payments')
                    .select('*')
                    .eq('id', userId)
                    .order('created_at', { ascending: false })
                    .limit(1);
                if (fallback.error) {
                    console.error('❌ Error (id fallback) al verificar estado de pago:', fallback.error);
                } else {
                    data = fallback.data || [];
                }
            }

            if (!data || data.length === 0) {
                console.log('ℹ️ Sin filas por id. Probando fallback por contact_id...');
                source = 'contact_id';
                // Obtener contact_id desde users
                const userRes = await this.usersSupabase.from('users').select('id, contact_id').eq('id', userId).single();
                if (!userRes.error && userRes.data?.contact_id) {
                    const fb2 = await this.usersSupabase
                        .from('payments')
                        .select('*')
                        .eq('contact_id', userRes.data.contact_id)
                        .order('created_at', { ascending: false })
                        .limit(1);
                    if (!fb2.error) data = fb2.data || [];
                }
            }

            if (!data || data.length === 0) {
                console.log('❌ No se encontraron pagos para este usuario (tras todos los fallbacks)');
                return { success: false, error: 'No payments found after fallbacks' };
            }

            const latestPayment = data[0];
            console.log(`✅ Estado de pago encontrado (${source}): ${latestPayment.status}`);

            return {
                success: true,
                status: latestPayment.status,
                payment: latestPayment,
                source
            };
            
        } catch (error: any) {
            console.error('❌ Error inesperado verificando estado de pago:', error);
            return { success: false, error: error.message };
        }
    }

    async updateUserPlan(contactId: string, planId: string): Promise<{ success: boolean; error?: string }> {
        try {
            console.log(`🔄 Actualizando plan del usuario ${contactId} a ${planId}...`);

            const userResult = await this.getUserByContactId(contactId);
            if (!userResult.success || !userResult.user) {
                return { success: false, error: 'Usuario no encontrado' };
            }

            const { error } = await this.usersSupabase
                .from('users')
                .update({ 
                    plan_id: planId,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userResult.user.id);

            if (error) {
                console.error('❌ Error al actualizar plan:', error);
                return { success: false, error: error.message };
            }

            console.log('✅ Plan actualizado exitosamente');
            return { success: true };

        } catch (error: any) {
            console.error('❌ Error inesperado al actualizar plan:', error);
            return { success: false, error: error.message };
        }
    }
}

export default new UsersDatabase();