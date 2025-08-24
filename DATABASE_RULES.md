# 🛡️ Reglas de Acceso a Base de Datos

## ⚠️ CRÍTICO: Tablas de Solo Lectura

### 📋 Tabla `lines` - **SOLO LECTURA**
```
❌ NUNCA escribir en esta tabla
✅ Solo SELECT permitido
```

**Operaciones PROHIBIDAS:**
- ❌ INSERT
- ❌ UPDATE  
- ❌ DELETE
- ❌ UPSERT

**Operaciones PERMITIDAS:**
- ✅ SELECT

**Razón:** La tabla `lines` es gestionada externamente y contiene la configuración crítica de los bots de WhatsApp.

## 🏗️ Estructura de Bases de Datos

### 🌐 Base de Datos Principal (SUPABASE_URL)
**Tablas con acceso de escritura:**
- ✅ `contacts` - Crear y actualizar contactos
- ✅ `conversations` - Guardar historial de conversaciones  
- ✅ `users` - Registro de usuarios (tabla principal)

**Tablas de solo lectura:**
- ⚠️ `lines` - **SOLO LECTURA** - Configuración de bots

### 📊 Base de Datos Adicional (USERS_SUPABASE_URL) 
**Tablas con acceso de escritura:**
- ✅ `users` - Usuarios con suscripciones
- ✅ `pages` - Páginas web generadas
- ✅ `plans` - Planes de suscripción
- ✅ `payments` - Registro de pagos

## 🔍 Verificación de Accesos

Para verificar que no escribimos en tablas prohibidas:

```bash
# Buscar escrituras en tabla 'lines'
grep -r "\.insert.*lines\|\.update.*lines\|\.delete.*lines" src/

# Buscar accesos a tabla 'lines'  
grep -r "\.from('lines')" src/
```

## 📝 Ejemplos de Uso Correcto

### ✅ Correcto - Solo lectura de 'lines'
```typescript
const { data } = await supabase
  .from('lines')
  .select('id')
  .eq('number', botNumber)
  .single();
```

### ❌ Incorrecto - Escritura en 'lines'
```typescript
// ¡NUNCA HACER ESTO!
await supabase
  .from('lines')
  .insert({ number: '123', provider: 'whatsapp' });
```

## 🚨 En Caso de Violación

Si necesitas modificar la tabla `lines`:
1. **DETENER** - Esta tabla es gestionada externamente
2. **CONTACTAR** al administrador de la infraestructura
3. **NO** modificar directamente desde el código de la aplicación

---
**Fecha de creación:** 2024-08-24  
**Última actualización:** 2024-08-24