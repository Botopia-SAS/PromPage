import { createClient, SupabaseClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config()

class SupabaseConnection {
    private supabase: SupabaseClient
    
    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL as string
        const supabaseKey = process.env.SUPABASE_ANON_KEY as string
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('Missing Supabase environment variables')
        }
        
        this.supabase = createClient(supabaseUrl, supabaseKey)
    }
    
    getClient(): SupabaseClient {
        return this.supabase
    }
}

export default new SupabaseConnection()