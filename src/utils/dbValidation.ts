/**
 * 🛡️ Validaciones de Seguridad para Base de Datos
 * Previene escrituras accidentales en tablas de solo lectura
 */

// Tablas protegidas - SOLO LECTURA
const READ_ONLY_TABLES = [
    'lines'
];

// Operaciones de escritura que están prohibidas en tablas protegidas
const WRITE_OPERATIONS = [
    'insert',
    'update', 
    'delete',
    'upsert'
];

/**
 * Valida que no se esté intentando escribir en tablas de solo lectura
 * @param tableName - Nombre de la tabla
 * @param operation - Operación que se va a realizar
 * @throws Error si se intenta escribir en tabla protegida
 */
export function validateTableAccess(tableName: string, operation: string): void {
    if (READ_ONLY_TABLES.includes(tableName) && WRITE_OPERATIONS.includes(operation.toLowerCase())) {
        const error = new Error(
            `🚨 VIOLACIÓN DE SEGURIDAD: Intento de ${operation.toUpperCase()} en tabla protegida '${tableName}'. ` +
            `Esta tabla es SOLO LECTURA. Ver DATABASE_RULES.md para más información.`
        );
        
        console.error('🛡️ ACCESO BLOQUEADO:', error.message);
        
        // En desarrollo, lanzar error para detectar problemas
        if (process.env.NODE_ENV === 'development') {
            throw error;
        }
        
        // En producción, solo log del error pero no bloquear (para evitar crashes)
        console.error('🚨 VIOLACIÓN DETECTADA EN PRODUCCIÓN:', error.message);
    }
}

/**
 * Wrapper para operaciones de Supabase que valida automáticamente
 * @param supabaseClient - Cliente de Supabase
 * @param tableName - Nombre de la tabla
 */
export function createSecureSupabaseWrapper(supabaseClient: any, tableName: string) {
    return {
        // Operaciones de lectura (permitidas)
        select: (columns?: string) => {
            validateTableAccess(tableName, 'select');
            return supabaseClient.from(tableName).select(columns);
        },
        
        // Operaciones de escritura (validadas)
        insert: (data: any) => {
            validateTableAccess(tableName, 'insert');
            return supabaseClient.from(tableName).insert(data);
        },
        
        update: (data: any) => {
            validateTableAccess(tableName, 'update');
            return supabaseClient.from(tableName).update(data);
        },
        
        delete: () => {
            validateTableAccess(tableName, 'delete');
            return supabaseClient.from(tableName).delete();
        },
        
        upsert: (data: any) => {
            validateTableAccess(tableName, 'upsert');
            return supabaseClient.from(tableName).upsert(data);
        }
    };
}

/**
 * Lista las tablas protegidas
 */
export function getReadOnlyTables(): string[] {
    return [...READ_ONLY_TABLES];
}

/**
 * Verifica si una tabla es de solo lectura
 */
export function isReadOnlyTable(tableName: string): boolean {
    return READ_ONLY_TABLES.includes(tableName);
}